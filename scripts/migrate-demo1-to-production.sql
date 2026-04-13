-- Migration Script: Demo1 Customer to Production
-- Run this against the PRODUCTION database after publishing
-- Generated: February 3, 2026
-- NOTE: Only includes North America integration per request

BEGIN;

-- ============================================
-- 1. SUPER ADMIN USERS (no customer assigned)
-- ============================================
INSERT INTO users (id, customer_id, email, first_name, last_name, role, phone_number, is_active, created_at) VALUES
('45310251', NULL, 'bdneu23@gmail.com', 'Brad', 'Neuman', 'super_admin', NULL, true, '2025-12-18 07:03:50.687131'),
('user-362c7f91', NULL, 'bdneu23@me.com', 'Brad1', 'Neuman1', 'super_admin', '+16508043400', true, '2026-01-05 16:57:45.382135'),
('user-a56ba732', NULL, 'jyarnell@certain.com', 'Jeff', 'Yarnell', 'super_admin', NULL, true, '2026-01-08 17:03:56.275324')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. DEMO1 CUSTOMER
-- ============================================
INSERT INTO customers (id, name, created_at) VALUES
('cust-15ea238f', 'Demo1', '2025-12-17 17:46:02.378014')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. DEMO1 USERS
-- ============================================
INSERT INTO users (id, customer_id, email, first_name, last_name, role, phone_number, is_active, created_at) VALUES
('user-a3873bfa', 'cust-15ea238f', 'b1@c.com', 'Bradley24', 'Neuman', 'staff', '+15555555551', true, '2026-01-21 20:18:58.504143'),
('user-fa45efa4', 'cust-15ea238f', 'bdneu23+56@gmail.com', 'B', 'Neuman', 'admin', '+14158555826', true, '2026-01-21 20:35:00.577357'),
('user-3c2154e3', 'cust-15ea238f', 'bdneu23+3454@gmail.com', 'Brad', 'Neuman', 'admin', '+15555553454', true, '2026-01-21 20:35:50.211225'),
('user-d79feec4', 'cust-15ea238f', 'bosborn@certain.com', 'Bob', 'Osborn', 'admin', '+14158065826', true, '2026-02-03 16:06:19.798901'),
('user-229c46bd', 'cust-15ea238f', 'ppiodos@certain.com', 'Peach', 'Piodos', 'admin', '+639055415897', true, '2026-02-03 16:58:59.891163'),
('user-2f2eb756', 'cust-15ea238f', 'dsullivan@certain.com', 'Dan', 'Sullivan', 'admin', '+19788289654', true, '2026-02-03 17:14:53.363381'),
('user-87d70bb6', 'cust-15ea238f', 'momara@certain.com', 'Marina', 'O''Mara', 'admin', '+14155055410', true, '2026-02-03 17:19:32.439815'),
('user-2a3a4baf', 'cust-15ea238f', 'challs@certain.com', 'Corie', 'Halls', 'admin', '+14043841082', true, '2026-02-03 17:21:19.730438'),
('user-0574cf4d', 'cust-15ea238f', 'jleyba@certain.com', 'Jewell', 'Lebya', 'admin', '+18186871381', true, '2026-02-03 17:24:18.31682'),
('user-bc6a35af', 'cust-15ea238f', 'pchiu@Certain.com', 'Peggy', 'Chiu', 'admin', '+14088876276', true, '2026-02-03 17:26:48.502416'),
('user-0ee7000f', 'cust-15ea238f', 'acharney@certain.com', 'Alex', 'Charney', 'admin', '+15733971969', true, '2026-02-03 17:28:11.036028'),
('user-1078825f', 'cust-15ea238f', 'asmith@certain.com', 'Andy', 'Smith', 'admin', '+14156134395', true, '2026-02-03 17:43:32.746863'),
('user-032dfca4', 'cust-15ea238f', 'akunihiro@certain.com', 'Ashley', 'Kunihiro', 'staff', '+16616184131', true, '2026-02-03 17:56:01.578107'),
('user-bc2e8fa2', 'cust-15ea238f', 'anatha@certain.com', 'Aditya', 'Natha', 'admin', '+12269756761', true, '2026-02-03 19:07:14.484132')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. LOCATIONS
-- ============================================
INSERT INTO locations (id, customer_id, name, address, city, state, country, timezone, match_patterns, is_active, created_at) VALUES
('loc-e335ce1b', 'cust-15ea238f', 'location1', '75 Hawthorne', 'San Francisco', 'California', 'United States', NULL, '["SF", "San Francisco"]', true, '2026-01-13 06:09:20.989467'),
('loc-a401be2b', 'cust-15ea238f', 'Location2', '555 Main Street', 'Chicago', 'IL', NULL, NULL, '["Chicago", "CHI"]', true, '2026-01-13 06:10:25.697591')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. PRINTERS
-- ============================================
INSERT INTO printers (id, customer_id, name, connection_type, ip_address, port, dpi, is_default, is_active, created_at) VALUES
('prt-e21841b3', 'cust-15ea238f', '620 wifi', 'wifi', '010.000.000.135', 9100, 300, true, true, '2025-12-23 05:52:09.903024'),
('prt-4bbb49e1', 'cust-15ea238f', 'Zebra Technologies ZTC ZD620-203dpi ZPL', 'usb', NULL, NULL, 300, true, true, '2025-12-24 05:50:24.928028'),
('prt-9ce3b841', 'cust-15ea238f', 'epson', 'airprint', NULL, NULL, 300, true, true, '2026-01-06 20:18:52.514341'),
('prt-76198056', 'cust-15ea238f', 'epson2', 'airprint', NULL, NULL, 600, true, true, '2026-01-07 00:09:46.002472'),
('prt-28453125', 'cust-15ea238f', 'Zebra ZD621 nework printer', 'wifi', '10.0.0.51', 9100, 300, false, true, '2026-01-07 21:31:38.56221'),
('prt-4692d732', 'cust-15ea238f', 'WC621', 'wifi', '10.209.113.33', 9100, 300, false, true, '2026-01-22 04:27:47.428477')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 6. NORTH AMERICA INTEGRATION ONLY
-- ============================================
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

-- ============================================
-- 7. CONFIGURATION TEMPLATES
-- ============================================
INSERT INTO event_configuration_templates (
  id, customer_id, name, description, default_badge_template_id, 
  badge_template_overrides, default_printer_id, staff_settings, 
  workflow_snapshot, is_default, created_at, updated_at
) VALUES
('ect-d467e25a', 'cust-15ea238f', 'Standard with Badge print', NULL, 'tpl-17020130', NULL, 'prt-9ce3b841', 
 '{"enabled": true, "endPreset": "event_end", "startPreset": "event_day"}',
 '{"steps": [{"enabled": true, "position": 0, "stepType": "buyer_questions"}, {"enabled": true, "position": 1, "stepType": "disclaimer"}, {"enabled": true, "position": 2, "stepType": "badge_edit"}, {"enabled": true, "position": 3, "stepType": "badge_print"}], "enabled": true, "disclaimers": [{"title": "Disclaimer", "stepIndex": 0, "disclaimerText": "You need to agree and sign in order to attend.", "confirmationText": "I have read and agree to the above disclaimer.", "requireSignature": true}], "buyerQuestions": [{"options": [], "position": 0, "required": true, "stepIndex": 0, "questionText": "What is your primary purpose for attending this event?", "questionType": "text"}], "enabledForKiosk": true, "enabledForStaff": true}',
 false, '2026-01-16 03:08:06.637789', '2026-02-03 05:26:02.432'),
('ect-35455ac9', 'cust-15ea238f', 'Quick Checkin', NULL, NULL, NULL, NULL,
 '{"enabled": true, "endPreset": "event_end", "startPreset": "event_day"}',
 '{"steps": [{"enabled": true, "position": 0, "stepType": "buyer_questions"}], "enabled": true, "disclaimers": [], "buyerQuestions": [{"options": [], "position": 0, "required": true, "stepIndex": 0, "questionText": "Primary goal for attending?", "questionType": "text"}], "enabledForKiosk": true, "enabledForStaff": true}',
 false, '2026-02-03 05:27:09.390862', '2026-02-03 05:27:09.390862')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 8. EVENTS (Only North America integration events)
-- ============================================
-- Only including events linked to North America integration (int-6cd3c029)
INSERT INTO events (
  id, customer_id, name, event_date, selected_templates, selected_printer_id, 
  integration_id, external_event_id, default_badge_template_id, printer_settings,
  temp_staff_settings, status, created_at, account_code, event_code, 
  start_date, end_date, badge_settings, location_id, location, venue,
  config_status, configured_at, config_template_id
) VALUES
('evt-7014dcf0', 'cust-15ea238f', 'Hawthorne Hybrid Conference 2026', '2026-05-07 00:00:00', '{}', 'prt-9ce3b841', 'int-6cd3c029', 'generate-hybrid-63034', 'tpl-17020130', NULL, '{"enabled": true, "endTime": "2026-05-11T07:00:00.000Z", "passcode": "123456", "startTime": "2026-02-02T08:00:00.000Z", "passcodeHash": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"}', 'live', '2026-02-03 15:11:49.344867', 'NorthAmerica', 'generate-hybrid-63034', '2026-05-07 00:00:00', '2026-05-11 00:00:00', NULL, NULL, NULL, NULL, 'configured', '2026-02-03 18:34:18.177', 'ect-d467e25a'),
('evt-24aaa3a9', 'cust-15ea238f', 'Hawthorne Hybrid Conference 2025 - PayPal Advanced', '2026-05-04 08:00:00', '{}', NULL, 'int-6cd3c029', 'hawthorne-hybrid-paypa', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.367165', 'NorthAmerica', 'hawthorne-hybrid-paypa', '2026-05-04 08:00:00', '2026-05-06 17:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL),
('evt-76acb440', 'cust-15ea238f', 'Hawthorne''s GENERATE 2020 {Copy}', '2025-12-12 00:00:00', '{}', NULL, 'int-6cd3c029', 'HMW_NA-6838-28247-2816', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.478628', 'NorthAmerica', 'HMW_NA-6838-28247-2816', '2025-12-12 00:00:00', '2025-12-12 00:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL),
('evt-42b8f3d4', 'cust-15ea238f', 'Hawthorne''s GENERATE 2020 {Copy}', '2025-12-12 00:00:00', '{}', NULL, 'int-6cd3c029', 'HMW_NA-6838-28247-10291', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.490826', 'NorthAmerica', 'HMW_NA-6838-28247-10291', '2025-12-12 00:00:00', '2025-12-12 00:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL),
('evt-1a4f6578', 'cust-15ea238f', 'A new event', '2025-12-19 00:00:00', '{}', NULL, 'int-6cd3c029', 'HMW_NA-6838-28247-48843', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.499234', 'NorthAmerica', 'HMW_NA-6838-28247-48843', '2025-12-19 00:00:00', '2025-12-19 00:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL),
('evt-f2c2aab6', 'cust-15ea238f', 'a new event', '2025-12-19 00:00:00', '{}', NULL, 'int-6cd3c029', 'anewevent222', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.507312', 'NorthAmerica', 'anewevent222', '2025-12-19 00:00:00', '2025-12-19 00:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL),
('evt-459a1a40', 'cust-15ea238f', 'Hawthorne Hybrid Conference 2025 - Stripe Connected', '2027-08-01 08:00:00', '{}', 'prt-4bbb49e1', 'int-6cd3c029', 'generate-hybrid-63034-207', NULL, NULL, '{"enabled": true, "endTime": "2027-08-04T07:00:00.000Z", "passcode": "123456", "startTime": "2026-02-03T00:00:00.000Z", "passcodeHash": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"}', 'testing', '2026-02-03 15:11:49.356152', 'NorthAmerica', 'generate-hybrid-63034-207', '2027-08-01 08:00:00', '2027-08-03 17:00:00', NULL, NULL, NULL, NULL, 'configured', '2026-02-03 15:13:14.173', 'ect-35455ac9')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 9. BADGE TEMPLATES
-- ============================================
-- Note: Templates with banner images will need images re-uploaded in production
INSERT INTO badge_templates (
  id, customer_id, name, participant_type, participant_types, 
  background_color, text_color, accent_color, width, height, 
  include_qr, qr_position, qr_code_config, font_family, merge_fields, 
  image_elements, created_at
) VALUES
-- 4x3 template (no images)
('tpl-5e5018d2', 'cust-15ea238f', '4x3', 'Staff', '["Staff"]', 
 '#ffffff', '#1a1a1a', '#3b82f6', 4, 3, 
 true, 'bottom-right', 
 '{"fields": ["externalId", "email"], "embedType": "externalId", "separator": "|", "includeLabel": false}',
 'Tahoma',
 '[{"align": "center", "field": "firstName", "label": "First Name", "fontSize": 36, "position": {"x": 84, "y": 36}, "fontWeight": "bold", "horizontalAlign": "center"}, {"align": "center", "field": "lastName", "label": "Last Name", "fontSize": 28, "position": {"x": 108, "y": 93}, "fontWeight": "400", "horizontalAlign": "center"}, {"align": "center", "field": "company", "label": "Company", "fontSize": 18, "position": {"x": 138, "y": 190}, "fontWeight": "normal", "horizontalAlign": "center"}, {"align": "center", "field": "title", "label": "Title", "fontSize": 14, "position": {"x": 150, "y": 157}, "fontWeight": "normal", "horizontalAlign": "center"}]',
 '[]',
 '2026-01-07 01:20:42.837699'),
-- 4x3 with color banner (images stripped - re-upload banner in production)
('tpl-7edb91f4', 'cust-15ea238f', '4x3 with color banner', 'Staff', '["Staff"]', 
 '#ffffff', '#1a1a1a', '#3b82f6', 4, 3, 
 true, 'bottom-right', 
 '{"fields": ["externalId", "email"], "embedType": "externalId", "separator": "|", "includeLabel": false}',
 'Tahoma',
 '[{"align": "center", "field": "firstName", "label": "First Name", "fontSize": 26, "position": {"x": 102, "y": 84}, "fontWeight": "bold", "horizontalAlign": "center"}, {"align": "center", "field": "lastName", "label": "Last Name", "fontSize": 24, "position": {"x": 120, "y": 122}, "fontWeight": "400", "horizontalAlign": "center"}, {"align": "center", "field": "company", "label": "Company", "fontSize": 18, "position": {"x": 138, "y": 157}, "fontWeight": "normal", "horizontalAlign": "center"}, {"align": "center", "field": "title", "label": "Title", "fontSize": 14, "position": {"x": 150, "y": 192}, "fontWeight": "normal", "horizontalAlign": "center"}]',
 '[]',
 '2026-01-12 20:19:39.621282'),
-- 4x6 template (images stripped - re-upload banner in production)
('tpl-17020130', 'cust-15ea238f', '4x6', 'General', '["General", "VIP", "Speaker", "Sponsor", "Press", "Media", "Exhibitor"]', 
 '#ffffff', '#1a1a1a', '#3b82f6', 4, 6, 
 true, 'bottom-right', 
 '{"fields": ["externalId"], "embedType": "externalId", "separator": "|", "includeLabel": false}',
 'Tahoma',
 '[{"align": "center", "field": "firstName", "label": "First Name", "fontSize": 36, "position": {"x": 84, "y": 99}, "fontWeight": "bold", "horizontalAlign": "center"}, {"align": "center", "field": "lastName", "label": "Last Name", "fontSize": 28, "position": {"x": 108, "y": 158}, "fontWeight": "400", "horizontalAlign": "center"}, {"align": "center", "field": "company", "label": "Company", "fontSize": 18, "position": {"x": 138, "y": 260}, "fontWeight": "normal", "horizontalAlign": "center"}, {"align": "center", "field": "title", "label": "Title", "fontSize": 14, "position": {"x": 150, "y": 225}, "fontWeight": "normal", "horizontalAlign": "center"}]',
 '[]',
 '2025-12-17 17:46:02.378014')
ON CONFLICT (id) DO NOTHING;

-- NOTE: Badge template banner images were stripped due to size (base64 encoded).
-- You will need to re-upload the color banner images in production via the Badge Designer.

-- NOTE: Attendees are NOT included as they should be synced fresh from 
-- the North America integration rather than copied from development

-- NOTE: Integration credentials (username/password for North America integration)
-- must be configured manually in production under Integrations settings.

COMMIT;

-- ============================================
-- VERIFICATION QUERIES (run after import)
-- ============================================
-- SELECT COUNT(*) as customer_count FROM customers;
-- SELECT COUNT(*) as user_count FROM users;
-- SELECT COUNT(*) as event_count FROM events;
-- SELECT COUNT(*) as integration_count FROM customer_integrations;
