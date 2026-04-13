import type { ResolvedEndpoint } from "./endpoint-resolver";

export interface TransformResult<T> {
  data: T[];
  pagination?: {
    hasMore: boolean;
    nextCursor?: string;
    totalCount?: number;
  };
  errors: Array<{
    index: number;
    field: string;
    message: string;
    rawValue: unknown;
  }>;
}

export class DataTransformer {
  transformResponse<T extends Record<string, unknown>>(
    rawResponse: unknown,
    endpoint: ResolvedEndpoint,
    options: {
      arrayPath?: string;
      paginationPaths?: {
        hasMore?: string;
        nextCursor?: string;
        totalCount?: string;
      };
    } = {}
  ): TransformResult<T> {
    const errors: TransformResult<T>['errors'] = [];
    
    const rawItems = this.extractArray(rawResponse, options.arrayPath);
    
    const transformedData: T[] = [];
    
    for (let i = 0; i < rawItems.length; i++) {
      const rawItem = rawItems[i];
      try {
        const transformed = this.transformItem<T>(rawItem, endpoint.fieldMappings, i, errors);
        transformedData.push(transformed);
      } catch (error) {
        errors.push({
          index: i,
          field: '_root',
          message: error instanceof Error ? error.message : 'Unknown transformation error',
          rawValue: rawItem,
        });
      }
    }

    const pagination = this.extractPagination(rawResponse, endpoint, options.paginationPaths);

    return {
      data: transformedData,
      pagination,
      errors,
    };
  }

  private extractArray(response: unknown, arrayPath?: string): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (!arrayPath && typeof response === 'object' && response !== null) {
      const obj = response as Record<string, unknown>;
      
      const commonPaths = ['data', 'items', 'results', 'records', 'attendees', 'events', 'sessions', 'orders', 'registrants'];
      for (const path of commonPaths) {
        if (Array.isArray(obj[path])) {
          return obj[path] as unknown[];
        }
      }
    }

    if (arrayPath) {
      const value = this.getNestedValue(response, arrayPath);
      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }

  private transformItem<T extends Record<string, unknown>>(
    rawItem: unknown,
    fieldMappings: Record<string, { sourcePath: string; transform?: string; defaultValue?: string }>,
    index: number,
    errors: TransformResult<T>['errors']
  ): T {
    const result: Record<string, unknown> = {};

    for (const [targetField, mapping] of Object.entries(fieldMappings)) {
      try {
        let value = this.getNestedValue(rawItem, mapping.sourcePath);

        if (mapping.transform) {
          value = this.applyTransform(value, mapping.transform);
        }

        if (value === undefined || value === null) {
          value = mapping.defaultValue;
        }

        result[targetField] = value;
      } catch (error) {
        errors.push({
          index,
          field: targetField,
          message: error instanceof Error ? error.message : 'Transformation failed',
          rawValue: this.getNestedValue(rawItem, mapping.sourcePath),
        });
        result[targetField] = mapping.defaultValue;
      }
    }

    return result as T;
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }

    if (path.includes(' + ')) {
      const paths = path.split(' + ').map(p => p.trim());
      const values = paths.map(p => this.getNestedValue(obj, p)).filter(Boolean);
      return values.join(' ').trim() || undefined;
    }

    const arrayMatch = path.match(/^(.+?)\[(\d+)\](.*)$/);
    if (arrayMatch) {
      const [, arrayPath, indexStr, rest] = arrayMatch;
      const array = this.getNestedValue(obj, arrayPath);
      if (!Array.isArray(array)) {
        return undefined;
      }
      const index = parseInt(indexStr, 10);
      const item = array[index];
      if (rest && rest.startsWith('.')) {
        return this.getNestedValue(item, rest.slice(1));
      }
      return item;
    }

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private applyTransform(value: unknown, transform: string): unknown {
    switch (transform) {
      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value;
      
      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value;
      
      case 'trim':
        return typeof value === 'string' ? value.trim() : value;
      
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          return ['true', 'yes', '1', 'on'].includes(value.toLowerCase());
        }
        return Boolean(value);
      
      case 'number':
        const num = Number(value);
        return isNaN(num) ? undefined : num;
      
      case 'string':
        return value === null || value === undefined ? undefined : String(value);
      
      case 'date':
        if (!value) return undefined;
        const date = new Date(value as string);
        return isNaN(date.getTime()) ? undefined : date.toISOString();
      
      case 'json':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      
      default:
        if (transform.startsWith('default:')) {
          return value ?? transform.slice(8);
        }
        if (transform.startsWith('format:')) {
          return value;
        }
        return value;
    }
  }

  private extractPagination(
    response: unknown,
    endpoint: ResolvedEndpoint,
    customPaths?: {
      hasMore?: string;
      nextCursor?: string;
      totalCount?: string;
    }
  ): TransformResult<unknown>['pagination'] {
    if (!endpoint.pagination) {
      return undefined;
    }

    const result: NonNullable<TransformResult<unknown>['pagination']> = {
      hasMore: false,
    };

    const hasMorePath = customPaths?.hasMore || 'pagination.has_more';
    const nextCursorPath = customPaths?.nextCursor || 'pagination.continuation';
    const totalCountPath = customPaths?.totalCount || 'pagination.total_count';

    const hasMoreValue = this.getNestedValue(response, hasMorePath);
    if (typeof hasMoreValue === 'boolean') {
      result.hasMore = hasMoreValue;
    }

    const nextCursor = this.getNestedValue(response, nextCursorPath);
    if (nextCursor !== undefined && nextCursor !== null) {
      result.nextCursor = String(nextCursor);
      result.hasMore = true;
    }

    const totalCount = this.getNestedValue(response, totalCountPath);
    if (typeof totalCount === 'number') {
      result.totalCount = totalCount;
    }

    return result;
  }

  transformAttendee(rawAttendee: unknown, fieldMappings: Record<string, { sourcePath: string; transform?: string; defaultValue?: string }>): {
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    title?: string;
    participantType?: string;
    customFields?: Record<string, string>;
    externalId?: string;
    checkedIn?: boolean;
  } {
    const errors: TransformResult<Record<string, unknown>>['errors'] = [];
    const transformed = this.transformItem<Record<string, unknown>>(rawAttendee, fieldMappings, 0, errors);

    const nameValue = transformed.name as string | undefined;
    let firstName = transformed.firstName as string | undefined;
    let lastName = transformed.lastName as string | undefined;

    if (nameValue && (!firstName || !lastName)) {
      const nameParts = nameValue.split(/\s+/);
      firstName = firstName || nameParts[0] || '';
      lastName = lastName || nameParts.slice(1).join(' ') || '';
    }

    return {
      firstName: firstName || '',
      lastName: lastName || '',
      email: (transformed.email as string) || '',
      company: transformed.company as string | undefined,
      title: transformed.title as string | undefined,
      participantType: transformed.ticketType as string | undefined,
      externalId: (transformed.id as string) || undefined,
      checkedIn: transformed.checkedIn as boolean | undefined,
      customFields: transformed.customFields as Record<string, string> | undefined,
    };
  }

  transformEvent(rawEvent: unknown, fieldMappings: Record<string, { sourcePath: string; transform?: string; defaultValue?: string }>): {
    name: string;
    code?: string;
    externalId: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  } {
    const errors: TransformResult<Record<string, unknown>>['errors'] = [];
    const transformed = this.transformItem<Record<string, unknown>>(rawEvent, fieldMappings, 0, errors);

    return {
      name: (transformed.name as string) || 'Unnamed Event',
      code: transformed.eventCode as string | undefined,
      externalId: (transformed.id as string) || '',
      startDate: transformed.startDate as string | undefined,
      endDate: transformed.endDate as string | undefined,
      status: transformed.status as string | undefined,
    };
  }

  transformSession(rawSession: unknown, fieldMappings: Record<string, { sourcePath: string; transform?: string; defaultValue?: string }>): {
    name: string;
    externalId: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    capacity?: number;
    track?: string;
  } {
    const errors: TransformResult<Record<string, unknown>>['errors'] = [];
    const transformed = this.transformItem<Record<string, unknown>>(rawSession, fieldMappings, 0, errors);

    return {
      name: (transformed.name as string) || 'Unnamed Session',
      externalId: (transformed.id as string) || '',
      startTime: transformed.startTime as string | undefined,
      endTime: transformed.endTime as string | undefined,
      location: transformed.location as string | undefined,
      capacity: transformed.capacity as number | undefined,
      track: transformed.track as string | undefined,
    };
  }
}

export const dataTransformer = new DataTransformer();
