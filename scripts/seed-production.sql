-- Production Database Seed Script
-- Run this in the Production Database pane after initial deployment

-- Integration Providers (reference data for external platform integrations)
INSERT INTO integration_providers (id, name, type, auth_type, default_base_url, status, created_at)
VALUES 
  ('certain', 'Certain', 'event_management', 'basic', 'https://app.certain.com/certainExternal/service/v1', 'active', NOW()),
  ('eventbrite', 'Eventbrite', 'event_management', 'bearer', 'https://www.eventbriteapi.com/v3', 'active', NOW()),
  ('cvent', 'Cvent', 'event_management', 'oauth2', 'https://api.cvent.com', 'active', NOW())
ON CONFLICT (id) DO NOTHING;

-- Verify the data was inserted
SELECT id, name, type, auth_type, status FROM integration_providers;
