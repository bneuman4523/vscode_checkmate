-- STEP 5: Events (North America only)
-- Run this last

INSERT INTO events (
  id, customer_id, name, event_date, selected_templates, selected_printer_id, 
  integration_id, external_event_id, default_badge_template_id, printer_settings,
  temp_staff_settings, status, created_at, account_code, event_code, 
  start_date, end_date, badge_settings, location_id, location, venue,
  config_status, configured_at, config_template_id
) VALUES (
  'evt-7014dcf0', 'cust-15ea238f', 'Hawthorne Hybrid Conference 2026', '2026-05-07 00:00:00', '{}', 'prt-9ce3b841', 'int-6cd3c029', 'generate-hybrid-63034', 'tpl-17020130', NULL, '{"enabled": true, "endTime": "2026-05-11T07:00:00.000Z", "passcode": "123456", "startTime": "2026-02-02T08:00:00.000Z", "passcodeHash": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"}', 'live', '2026-02-03 15:11:49.344867', 'NorthAmerica', 'generate-hybrid-63034', '2026-05-07 00:00:00', '2026-05-11 00:00:00', NULL, NULL, NULL, NULL, 'configured', '2026-02-03 18:34:18.177', 'ect-d467e25a'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (
  id, customer_id, name, event_date, selected_templates, selected_printer_id, 
  integration_id, external_event_id, default_badge_template_id, printer_settings,
  temp_staff_settings, status, created_at, account_code, event_code, 
  start_date, end_date, badge_settings, location_id, location, venue,
  config_status, configured_at, config_template_id
) VALUES (
  'evt-24aaa3a9', 'cust-15ea238f', 'Hawthorne Hybrid Conference 2025 - PayPal Advanced', '2026-05-04 08:00:00', '{}', NULL, 'int-6cd3c029', 'hawthorne-hybrid-paypa', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.367165', 'NorthAmerica', 'hawthorne-hybrid-paypa', '2026-05-04 08:00:00', '2026-05-06 17:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (
  id, customer_id, name, event_date, selected_templates, selected_printer_id, 
  integration_id, external_event_id, default_badge_template_id, printer_settings,
  temp_staff_settings, status, created_at, account_code, event_code, 
  start_date, end_date, badge_settings, location_id, location, venue,
  config_status, configured_at, config_template_id
) VALUES (
  'evt-76acb440', 'cust-15ea238f', 'Hawthorne''s GENERATE 2020 {Copy}', '2025-12-12 00:00:00', '{}', NULL, 'int-6cd3c029', 'HMW_NA-6838-28247-2816', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.478628', 'NorthAmerica', 'HMW_NA-6838-28247-2816', '2025-12-12 00:00:00', '2025-12-12 00:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (
  id, customer_id, name, event_date, selected_templates, selected_printer_id, 
  integration_id, external_event_id, default_badge_template_id, printer_settings,
  temp_staff_settings, status, created_at, account_code, event_code, 
  start_date, end_date, badge_settings, location_id, location, venue,
  config_status, configured_at, config_template_id
) VALUES (
  'evt-42b8f3d4', 'cust-15ea238f', 'Hawthorne''s GENERATE 2020 {Copy}', '2025-12-12 00:00:00', '{}', NULL, 'int-6cd3c029', 'HMW_NA-6838-28247-10291', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.490826', 'NorthAmerica', 'HMW_NA-6838-28247-10291', '2025-12-12 00:00:00', '2025-12-12 00:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (
  id, customer_id, name, event_date, selected_templates, selected_printer_id, 
  integration_id, external_event_id, default_badge_template_id, printer_settings,
  temp_staff_settings, status, created_at, account_code, event_code, 
  start_date, end_date, badge_settings, location_id, location, venue,
  config_status, configured_at, config_template_id
) VALUES (
  'evt-1a4f6578', 'cust-15ea238f', 'A new event', '2025-12-19 00:00:00', '{}', NULL, 'int-6cd3c029', 'HMW_NA-6838-28247-48843', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.499234', 'NorthAmerica', 'HMW_NA-6838-28247-48843', '2025-12-19 00:00:00', '2025-12-19 00:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (
  id, customer_id, name, event_date, selected_templates, selected_printer_id, 
  integration_id, external_event_id, default_badge_template_id, printer_settings,
  temp_staff_settings, status, created_at, account_code, event_code, 
  start_date, end_date, badge_settings, location_id, location, venue,
  config_status, configured_at, config_template_id
) VALUES (
  'evt-f2c2aab6', 'cust-15ea238f', 'a new event', '2025-12-19 00:00:00', '{}', NULL, 'int-6cd3c029', 'anewevent222', NULL, NULL, NULL, 'testing', '2026-02-03 15:11:49.507312', 'NorthAmerica', 'anewevent222', '2025-12-19 00:00:00', '2025-12-19 00:00:00', NULL, NULL, NULL, NULL, 'unconfigured', NULL, NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (
  id, customer_id, name, event_date, selected_templates, selected_printer_id, 
  integration_id, external_event_id, default_badge_template_id, printer_settings,
  temp_staff_settings, status, created_at, account_code, event_code, 
  start_date, end_date, badge_settings, location_id, location, venue,
  config_status, configured_at, config_template_id
) VALUES (
  'evt-459a1a40', 'cust-15ea238f', 'Hawthorne Hybrid Conference 2025 - Stripe Connected', '2027-08-01 08:00:00', '{}', 'prt-4bbb49e1', 'int-6cd3c029', 'generate-hybrid-63034-207', NULL, NULL, '{"enabled": true, "endTime": "2027-08-04T07:00:00.000Z", "passcode": "123456", "startTime": "2026-02-03T00:00:00.000Z", "passcodeHash": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"}', 'testing', '2026-02-03 15:11:49.356152', 'NorthAmerica', 'generate-hybrid-63034-207', '2027-08-01 08:00:00', '2027-08-03 17:00:00', NULL, NULL, NULL, NULL, 'configured', '2026-02-03 15:13:14.173', 'ect-35455ac9'
)
ON CONFLICT (id) DO NOTHING;
