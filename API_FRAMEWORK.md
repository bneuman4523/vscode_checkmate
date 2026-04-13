# API Integration Framework

## Overview

Comprehensive, enterprise-grade API framework for integrating with external event registration and ticketing platforms. Designed for multi-tenant SaaS with strict security, PCI compliance, and offline-first architecture.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Customer Account                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────┐      ┌─────────────────────────┐   │
│  │  Integration   │──────│  OAuth2 Tokens          │   │
│  │  Providers     │      │  (metadata only)        │   │
│  │  (Catalog)     │      │  - accessTokenRef       │   │
│  └────────────────┘      │  - refreshTokenRef      │   │
│         │                │  - expiresAt            │   │
│         │                └─────────────────────────┘   │
│         ▼                                               │
│  ┌────────────────┐                                    │
│  │  Customer      │                                    │
│  │  Integrations  │──────┐                             │
│  │  (Instances)   │      │                             │
│  └────────────────┘      │                             │
│         │                │                             │
│         ▼                ▼                             │
│  ┌─────────────────────────────────────────┐          │
│  │  Event Code Mappings                     │          │
│  │  - External Event ID → Local Event ID    │          │
│  │  - Sync Cursor & Progress                │          │
│  │  - Field Mapping Configuration           │          │
│  └─────────────────────────────────────────┘          │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────────────────────────────┐          │
│  │  Sync Jobs (Queue)                       │          │
│  │  - Priority Queue                        │          │
│  │  - Retry Logic                           │          │
│  │  - Dead Letter Queue                     │          │
│  └─────────────────────────────────────────┘          │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Security Layer (Server-Side)                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Credential Manager                             │    │
│  │  - Environment Variable References Only         │    │
│  │  - 5-minute In-Memory Cache                     │    │
│  │  - Automatic Cache Expiration                   │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  OAuth2 Service                                 │    │
│  │  - Token Lifecycle Management                   │    │
│  │  - Proactive Refresh (5 min before expiry)      │    │
│  │  - Concurrent Refresh Protection                │    │
│  │  - Grant Types: authorization_code, client_     │    │
│  │    credentials, password, refresh_token         │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   API Client Layer                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  API Client                                     │    │
│  │  - Auth Strategies: Bearer, API Key, Basic,     │    │
│  │    OAuth2                                       │    │
│  │  - Rate Limiting (Token Bucket)                 │    │
│  │  - Circuit Breaker (5 failures → 1 min open)    │    │
│  │  - Pagination Support (offset, cursor, page)    │    │
│  │  - Retry with Exponential Backoff               │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Sync Orchestrator                              │    │
│  │  - Event Code Retrieval                         │    │
│  │  - Incremental Attendee Sync                    │    │
│  │  - Field Transformation & Mapping               │    │
│  │  - Minimal PII Extraction (PCI compliant)       │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Security Model

### Credential Storage

**NEVER store credentials in the database:**

```typescript
// ❌ WRONG - Storing actual credentials
customerIntegrations: {
  credentials: {
    apiKey: "sk_live_abc123..."  // NEVER DO THIS
  }
}

// ✅ CORRECT - Storing reference only
customerIntegrations: {
  credentialsRef: "CUSTOMER_123_EVENTBRITE_API_KEY"  // Reference to env var
}
```

**Credential Lifecycle:**

1. **Storage**: User provides credential → Server stores in environment variables → Database stores reference only
2. **Retrieval**: Server retrieves from environment using reference → Caches in memory for 5 minutes → Returns to API client
3. **Usage**: API client uses credential for single request → Credential discarded
4. **Deletion**: User deletes integration → Server removes from environment → Database reference deleted

### OAuth2 Token Management

**Token Metadata (stored in database):**
```typescript
{
  accessTokenRef: "CUSTOMER_123_OAUTH_ACCESS",  // Reference
  refreshTokenRef: "CUSTOMER_123_OAUTH_REFRESH", // Reference
  issuedAt: "2024-01-15T10:00:00Z",
  expiresAt: "2024-01-15T11:00:00Z",
  status: "active"
}
```

**Actual tokens** stored in secure environment, never in database.

### Proactive Token Refresh

Tokens automatically refreshed 5 minutes before expiry:

```
Token Lifecycle:
│
├─ Issued: 10:00 AM (expires at 11:00 AM)
│
├─ 10:30 AM: Token still valid (30 min remaining)
│
├─ 10:54 AM: Token still valid (6 min remaining)
│
├─ 10:55 AM: ⚠️ PROACTIVE REFRESH (5 min threshold)
│   │
│   └─ Refresh token → New access token → Update metadata
│
└─ 10:56 AM: New token active (expires at 11:56 AM)
```

## Database Schema

### Integration Providers

Catalog of supported external platforms:

```typescript
{
  id: "eventbrite",
  name: "Eventbrite",
  type: "event_registration",
  authType: "oauth2",
  oauth2Config: {
    authorizationUrl: "https://www.eventbrite.com/oauth/authorize",
    tokenUrl: "https://www.eventbrite.com/oauth/token",
    scope: "event:read attendee:read",
    grantType: "authorization_code"
  },
  defaultBaseUrl: "https://www.eventbriteapi.com/v3",
  endpointTemplates: [
    {
      name: "getAttendees",
      path: "/events/{{eventId}}/attendees/",
      method: "GET",
      rateLimit: { requests: 50, windowMs: 60000 }
    }
  ]
}
```

### Customer Integrations

Customer-specific integration instances:

```typescript
{
  id: "cust_int_123",
  customerId: "cust_456",
  providerId: "eventbrite",
  name: "My Eventbrite Account",
  baseUrl: "https://www.eventbriteapi.com/v3",
  authType: "oauth2",
  credentialsRef: "CUSTOMER_456_EVENTBRITE_API",  // ← Reference only!
  oauth2ProfileId: "oauth_789",
  rateLimitPolicy: {
    requestsPerMinute: 50,
    burstSize: 10,
    retryAfterMs: 60000
  },
  endpoints: [
    {
      name: "getAttendees",
      path: "/events/{{eventId}}/attendees/",
      method: "GET",
      pagination: {
        type: "cursor",
        cursorParam: "continuation"
      },
      transformations: {
        response: `
          return data.attendees.map(a => ({
            firstName: a.profile.first_name,
            lastName: a.profile.last_name,
            email: a.profile.email,
            company: a.profile.company,
            participantType: a.ticket_class_name
          }));
        `
      }
    }
  ],
  status: "active"
}
```

### Event Code Mappings

Links external event IDs to local events:

```typescript
{
  id: "mapping_123",
  eventId: "evt_local_456",               // Local event ID
  integrationId: "cust_int_123",
  externalEventId: "123456789",           // Eventbrite event ID
  externalEventCode: "CONF2024",
  externalEventName: "Annual Conference 2024",
  syncCursor: "cursor_abc123",            // For incremental sync
  lastSyncedAt: "2024-01-15T10:30:00Z",
  totalAttendeesCount: 1500,
  syncedAttendeesCount: 1500,
  fieldMapping: {
    firstName: "profile.first_name",
    lastName: "profile.last_name",
    email: "profile.email",
    company: "profile.company",
    title: "profile.job_title",
    participantType: "ticket_class_name",
    customFields: {
      dietary: "answers.dietary_restrictions",
      sessionTrack: "answers.preferred_track"
    }
  },
  status: "synced"
}
```

## API Client Usage

### Basic Request

```typescript
import { ApiClient } from './services/api-client';

const client = new ApiClient({
  baseUrl: "https://api.eventbrite.com/v3",
  authStrategy: "bearer",
  credentialsRef: "CUSTOMER_123_EVENTBRITE_TOKEN",
  rateLimit: {
    requestsPerMinute: 50,
    burstSize: 10
  }
});

const response = await client.request({
  method: "GET",
  path: "/users/me/events",
  queryParams: { status: "live" }
});
```

### Paginated Requests

```typescript
for await (const batch of client.paginatedRequest(
  {
    method: "GET",
    path: "/events/123/attendees"
  },
  {
    type: "cursor",
    cursorParam: "continuation",
    extractCursor: (res) => res.pagination?.next_cursor,
    extractItems: (res) => res.attendees
  }
)) {
  // Process each batch
  console.log(`Received ${batch.length} attendees`);
}
```

## OAuth2 Flow Examples

### Authorization Code Flow

```typescript
import { oauth2Service } from './services/oauth2-service';

// Step 1: Redirect user to authorization URL
const authUrl = `${config.authorizationUrl}?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;

// Step 2: User authorizes → receives code

// Step 3: Exchange code for tokens
const tokenMetadata = await oauth2Service.exchangeCodeForToken(
  integrationId,
  code,
  {
    authorizationUrl: config.authorizationUrl,
    tokenUrl: config.tokenUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scope: config.scope,
    grantType: 'authorization_code'
  }
);

// Tokens stored securely, metadata returned:
// {
//   accessTokenRef: "CUSTOMER_123_OAUTH_ACCESS",
//   refreshTokenRef: "CUSTOMER_123_OAUTH_REFRESH",
//   expiresAt: Date,
//   status: "active"
// }
```

### Client Credentials Flow

```typescript
const tokenMetadata = await oauth2Service.getClientCredentialsToken(
  integrationId,
  {
    tokenUrl: config.tokenUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scope: config.scope,
    grantType: 'client_credentials'
  }
);
```

### Automatic Token Refresh

```typescript
// Get valid access token (auto-refreshes if needed)
const accessToken = await oauth2Service.getValidAccessToken(
  integrationId,
  tokenMetadata,
  oauth2Config
);

// Use token
const response = await fetch(apiUrl, {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

## Sync Orchestration

### Sync Event Attendees

```typescript
import { syncOrchestrator } from './services/sync-orchestrator';

const result = await syncOrchestrator.syncEventAttendees({
  integration: customerIntegration,
  eventCodeMapping: eventMapping,
  batchSize: 100
});

console.log(`
  Processed: ${result.processedCount}
  Failed: ${result.failedCount}
  Success: ${result.success}
`);
```

### Fetch Event Code

```typescript
const eventDetails = await syncOrchestrator.fetchEventCode(
  integration,
  "Annual Conference 2024"
);

// Returns:
// {
//   eventId: "123456789",
//   eventCode: "CONF2024",
//   eventName: "Annual Conference 2024"
// }
```

### Test Connection

```typescript
const testResult = await syncOrchestrator.testConnection(integration);

if (testResult.success) {
  console.log("✅ Integration connected successfully");
} else {
  console.error("❌ Connection failed:", testResult.message);
}
```

## Rate Limiting

Token bucket algorithm:

```
Bucket Capacity: 50 requests
Refill Rate: 50 requests/minute (≈ 0.83 req/sec)

Initial State: 50 tokens
│
├─ Request 1: 49 tokens remaining
├─ Request 2: 48 tokens remaining
├─ ... (48 more requests)
├─ Request 50: 0 tokens remaining
│
├─ Request 51: ⚠️ Rate limited
│   Wait 1.2 seconds → 1 token refilled → Request proceeds
│
└─ Burst handling: If idle for 1 minute, bucket refills to 50
```

## Circuit Breaker

Protects against cascading failures:

```
State: CLOSED (normal operation)
│
├─ Request fails (1st failure)
├─ Request fails (2nd failure)
├─ Request fails (3rd failure)
├─ Request fails (4th failure)
├─ Request fails (5th failure)
│
├─ ⚠️ State → OPEN (stop all requests)
│   Wait 60 seconds
│
├─ State → HALF-OPEN (allow test request)
│   ├─ Success → State: CLOSED (resume normal operation)
│   └─ Failure → State: OPEN (wait another 60 seconds)
│
```

## Supported Platforms

### Currently Implemented Templates

1. **Eventbrite** (OAuth2)
2. **Cvent** (API Key)
3. **RegFox** (Bearer Token)
4. **Ticket Tailor** (OAuth2)
5. **Humanitix** (API Key)

### Adding New Platform

1. Create integration provider entry:
```typescript
{
  id: "new_platform",
  name: "New Platform",
  type: "event_registration",
  authType: "oauth2",
  defaultBaseUrl: "https://api.newplatform.com/v1",
  endpointTemplates: [
    {
      name: "getAttendees",
      path: "/events/{{eventId}}/attendees",
      method: "GET"
    }
  ]
}
```

2. Configure authentication (if OAuth2, add oauth2Config)

3. Map field transformations in customer integration

4. Test connection

## Best Practices

### Security

1. **Never log credentials** - Credentials should never appear in logs
2. **Use HTTPS only** - All API communication over TLS
3. **Rotate tokens** - Implement token rotation policy
4. **Validate signatures** - For webhooks, always verify HMAC signatures
5. **Minimal PII** - Extract only necessary attendee data

### Performance

1. **Batch operations** - Process attendees in batches (100-500)
2. **Parallel sync** - Sync multiple events concurrently (with rate limiting)
3. **Incremental sync** - Use cursors/pagination for large datasets
4. **Cache tokens** - Cache OAuth2 tokens in memory (5 min max)
5. **Background jobs** - Use job queue for long-running syncs

### Reliability

1. **Retry logic** - Implement exponential backoff (3 retries max)
2. **Circuit breaker** - Prevent cascading failures
3. **Dead letter queue** - Move failed jobs to DLQ after max retries
4. **Health checks** - Monitor integration status
5. **Alerting** - Alert on sync failures, auth errors, rate limit hits

## PCI Compliance

### Minimal Data Storage

Only store essential attendee data:

✅ **Stored:**
- First Name
- Last Name
- Email (for deduplication only)
- Company
- Job Title
- Participant Type
- Custom Fields (badge-relevant only)

❌ **Never Stored:**
- Payment information
- Credit card details
- Full external platform data
- Sensitive personal data

### External Reference Pattern

Store `externalId` to link back to external platform:

```typescript
{
  id: "att_local_123",
  externalId: "ext_456",  // Reference to Eventbrite attendee
  firstName: "John",
  lastName: "Doe",
  // ... minimal data
}
```

Pull additional data on-demand from external API when needed.

## Monitoring & Observability

### Metrics to Track

1. **Sync Performance**
   - Sync duration
   - Records processed per second
   - Success/failure rate

2. **API Health**
   - Response times
   - Error rates by endpoint
   - Rate limit hits

3. **OAuth2 Health**
   - Token refresh success rate
   - Token expiration events
   - Auth failures

4. **Circuit Breaker**
   - Open/close events
   - Failure count trends

### Logging

Structured logging with context:

```typescript
console.log({
  event: "attendee_sync_complete",
  integrationId: "cust_int_123",
  eventId: "evt_456",
  processed: 1500,
  failed: 0,
  duration_ms: 45000
});
```

## Future Enhancements

1. **Webhook Support** - Real-time updates from external platforms
2. **Bidirectional Sync** - Push updates back to external platforms
3. **GraphQL Support** - For platforms with GraphQL APIs
4. **Bulk Operations** - Optimize for very large events (10K+ attendees)
5. **Multi-region** - Support for region-specific endpoints
6. **Custom Transformations UI** - Visual field mapping editor
7. **Integration Marketplace** - Pre-built connectors for popular platforms
