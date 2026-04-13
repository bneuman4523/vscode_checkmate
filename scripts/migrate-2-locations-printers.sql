-- STEP 2: Locations and Printers
-- Run this second

INSERT INTO locations (id, customer_id, name, address, city, state, country, timezone, match_patterns, is_active, created_at) VALUES
('loc-e335ce1b', 'cust-15ea238f', 'location1', '75 Hawthorne', 'San Francisco', 'California', 'United States', NULL, '["SF", "San Francisco"]', true, '2026-01-13 06:09:20.989467')
ON CONFLICT (id) DO NOTHING;

INSERT INTO locations (id, customer_id, name, address, city, state, country, timezone, match_patterns, is_active, created_at) VALUES
('loc-a401be2b', 'cust-15ea238f', 'Location2', '555 Main Street', 'Chicago', 'IL', NULL, NULL, '["Chicago", "CHI"]', true, '2026-01-13 06:10:25.697591')
ON CONFLICT (id) DO NOTHING;

INSERT INTO printers (id, customer_id, name, connection_type, ip_address, port, dpi, is_default, is_active, created_at) VALUES
('prt-e21841b3', 'cust-15ea238f', '620 wifi', 'wifi', '010.000.000.135', 9100, 300, true, true, '2025-12-23 05:52:09.903024')
ON CONFLICT (id) DO NOTHING;

INSERT INTO printers (id, customer_id, name, connection_type, ip_address, port, dpi, is_default, is_active, created_at) VALUES
('prt-4bbb49e1', 'cust-15ea238f', 'Zebra Technologies ZTC ZD620-203dpi ZPL', 'usb', NULL, NULL, 300, true, true, '2025-12-24 05:50:24.928028')
ON CONFLICT (id) DO NOTHING;

INSERT INTO printers (id, customer_id, name, connection_type, ip_address, port, dpi, is_default, is_active, created_at) VALUES
('prt-9ce3b841', 'cust-15ea238f', 'epson', 'airprint', NULL, NULL, 300, true, true, '2026-01-06 20:18:52.514341')
ON CONFLICT (id) DO NOTHING;

INSERT INTO printers (id, customer_id, name, connection_type, ip_address, port, dpi, is_default, is_active, created_at) VALUES
('prt-76198056', 'cust-15ea238f', 'epson2', 'airprint', NULL, NULL, 600, true, true, '2026-01-07 00:09:46.002472')
ON CONFLICT (id) DO NOTHING;

INSERT INTO printers (id, customer_id, name, connection_type, ip_address, port, dpi, is_default, is_active, created_at) VALUES
('prt-28453125', 'cust-15ea238f', 'Zebra ZD621 nework printer', 'wifi', '10.0.0.51', 9100, 300, false, true, '2026-01-07 21:31:38.56221')
ON CONFLICT (id) DO NOTHING;

INSERT INTO printers (id, customer_id, name, connection_type, ip_address, port, dpi, is_default, is_active, created_at) VALUES
('prt-4692d732', 'cust-15ea238f', 'WC621', 'wifi', '10.209.113.33', 9100, 300, false, true, '2026-01-22 04:27:47.428477')
ON CONFLICT (id) DO NOTHING;
