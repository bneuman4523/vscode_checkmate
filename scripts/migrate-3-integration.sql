-- STEP 3: North America Integration
-- Run this third

INSERT INTO customer_integrations (
  id, customer_id, provider_id, name, base_url, auth_type, credentials_ref, 
  oauth2_profile_id, rate_limit_policy, endpoints, status, last_sync, last_error, 
  created_at, updated_at, test_endpoint_path, event_list_endpoint_path, 
  sync_templates, default_sync_settings, initial_sync_completed_at, 
  realtime_sync_config, account_code
) VALUES (
  'int-6cd3c029', 'cust-15ea238f', 'certain', 'North America', 
  'https://demo1.certaindemo.com', 'basic', NULL, NULL, NULL, '[]', 
  'active', '2026-02-03 06:09:31.996', NULL, 
  '2026-02-03 06:00:52.578641', '2026-02-03 06:00:52.578641',
  'https://demo1.certaindemo.com/certainExternal/service/v1/Event/NorthAmerica',
  '/certainExternal/service/v1/Event/{{accountCode}}?isActive=true&startDate_after=2025-12-01T23:58:05',
  '{"sessions": {"endpointPath": "/api/standard/2.0/accounts/{{accountCode}}/events/{{eventCode}}/sessions?dateModified_after={{lastSyncTimestamp}}"}, "attendees": {"endpointPath": "/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}"}, "sessionRegistrations": {"endpointPath": "/api/standard/2.0/accounts/{{accountCode}}/events/{{eventCode}}/registrations "}}',
  '{"preEventIntervalMinutes": 1440, "duringEventIntervalMinutes": 1}',
  '2026-02-03 06:09:31.996', NULL, 'NorthAmerica'
)
ON CONFLICT (id) DO NOTHING;
