import { 
  INTEGRATION_PROVIDERS, 
  getProviderSpec, 
  type IntegrationProviderSpec,
  type DataType,
  type EndpointSpec,
  type PaginationType
} from "../../shared/integration-providers";
import type { 
  CustomerIntegration, 
  IntegrationEndpointConfig,
  EventCodeMapping 
} from "@shared/schema";

export interface ResolvedEndpoint {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  pagination: {
    type: PaginationType;
    limitParam?: string;
    limitDefault?: number;
    limitMax?: number;
    cursorParam?: string;
    pageParam?: string;
    offsetParam?: string;
  } | null;
  rateLimit: {
    requestsPerMinute: number;
    burstSize?: number;
  } | null;
  fieldMappings: Record<string, {
    sourcePath: string;
    transform?: string;
    defaultValue?: string;
  }>;
}

export interface EndpointContext {
  eventId?: string;
  eventCode?: string;
  externalEventId?: string;
  sessionId?: string;
  externalSessionId?: string;
  additionalVariables?: Record<string, string>;
  filters?: Record<string, string>;
}

export class EndpointResolver {
  resolveEndpoint(
    integration: CustomerIntegration,
    dataType: DataType,
    endpointConfig: IntegrationEndpointConfig | null,
    context: EndpointContext = {}
  ): ResolvedEndpoint {
    const providerSpec = getProviderSpec(integration.providerId);
    if (!providerSpec) {
      throw new Error(`Unknown provider: ${integration.providerId}`);
    }

    const dataTypeSpec = providerSpec.dataTypes[dataType];
    if (!dataTypeSpec) {
      throw new Error(`Provider ${providerSpec.name} does not support ${dataType} data type`);
    }

    const providerEndpoint = dataTypeSpec.endpoint;

    let path = endpointConfig?.pathOverride || providerEndpoint.path;

    const allVariables: Record<string, string> = {
      ...(endpointConfig?.variableOverrides || {}),
      ...context.additionalVariables,
    };

    if (context.externalEventId) {
      allVariables.eventId = context.externalEventId;
    }
    if (context.externalSessionId) {
      allVariables.sessionId = context.externalSessionId;
    }

    path = this.substituteVariables(path, allVariables);

    const baseUrl = integration.baseUrl || providerSpec.baseUrlTemplate;
    const fullUrl = this.buildFullUrl(baseUrl, path, context.filters, endpointConfig?.filterDefaults as Record<string, string> || {});

    const headers = this.buildHeaders(
      providerSpec,
      integration,
      endpointConfig?.headerOverrides as Record<string, string> || {}
    );

    const pagination = this.resolvePagination(
      providerEndpoint.pagination,
      endpointConfig?.paginationOverrides as IntegrationEndpointConfig['paginationOverrides']
    );

    const fieldMappings = this.resolveFieldMappings(
      dataTypeSpec.fieldMappings,
      endpointConfig?.fieldMappingOverrides as Record<string, { sourcePath: string; transform?: string; defaultValue?: string }> || {}
    );

    return {
      url: fullUrl,
      method: providerEndpoint.method,
      headers,
      pagination,
      rateLimit: providerEndpoint.rateLimit || null,
      fieldMappings,
    };
  }

  private substituteVariables(path: string, variables: Record<string, string>): string {
    let result = path;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(value));
    }

    const unresolvedVars = result.match(/\{[a-zA-Z_]+\}/g);
    if (unresolvedVars && unresolvedVars.length > 0) {
      throw new Error(`Unresolved variables in path: ${unresolvedVars.join(', ')}`);
    }

    return result;
  }

  private buildFullUrl(
    baseUrl: string,
    path: string,
    filters?: Record<string, string>,
    filterDefaults?: Record<string, string>
  ): string {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    let url = `${normalizedBase}${normalizedPath}`;

    const allFilters = {
      ...filterDefaults,
      ...filters,
    };

    if (Object.keys(allFilters).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(allFilters)) {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value);
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  private buildHeaders(
    providerSpec: IntegrationProviderSpec,
    integration: CustomerIntegration,
    headerOverrides: Record<string, string>
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (providerSpec.authType === 'bearerToken' && providerSpec.bearerTokenConfig) {
      headers[providerSpec.bearerTokenConfig.headerName] = `${providerSpec.bearerTokenConfig.prefix || 'Bearer'} {{ACCESS_TOKEN}}`;
    } else if (providerSpec.authType === 'apiKey' && providerSpec.apiKeyConfig) {
      const prefix = providerSpec.apiKeyConfig.prefix ? `${providerSpec.apiKeyConfig.prefix} ` : '';
      headers[providerSpec.apiKeyConfig.headerName] = `${prefix}{{API_KEY}}`;
    } else if (providerSpec.authType === 'oauth2') {
      headers['Authorization'] = 'Bearer {{ACCESS_TOKEN}}';
    }

    return {
      ...headers,
      ...headerOverrides,
    };
  }

  private resolvePagination(
    providerPagination?: EndpointSpec['pagination'],
    overrides?: IntegrationEndpointConfig['paginationOverrides']
  ): ResolvedEndpoint['pagination'] {
    if (!providerPagination) {
      return null;
    }

    return {
      type: (overrides?.type as PaginationType) || providerPagination.type,
      limitParam: overrides?.limitParam || providerPagination.limitParam,
      limitDefault: overrides?.limitDefault || providerPagination.limitDefault,
      limitMax: providerPagination.limitMax,
      cursorParam: overrides?.cursorParam || providerPagination.cursorParam,
      pageParam: providerPagination.pageParam,
      offsetParam: providerPagination.offsetParam,
    };
  }

  private resolveFieldMappings(
    providerMappings: Record<string, { sourcePath: string; description: string; example?: string } | undefined>,
    overrides: Record<string, { sourcePath: string; transform?: string; defaultValue?: string }>
  ): Record<string, { sourcePath: string; transform?: string; defaultValue?: string }> {
    const result: Record<string, { sourcePath: string; transform?: string; defaultValue?: string }> = {};

    for (const [field, mapping] of Object.entries(providerMappings)) {
      if (mapping) {
        if (overrides[field]) {
          result[field] = overrides[field];
        } else {
          result[field] = { sourcePath: mapping.sourcePath };
        }
      }
    }

    for (const [field, mapping] of Object.entries(overrides)) {
      if (!result[field]) {
        result[field] = mapping;
      }
    }

    return result;
  }

  getAvailableFilters(providerId: string, dataType: DataType): string[] {
    const providerSpec = getProviderSpec(providerId);
    if (!providerSpec) {
      return [];
    }

    const dataTypeSpec = providerSpec.dataTypes[dataType];
    if (!dataTypeSpec) {
      return [];
    }

    return dataTypeSpec.endpoint.filters || [];
  }

  getRequiredVariables(providerId: string, dataType: DataType): string[] {
    const providerSpec = getProviderSpec(providerId);
    if (!providerSpec) {
      return [];
    }

    const dataTypeSpec = providerSpec.dataTypes[dataType];
    if (!dataTypeSpec) {
      return [];
    }

    return dataTypeSpec.endpoint.variables || [];
  }

  getVariableDescriptions(providerId: string): Record<string, string> {
    const providerSpec = getProviderSpec(providerId);
    if (!providerSpec) {
      return {};
    }

    return providerSpec.variableDescriptions;
  }

  getDefaultFieldMappings(providerId: string, dataType: DataType): Record<string, string> {
    const providerSpec = getProviderSpec(providerId);
    if (!providerSpec) {
      return {};
    }

    const dataTypeSpec = providerSpec.dataTypes[dataType];
    if (!dataTypeSpec) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [field, mapping] of Object.entries(dataTypeSpec.fieldMappings)) {
      if (mapping) {
        result[field] = mapping.sourcePath;
      }
    }
    return result;
  }

  getTestEndpoint(providerId: string): { path: string; method: "GET" | "POST"; expectedStatus: number } | null {
    const providerSpec = getProviderSpec(providerId);
    if (!providerSpec || !providerSpec.testEndpoint) {
      return null;
    }
    return providerSpec.testEndpoint;
  }

  getSupportedDataTypes(providerId: string): DataType[] {
    const providerSpec = getProviderSpec(providerId);
    if (!providerSpec) {
      return [];
    }

    return Object.keys(providerSpec.dataTypes) as DataType[];
  }
}

export const endpointResolver = new EndpointResolver();
