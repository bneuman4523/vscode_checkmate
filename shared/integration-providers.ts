import { z } from "zod";

export const DataTypeEnum = z.enum(["events", "attendees", "sessions"]);
export type DataType = z.infer<typeof DataTypeEnum>;

export const PaginationTypeEnum = z.enum(["offset", "cursor", "page", "link"]);
export type PaginationType = z.infer<typeof PaginationTypeEnum>;

export const AuthTypeEnum = z.enum(["oauth2", "apiKey", "bearerToken", "basic"]);
export type AuthType = z.infer<typeof AuthTypeEnum>;

export interface IncrementalFilterSpec {
  /** Query parameter name (e.g. 'filterBy', 'modifiedSince') */
  paramName: string;
  /** Filter expression with {timestamp} placeholder (e.g. 'dateModified_after::{timestamp}') */
  filterExpression: string;
  /** Timestamp format identifier — the sync orchestrator uses this to pick the right formatter */
  timestampFormat: 'certain' | 'iso8601' | 'unix';
}

export interface EndpointSpec {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  description: string;
  variables: string[];
  filters?: string[];
  /** Provider-defined incremental sync filter. When present, the sync orchestrator
   *  auto-appends this filter to API requests if a lastSyncTimestamp is available. */
  incrementalFilter?: IncrementalFilterSpec;
  pagination?: {
    type: PaginationType;
    limitParam?: string;
    limitDefault?: number;
    limitMax?: number;
    offsetParam?: string;
    cursorParam?: string;
    pageParam?: string;
    nextLinkPath?: string;
  };
  headers?: Record<string, string>;
  rateLimit?: {
    requestsPerMinute: number;
    burstSize?: number;
  };
}

export interface FieldMapping {
  sourcePath: string;
  description: string;
  example?: string;
}

export interface DataTypeSpec {
  endpoint: EndpointSpec;
  fieldMappings: {
    id: FieldMapping;
    name?: FieldMapping;
    email?: FieldMapping;
    status?: FieldMapping;
    checkedIn?: FieldMapping;
    registrationDate?: FieldMapping;
    ticketType?: FieldMapping;
    customFields?: FieldMapping;
    [key: string]: FieldMapping | undefined;
  };
}

export interface IntegrationProviderSpec {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  websiteUrl: string;
  docsUrl: string;
  authType: AuthType;
  baseUrlTemplate: string;
  oauth2Config?: {
    authorizationUrl: string;
    tokenUrl: string;
    revokeUrl?: string;
    scope: string;
    grantType: "authorization_code" | "client_credentials";
    usePKCE?: boolean;
  };
  apiKeyConfig?: {
    headerName: string;
    prefix?: string;
  };
  bearerTokenConfig?: {
    headerName: string;
    prefix?: string;
  };
  basicAuthConfig?: {
    usernameField?: string;
    passwordField?: string;
  };
  dataTypes: {
    events?: DataTypeSpec;
    attendees?: DataTypeSpec;
    sessions?: DataTypeSpec;
  };
  variableDescriptions: Record<string, string>;
  testEndpoint?: {
    path: string;
    method: "GET" | "POST";
    expectedStatus: number;
  };
}

export const INTEGRATION_PROVIDERS: Record<string, IntegrationProviderSpec> = {
  // ========================================================================
  // HIDDEN PROVIDERS - Commented out for now, can be re-enabled later
  // ========================================================================

  /*
  eventbrite: {
    id: "eventbrite",
    name: "Eventbrite",
    description: "Global event management and ticketing platform",
    websiteUrl: "https://www.eventbrite.com",
    docsUrl: "https://www.eventbrite.com/platform/api",
    authType: "oauth2",
    baseUrlTemplate: "https://www.eventbriteapi.com/v3",
    oauth2Config: {
      authorizationUrl: "https://www.eventbrite.com/oauth/authorize",
      tokenUrl: "https://www.eventbrite.com/oauth/token",
      revokeUrl: "https://www.eventbrite.com/oauth/revoke",
      scope: "read:events read:attendees",
      grantType: "authorization_code",
      usePKCE: false,
    },
    dataTypes: {
      events: {
        endpoint: {
          path: "/users/{accountId}/events/",
          method: "GET",
          description: "List all events for the authenticated user",
          variables: ["accountId"],
          filters: ["status", "order_by", "time_filter", "venue_filter"],
          pagination: {
            type: "cursor",
            limitParam: "page_size",
            limitDefault: 50,
            limitMax: 100,
            cursorParam: "continuation",
          },
          rateLimit: {
            requestsPerMinute: 1000,
            burstSize: 100,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Eventbrite event ID" },
          name: { sourcePath: "name.text", description: "Event name" },
          status: { sourcePath: "status", description: "Event status (draft, live, started, ended, canceled)" },
          startDate: { sourcePath: "start.utc", description: "Event start date/time (UTC)" },
          endDate: { sourcePath: "end.utc", description: "Event end date/time (UTC)" },
          venue: { sourcePath: "venue_id", description: "Venue ID" },
          capacity: { sourcePath: "capacity", description: "Event capacity" },
        },
      },
      attendees: {
        endpoint: {
          path: "/events/{eventId}/attendees/",
          method: "GET",
          description: "List all attendees for an event",
          variables: ["eventId"],
          filters: ["status", "changed_since", "last_item_seen", "attendee_ids"],
          pagination: {
            type: "cursor",
            limitParam: "page_size",
            limitDefault: 50,
            limitMax: 100,
            cursorParam: "continuation",
          },
          rateLimit: {
            requestsPerMinute: 1000,
            burstSize: 100,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Attendee order ID" },
          name: { sourcePath: "profile.name", description: "Full name", example: "John Doe" },
          email: { sourcePath: "profile.email", description: "Email address" },
          status: { sourcePath: "status", description: "Attendance status (attending, not_attending, etc.)" },
          checkedIn: { sourcePath: "checked_in", description: "Check-in status (boolean)" },
          ticketType: { sourcePath: "ticket_class_name", description: "Ticket class/type name" },
          registrationDate: { sourcePath: "created", description: "Registration date/time" },
          customFields: { sourcePath: "answers", description: "Custom question answers array" },
        },
      },
    },
    variableDescriptions: {
      accountId: "Your Eventbrite user ID (obtained during OAuth authorization)",
      eventId: "The Eventbrite event ID to query attendees for",
    },
    testEndpoint: {
      path: "/users/me/",
      method: "GET",
      expectedStatus: 200,
    },
  },

  cvent: {
    id: "cvent",
    name: "Cvent",
    description: "Enterprise event management platform",
    websiteUrl: "https://www.cvent.com",
    docsUrl: "https://developers.cvent.com/documentation/rest-api/",
    authType: "oauth2",
    baseUrlTemplate: "https://api.cvent.com",
    oauth2Config: {
      authorizationUrl: "https://api.cvent.com/oauth/authorize",
      tokenUrl: "https://api.cvent.com/oauth/token",
      scope: "event/events:read event/attendees:read",
      grantType: "client_credentials",
      usePKCE: false,
    },
    dataTypes: {
      events: {
        endpoint: {
          path: "/ea/v1/events",
          method: "GET",
          description: "List all events in the account",
          variables: [],
          filters: ["filter", "sort", "limit", "token"],
          pagination: {
            type: "cursor",
            limitParam: "limit",
            limitDefault: 100,
            limitMax: 200,
            cursorParam: "token",
          },
          rateLimit: {
            requestsPerMinute: 300,
            burstSize: 50,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Cvent event ID (UUID)" },
          name: { sourcePath: "title", description: "Event title" },
          status: { sourcePath: "status", description: "Event status" },
          startDate: { sourcePath: "startDate", description: "Event start date" },
          endDate: { sourcePath: "endDate", description: "Event end date" },
          eventCode: { sourcePath: "code", description: "Event code/identifier" },
        },
      },
      attendees: {
        endpoint: {
          path: "/ea/v1/events/{eventId}/attendees",
          method: "GET",
          description: "List all attendees for an event",
          variables: ["eventId"],
          filters: ["filter", "sort", "limit", "token"],
          pagination: {
            type: "cursor",
            limitParam: "limit",
            limitDefault: 100,
            limitMax: 200,
            cursorParam: "token",
          },
          rateLimit: {
            requestsPerMinute: 300,
            burstSize: 50,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Attendee ID (UUID)" },
          name: { sourcePath: "firstName + lastName", description: "Full name (combined)" },
          email: { sourcePath: "emailAddress", description: "Primary email" },
          status: { sourcePath: "registrationStatus", description: "Registration status" },
          checkedIn: { sourcePath: "checkedIn", description: "Check-in status" },
          ticketType: { sourcePath: "registrationType", description: "Registration type" },
          registrationDate: { sourcePath: "registrationDate", description: "Registration date" },
        },
      },
      sessions: {
        endpoint: {
          path: "/ea/v1/events/{eventId}/sessions",
          method: "GET",
          description: "List all sessions for an event",
          variables: ["eventId"],
          filters: ["filter", "limit", "token"],
          pagination: {
            type: "cursor",
            limitParam: "limit",
            limitDefault: 100,
            limitMax: 200,
            cursorParam: "token",
          },
          rateLimit: {
            requestsPerMinute: 300,
            burstSize: 50,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Session ID" },
          name: { sourcePath: "title", description: "Session title" },
          startTime: { sourcePath: "startTime", description: "Session start time" },
          endTime: { sourcePath: "endTime", description: "Session end time" },
          capacity: { sourcePath: "capacity", description: "Maximum capacity" },
          location: { sourcePath: "location.name", description: "Session room/location" },
        },
      },
    },
    variableDescriptions: {
      eventId: "The Cvent event ID (UUID format)",
    },
    testEndpoint: {
      path: "/ea/v1/events?limit=1",
      method: "GET",
      expectedStatus: 200,
    },
  },

  regfox: {
    id: "regfox",
    name: "RegFox",
    description: "Registration and ticketing platform by Webconnex",
    websiteUrl: "https://www.regfox.com",
    docsUrl: "https://docs.webconnex.io/api/v2/",
    authType: "bearerToken",
    baseUrlTemplate: "https://api.webconnex.com/v2/public",
    bearerTokenConfig: {
      headerName: "Authorization",
      prefix: "Bearer",
    },
    dataTypes: {
      events: {
        endpoint: {
          path: "/forms",
          method: "GET",
          description: "List all registration forms (events)",
          variables: [],
          filters: ["product", "status", "limit", "startingAfter"],
          pagination: {
            type: "cursor",
            limitParam: "limit",
            limitDefault: 50,
            limitMax: 100,
            cursorParam: "startingAfter",
          },
          rateLimit: {
            requestsPerMinute: 100,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Form ID" },
          name: { sourcePath: "name", description: "Form/event name" },
          status: { sourcePath: "status", description: "Form status (open, closed, etc.)" },
          startDate: { sourcePath: "dateCreated", description: "Form creation date" },
        },
      },
      attendees: {
        endpoint: {
          path: "/forms/{formId}/registrants",
          method: "GET",
          description: "List all registrants for a form",
          variables: ["formId"],
          filters: ["status", "search", "limit", "startingAfter", "dateCreatedBefore", "dateCreatedAfter"],
          pagination: {
            type: "cursor",
            limitParam: "limit",
            limitDefault: 50,
            limitMax: 100,
            cursorParam: "startingAfter",
          },
          rateLimit: {
            requestsPerMinute: 100,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Registrant ID" },
          name: { sourcePath: "displayName", description: "Display name" },
          email: { sourcePath: "email", description: "Email address" },
          status: { sourcePath: "status", description: "Registration status" },
          checkedIn: { sourcePath: "checkedIn", description: "Check-in status" },
          ticketType: { sourcePath: "ticketName", description: "Ticket type" },
          registrationDate: { sourcePath: "dateCreated", description: "Registration date" },
          customFields: { sourcePath: "data", description: "Custom field data object" },
        },
      },
    },
    variableDescriptions: {
      formId: "The RegFox form ID (your event registration form)",
    },
    testEndpoint: {
      path: "/forms?limit=1",
      method: "GET",
      expectedStatus: 200,
    },
  },

  tickettailor: {
    id: "tickettailor",
    name: "Ticket Tailor",
    description: "Simple, affordable event ticketing platform",
    websiteUrl: "https://www.tickettailor.com",
    docsUrl: "https://developers.tickettailor.com/",
    authType: "apiKey",
    baseUrlTemplate: "https://api.tickettailor.com/v1",
    apiKeyConfig: {
      headerName: "Authorization",
      prefix: "Basic",
    },
    dataTypes: {
      events: {
        endpoint: {
          path: "/events",
          method: "GET",
          description: "List all events",
          variables: [],
          filters: ["status", "start_at.gte", "start_at.lte"],
          pagination: {
            type: "cursor",
            limitParam: "limit",
            limitDefault: 100,
            limitMax: 100,
            cursorParam: "starting_after",
          },
          rateLimit: {
            requestsPerMinute: 120,
            burstSize: 30,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Event ID" },
          name: { sourcePath: "name", description: "Event name" },
          status: { sourcePath: "status", description: "Event status" },
          startDate: { sourcePath: "start.iso", description: "Event start (ISO format)" },
          endDate: { sourcePath: "end.iso", description: "Event end (ISO format)" },
          venue: { sourcePath: "venue.name", description: "Venue name" },
        },
      },
      attendees: {
        endpoint: {
          path: "/issued_tickets",
          method: "GET",
          description: "List all issued tickets (attendees)",
          variables: [],
          filters: ["event_id", "event_series_id", "status", "email"],
          pagination: {
            type: "cursor",
            limitParam: "limit",
            limitDefault: 100,
            limitMax: 100,
            cursorParam: "starting_after",
          },
          rateLimit: {
            requestsPerMinute: 120,
            burstSize: 30,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Issued ticket ID" },
          name: { sourcePath: "full_name", description: "Attendee full name" },
          email: { sourcePath: "email", description: "Email address" },
          status: { sourcePath: "status", description: "Ticket status (valid, void, etc.)" },
          checkedIn: { sourcePath: "checked_in", description: "Check-in status" },
          ticketType: { sourcePath: "ticket_type.name", description: "Ticket type name" },
          registrationDate: { sourcePath: "created_at", description: "Ticket creation date" },
        },
      },
    },
    variableDescriptions: {
      eventId: "The Ticket Tailor event ID (use in filter parameter)",
    },
    testEndpoint: {
      path: "/events?limit=1",
      method: "GET",
      expectedStatus: 200,
    },
  },

  humanitix: {
    id: "humanitix",
    name: "Humanitix",
    description: "Ethical ticketing platform that donates profits to charity",
    websiteUrl: "https://www.humanitix.com",
    docsUrl: "https://developer.humanitix.com/",
    authType: "apiKey",
    baseUrlTemplate: "https://api.humanitix.com/v1",
    apiKeyConfig: {
      headerName: "x-api-key",
    },
    dataTypes: {
      events: {
        endpoint: {
          path: "/events",
          method: "GET",
          description: "List all events",
          variables: [],
          filters: ["page", "pageSize", "status"],
          pagination: {
            type: "page",
            limitParam: "pageSize",
            limitDefault: 20,
            limitMax: 100,
            pageParam: "page",
          },
          rateLimit: {
            requestsPerMinute: 60,
            burstSize: 10,
          },
        },
        fieldMappings: {
          id: { sourcePath: "_id", description: "Event ID" },
          name: { sourcePath: "name", description: "Event name" },
          status: { sourcePath: "status", description: "Event status" },
          startDate: { sourcePath: "startDate", description: "Event start date" },
          endDate: { sourcePath: "endDate", description: "Event end date" },
        },
      },
      attendees: {
        endpoint: {
          path: "/events/{eventId}/orders",
          method: "GET",
          description: "List all orders (attendees) for an event",
          variables: ["eventId"],
          filters: ["page", "pageSize"],
          pagination: {
            type: "page",
            limitParam: "pageSize",
            limitDefault: 20,
            limitMax: 100,
            pageParam: "page",
          },
          rateLimit: {
            requestsPerMinute: 60,
            burstSize: 10,
          },
        },
        fieldMappings: {
          id: { sourcePath: "_id", description: "Order ID" },
          name: { sourcePath: "buyer.firstName + buyer.lastName", description: "Buyer full name" },
          email: { sourcePath: "buyer.email", description: "Buyer email" },
          status: { sourcePath: "status", description: "Order status" },
          checkedIn: { sourcePath: "checkedIn", description: "Check-in status" },
          ticketType: { sourcePath: "tickets[0].ticketType.name", description: "First ticket type" },
          registrationDate: { sourcePath: "createdAt", description: "Order creation date" },
        },
      },
    },
    variableDescriptions: {
      eventId: "The Humanitix event ID",
    },
    testEndpoint: {
      path: "/events?pageSize=1",
      method: "GET",
      expectedStatus: 200,
    },
  },
  */

  // ========================================================================
  // ACTIVE PROVIDERS - Currently enabled
  // ========================================================================

  // Certain OAuth - OAuth2 authentication for Certain platform
  certain_oauth: {
    id: "certain_oauth",
    name: "Certain (OAuth)",
    description: "Enterprise event management platform with OAuth2 authentication",
    websiteUrl: "https://www.certain.com",
    docsUrl: "https://developer.certain.com/",
    authType: "oauth2",
    baseUrlTemplate: "",
    oauth2Config: {
      authorizationUrl: "https://auth.certain.com/oauth/authorize",
      tokenUrl: "https://auth.certain.com/oauth/token",
      scope: "events:read registrations:read sessions:read",
      grantType: "authorization_code",
      usePKCE: true,
    },
    dataTypes: {
      events: {
        endpoint: {
          path: "/certainExternal/service/v1/Events",
          method: "GET",
          description: "List all events",
          variables: [],
          filters: ["eventCode", "startDate", "endDate", "status"],
          incrementalFilter: {
            paramName: "dateModified_after",
            filterExpression: "{timestamp}",
            timestampFormat: "certain",
          },
          pagination: {
            type: "offset",
            limitParam: "maxResults",
            limitDefault: 100,
            limitMax: 500,
            offsetParam: "startIndex",
          },
          rateLimit: {
            requestsPerMinute: 120,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "eventCode", description: "Event code (unique identifier)" },
          name: { sourcePath: "eventName", description: "Event name" },
          status: { sourcePath: "eventStatus", description: "Event status (Active, Inactive, Archived)" },
          startDate: { sourcePath: "eventStartDate", description: "Event start date" },
          endDate: { sourcePath: "eventEndDate", description: "Event end date" },
          eventCode: { sourcePath: "eventCode", description: "Unique event code" },
          venue: { sourcePath: "venueName", description: "Venue name" },
        },
      },
      attendees: {
        endpoint: {
          path: "/certainExternal/service/v1/Registration/{eventCode}",
          method: "GET",
          description: "List all registrations for an event",
          variables: ["eventCode"],
          filters: ["modifiedSince", "registrationStatus", "attendeeType"],
          incrementalFilter: {
            paramName: "dateModified_after",
            filterExpression: "{timestamp}",
            timestampFormat: "certain",
          },
          pagination: {
            type: "offset",
            limitParam: "maxResults",
            limitDefault: 100,
            limitMax: 500,
            offsetParam: "startIndex",
          },
          rateLimit: {
            requestsPerMinute: 120,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "registrationCode", description: "Registration code" },
          name: { sourcePath: "firstName + lastName", description: "Full name (combined)" },
          email: { sourcePath: "emailAddress", description: "Email address" },
          status: { sourcePath: "registrationStatus", description: "Registration status (Registered, Cancelled, etc.)" },
          checkedIn: { sourcePath: "checkedIn", description: "Check-in status (boolean or timestamp)" },
          ticketType: { sourcePath: "attendeeType", description: "Attendee type/category" },
          registrationDate: { sourcePath: "registrationDate", description: "Registration date" },
          customFields: { sourcePath: "customFields", description: "Custom profile data" },
          firstName: { sourcePath: "firstName", description: "First name" },
          lastName: { sourcePath: "lastName", description: "Last name" },
          company: { sourcePath: "company", description: "Company name" },
          title: { sourcePath: "title", description: "Job title" },
        },
      },
      sessions: {
        endpoint: {
          path: "/certainExternal/service/v1/Sessions/{eventCode}",
          method: "GET",
          description: "List all sessions for an event",
          variables: ["eventCode"],
          filters: ["sessionDate", "track", "sessionStatus"],
          incrementalFilter: {
            paramName: "dateModified_after",
            filterExpression: "{timestamp}",
            timestampFormat: "certain",
          },
          pagination: {
            type: "offset",
            limitParam: "maxResults",
            limitDefault: 100,
            limitMax: 500,
            offsetParam: "startIndex",
          },
          rateLimit: {
            requestsPerMinute: 120,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "sessionCode", description: "Session code" },
          name: { sourcePath: "sessionTitle", description: "Session title" },
          startTime: { sourcePath: "sessionStartTime", description: "Session start time" },
          endTime: { sourcePath: "sessionEndTime", description: "Session end time" },
          capacity: { sourcePath: "capacity", description: "Maximum capacity" },
          location: { sourcePath: "roomName", description: "Room/location name" },
          track: { sourcePath: "trackName", description: "Track name" },
        },
      },
    },
    variableDescriptions: {
      eventCode: "The Certain event code (unique identifier for the event)",
    },
    testEndpoint: {
      path: "/certainExternal/service/v1/Events?maxResults=1",
      method: "GET",
      expectedStatus: 200,
    },
  },

  // Certain Basic - Basic authentication for Certain platform
  certain: {
    id: "certain",
    name: "Certain (Basic)",
    description: "Enterprise event management and attendee engagement platform with Basic Auth",
    websiteUrl: "https://www.certain.com",
    docsUrl: "https://developer.certain.com/",
    authType: "basic",
    baseUrlTemplate: "",
    basicAuthConfig: {
      usernameField: "accountCode",
      passwordField: "apiKey",
    },
    dataTypes: {
      events: {
        endpoint: {
          path: "/certainExternal/service/v1/Events",
          method: "GET",
          description: "List all events",
          variables: [],
          filters: ["eventCode", "startDate", "endDate", "status"],
          incrementalFilter: {
            paramName: "dateModified_after",
            filterExpression: "{timestamp}",
            timestampFormat: "certain",
          },
          pagination: {
            type: "offset",
            limitParam: "maxResults",
            limitDefault: 100,
            limitMax: 500,
            offsetParam: "startIndex",
          },
          rateLimit: {
            requestsPerMinute: 120,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "eventCode", description: "Event code (unique identifier)" },
          name: { sourcePath: "eventName", description: "Event name" },
          status: { sourcePath: "eventStatus", description: "Event status (Active, Inactive, Archived)" },
          startDate: { sourcePath: "eventStartDate", description: "Event start date" },
          endDate: { sourcePath: "eventEndDate", description: "Event end date" },
          eventCode: { sourcePath: "eventCode", description: "Unique event code" },
          venue: { sourcePath: "venueName", description: "Venue name" },
        },
      },
      attendees: {
        endpoint: {
          path: "/certainExternal/service/v1/Registration/{eventCode}",
          method: "GET",
          description: "List all registrations for an event",
          variables: ["eventCode"],
          filters: ["modifiedSince", "registrationStatus", "attendeeType"],
          incrementalFilter: {
            paramName: "dateModified_after",
            filterExpression: "{timestamp}",
            timestampFormat: "certain",
          },
          pagination: {
            type: "offset",
            limitParam: "maxResults",
            limitDefault: 100,
            limitMax: 500,
            offsetParam: "startIndex",
          },
          rateLimit: {
            requestsPerMinute: 120,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "registrationCode", description: "Registration code" },
          name: { sourcePath: "firstName + lastName", description: "Full name (combined)" },
          email: { sourcePath: "emailAddress", description: "Email address" },
          status: { sourcePath: "registrationStatus", description: "Registration status (Registered, Cancelled, etc.)" },
          checkedIn: { sourcePath: "checkedIn", description: "Check-in status (boolean or timestamp)" },
          ticketType: { sourcePath: "attendeeType", description: "Attendee type/category" },
          registrationDate: { sourcePath: "registrationDate", description: "Registration date" },
          customFields: { sourcePath: "customFields", description: "Custom profile data" },
          firstName: { sourcePath: "firstName", description: "First name" },
          lastName: { sourcePath: "lastName", description: "Last name" },
          company: { sourcePath: "company", description: "Company name" },
          title: { sourcePath: "title", description: "Job title" },
        },
      },
      sessions: {
        endpoint: {
          path: "/certainExternal/service/v1/Sessions/{eventCode}",
          method: "GET",
          description: "List all sessions for an event",
          variables: ["eventCode"],
          filters: ["sessionDate", "track", "sessionStatus"],
          incrementalFilter: {
            paramName: "dateModified_after",
            filterExpression: "{timestamp}",
            timestampFormat: "certain",
          },
          pagination: {
            type: "offset",
            limitParam: "maxResults",
            limitDefault: 100,
            limitMax: 500,
            offsetParam: "startIndex",
          },
          rateLimit: {
            requestsPerMinute: 120,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "sessionCode", description: "Session code" },
          name: { sourcePath: "sessionTitle", description: "Session title" },
          startTime: { sourcePath: "sessionStartTime", description: "Session start time" },
          endTime: { sourcePath: "sessionEndTime", description: "Session end time" },
          capacity: { sourcePath: "capacity", description: "Maximum capacity" },
          location: { sourcePath: "roomName", description: "Room/location name" },
          track: { sourcePath: "trackName", description: "Track name" },
        },
      },
    },
    variableDescriptions: {
      eventCode: "The Certain event code (unique identifier for the event)",
    },
    testEndpoint: {
      path: "/certainExternal/service/v1/Events?maxResults=1",
      method: "GET",
      expectedStatus: 200,
    },
  },

  // Generic Bearer Token - For custom API integrations using Bearer token authentication
  bearer_token: {
    id: "bearer_token",
    name: "Bearer Token",
    description: "Generic API integration using Bearer token authentication",
    websiteUrl: "",
    docsUrl: "",
    authType: "bearerToken",
    baseUrlTemplate: "",
    bearerTokenConfig: {
      headerName: "Authorization",
      prefix: "Bearer",
    },
    dataTypes: {
      events: {
        endpoint: {
          path: "/events",
          method: "GET",
          description: "List all events (customize path as needed)",
          variables: [],
          filters: [],
          pagination: {
            type: "offset",
            limitParam: "limit",
            limitDefault: 100,
            limitMax: 500,
            offsetParam: "offset",
          },
          rateLimit: {
            requestsPerMinute: 100,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Event ID" },
          name: { sourcePath: "name", description: "Event name" },
          status: { sourcePath: "status", description: "Event status" },
          startDate: { sourcePath: "startDate", description: "Event start date" },
          endDate: { sourcePath: "endDate", description: "Event end date" },
        },
      },
      attendees: {
        endpoint: {
          path: "/events/{eventId}/attendees",
          method: "GET",
          description: "List all attendees for an event (customize path as needed)",
          variables: ["eventId"],
          filters: [],
          pagination: {
            type: "offset",
            limitParam: "limit",
            limitDefault: 100,
            limitMax: 500,
            offsetParam: "offset",
          },
          rateLimit: {
            requestsPerMinute: 100,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Attendee ID" },
          name: { sourcePath: "name", description: "Full name" },
          email: { sourcePath: "email", description: "Email address" },
          status: { sourcePath: "status", description: "Registration status" },
          checkedIn: { sourcePath: "checkedIn", description: "Check-in status" },
          ticketType: { sourcePath: "ticketType", description: "Ticket/registration type" },
          registrationDate: { sourcePath: "registrationDate", description: "Registration date" },
          firstName: { sourcePath: "firstName", description: "First name" },
          lastName: { sourcePath: "lastName", description: "Last name" },
          company: { sourcePath: "company", description: "Company name" },
          title: { sourcePath: "title", description: "Job title" },
        },
      },
      sessions: {
        endpoint: {
          path: "/events/{eventId}/sessions",
          method: "GET",
          description: "List all sessions for an event (customize path as needed)",
          variables: ["eventId"],
          filters: [],
          pagination: {
            type: "offset",
            limitParam: "limit",
            limitDefault: 100,
            limitMax: 500,
            offsetParam: "offset",
          },
          rateLimit: {
            requestsPerMinute: 100,
            burstSize: 20,
          },
        },
        fieldMappings: {
          id: { sourcePath: "id", description: "Session ID" },
          name: { sourcePath: "name", description: "Session name" },
          startTime: { sourcePath: "startTime", description: "Session start time" },
          endTime: { sourcePath: "endTime", description: "Session end time" },
          capacity: { sourcePath: "capacity", description: "Maximum capacity" },
          location: { sourcePath: "location", description: "Room/location" },
        },
      },
    },
    variableDescriptions: {
      eventId: "The event ID to query data for",
    },
    testEndpoint: {
      path: "/events?limit=1",
      method: "GET",
      expectedStatus: 200,
    },
  },
};

export function getProviderSpec(providerId: string): IntegrationProviderSpec | undefined {
  return INTEGRATION_PROVIDERS[providerId];
}

export function getAllProviderIds(): string[] {
  return Object.keys(INTEGRATION_PROVIDERS);
}

export function getProvidersByAuthType(authType: AuthType): IntegrationProviderSpec[] {
  return Object.values(INTEGRATION_PROVIDERS).filter(p => p.authType === authType);
}

export const EndpointConfigSchema = z.object({
  dataType: DataTypeEnum,
  enabled: z.boolean().default(true),
  pathOverride: z.string().optional(),
  variableOverrides: z.record(z.string()).optional(),
  filterDefaults: z.record(z.string()).optional(),
  headerOverrides: z.record(z.string()).optional(),
  fieldMappingOverrides: z.record(z.object({
    sourcePath: z.string(),
    transform: z.string().optional(),
  })).optional(),
  paginationOverrides: z.object({
    limitParam: z.string().optional(),
    limitDefault: z.number().optional(),
    cursorParam: z.string().optional(),
  }).optional(),
});

export type EndpointConfig = z.infer<typeof EndpointConfigSchema>;

export const SyncConfigSchema = z.object({
  events: z.object({
    enabled: z.boolean().default(false),
    syncInterval: z.number().default(60),
    lastSyncAt: z.string().optional(),
  }).optional(),
  attendees: z.object({
    enabled: z.boolean().default(false),
    syncInterval: z.number().default(15),
    syncOnCheckIn: z.boolean().default(true),
    lastSyncAt: z.string().optional(),
  }).optional(),
  sessions: z.object({
    enabled: z.boolean().default(false),
    syncInterval: z.number().default(60),
    lastSyncAt: z.string().optional(),
  }).optional(),
});

export type SyncConfig = z.infer<typeof SyncConfigSchema>;

export const CustomerIntegrationConfigSchema = z.object({
  providerId: z.string(),
  baseUrlOverride: z.string().optional(),
  variableMap: z.record(z.string()).default({}),
  endpoints: z.record(EndpointConfigSchema).default({}),
  syncConfig: SyncConfigSchema.default({}),
  webhookConfig: z.object({
    enabled: z.boolean().default(false),
    secret: z.string().optional(),
    events: z.array(z.string()).default([]),
  }).optional(),
});

export type CustomerIntegrationConfig = z.infer<typeof CustomerIntegrationConfigSchema>;
