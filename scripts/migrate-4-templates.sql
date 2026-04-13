-- STEP 4: Badge Templates and Configuration Templates
-- Run this fourth

INSERT INTO badge_templates (
  id, customer_id, name, participant_type, participant_types, 
  background_color, text_color, accent_color, width, height, 
  include_qr, qr_position, qr_code_config, font_family, merge_fields, 
  image_elements, created_at
) VALUES (
  'tpl-5e5018d2', 'cust-15ea238f', '4x3', 'Staff', '["Staff"]', 
  '#ffffff', '#1a1a1a', '#3b82f6', 4, 3, 
  true, 'bottom-right', 
  '{"fields": ["externalId", "email"], "embedType": "externalId", "separator": "|", "includeLabel": false}',
  'Tahoma',
  '[{"align": "center", "field": "firstName", "label": "First Name", "fontSize": 36, "position": {"x": 84, "y": 36}, "fontWeight": "bold", "horizontalAlign": "center"}, {"align": "center", "field": "lastName", "label": "Last Name", "fontSize": 28, "position": {"x": 108, "y": 93}, "fontWeight": "400", "horizontalAlign": "center"}, {"align": "center", "field": "company", "label": "Company", "fontSize": 18, "position": {"x": 138, "y": 190}, "fontWeight": "normal", "horizontalAlign": "center"}, {"align": "center", "field": "title", "label": "Title", "fontSize": 14, "position": {"x": 150, "y": 157}, "fontWeight": "normal", "horizontalAlign": "center"}]',
  '[]',
  '2026-01-07 01:20:42.837699'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO badge_templates (
  id, customer_id, name, participant_type, participant_types, 
  background_color, text_color, accent_color, width, height, 
  include_qr, qr_position, qr_code_config, font_family, merge_fields, 
  image_elements, created_at
) VALUES (
  'tpl-7edb91f4', 'cust-15ea238f', '4x3 with color banner', 'Staff', '["Staff"]', 
  '#ffffff', '#1a1a1a', '#3b82f6', 4, 3, 
  true, 'bottom-right', 
  '{"fields": ["externalId", "email"], "embedType": "externalId", "separator": "|", "includeLabel": false}',
  'Tahoma',
  '[{"align": "center", "field": "firstName", "label": "First Name", "fontSize": 26, "position": {"x": 102, "y": 84}, "fontWeight": "bold", "horizontalAlign": "center"}, {"align": "center", "field": "lastName", "label": "Last Name", "fontSize": 24, "position": {"x": 120, "y": 122}, "fontWeight": "400", "horizontalAlign": "center"}, {"align": "center", "field": "company", "label": "Company", "fontSize": 18, "position": {"x": 138, "y": 157}, "fontWeight": "normal", "horizontalAlign": "center"}, {"align": "center", "field": "title", "label": "Title", "fontSize": 14, "position": {"x": 150, "y": 192}, "fontWeight": "normal", "horizontalAlign": "center"}]',
  '[]',
  '2026-01-12 20:19:39.621282'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO badge_templates (
  id, customer_id, name, participant_type, participant_types, 
  background_color, text_color, accent_color, width, height, 
  include_qr, qr_position, qr_code_config, font_family, merge_fields, 
  image_elements, created_at
) VALUES (
  'tpl-17020130', 'cust-15ea238f', '4x6', 'General', '["General", "VIP", "Speaker", "Sponsor", "Press", "Media", "Exhibitor"]', 
  '#ffffff', '#1a1a1a', '#3b82f6', 4, 6, 
  true, 'bottom-right', 
  '{"fields": ["externalId"], "embedType": "externalId", "separator": "|", "includeLabel": false}',
  'Tahoma',
  '[{"align": "center", "field": "firstName", "label": "First Name", "fontSize": 36, "position": {"x": 84, "y": 99}, "fontWeight": "bold", "horizontalAlign": "center"}, {"align": "center", "field": "lastName", "label": "Last Name", "fontSize": 28, "position": {"x": 108, "y": 158}, "fontWeight": "400", "horizontalAlign": "center"}, {"align": "center", "field": "company", "label": "Company", "fontSize": 18, "position": {"x": 138, "y": 260}, "fontWeight": "normal", "horizontalAlign": "center"}, {"align": "center", "field": "title", "label": "Title", "fontSize": 14, "position": {"x": 150, "y": 225}, "fontWeight": "normal", "horizontalAlign": "center"}]',
  '[]',
  '2025-12-17 17:46:02.378014'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_configuration_templates (
  id, customer_id, name, description, default_badge_template_id, 
  badge_template_overrides, default_printer_id, staff_settings, 
  workflow_snapshot, is_default, created_at, updated_at
) VALUES (
  'ect-d467e25a', 'cust-15ea238f', 'Standard with Badge print', NULL, 'tpl-17020130', NULL, 'prt-9ce3b841', 
  '{"enabled": true, "endPreset": "event_end", "startPreset": "event_day"}',
  '{"steps": [{"enabled": true, "position": 0, "stepType": "buyer_questions"}, {"enabled": true, "position": 1, "stepType": "disclaimer"}, {"enabled": true, "position": 2, "stepType": "badge_edit"}, {"enabled": true, "position": 3, "stepType": "badge_print"}], "enabled": true, "disclaimers": [{"title": "Disclaimer", "stepIndex": 0, "disclaimerText": "You need to agree and sign in order to attend.", "confirmationText": "I have read and agree to the above disclaimer.", "requireSignature": true}], "buyerQuestions": [{"options": [], "position": 0, "required": true, "stepIndex": 0, "questionText": "What is your primary purpose for attending this event?", "questionType": "text"}], "enabledForKiosk": true, "enabledForStaff": true}',
  false, '2026-01-16 03:08:06.637789', '2026-02-03 05:26:02.432'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_configuration_templates (
  id, customer_id, name, description, default_badge_template_id, 
  badge_template_overrides, default_printer_id, staff_settings, 
  workflow_snapshot, is_default, created_at, updated_at
) VALUES (
  'ect-35455ac9', 'cust-15ea238f', 'Quick Checkin', NULL, NULL, NULL, NULL,
  '{"enabled": true, "endPreset": "event_end", "startPreset": "event_day"}',
  '{"steps": [{"enabled": true, "position": 0, "stepType": "buyer_questions"}], "enabled": true, "disclaimers": [], "buyerQuestions": [{"options": [], "position": 0, "required": true, "stepIndex": 0, "questionText": "Primary goal for attending?", "questionType": "text"}], "enabledForKiosk": true, "enabledForStaff": true}',
  false, '2026-02-03 05:27:09.390862', '2026-02-03 05:27:09.390862'
)
ON CONFLICT (id) DO NOTHING;
