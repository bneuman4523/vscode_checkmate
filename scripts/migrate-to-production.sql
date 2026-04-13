-- Migration Script: Copy Development Data to Production
-- Run this against the PRODUCTION database after publishing
-- Generated: February 3, 2026

-- ============================================
-- CUSTOMERS
-- ============================================
INSERT INTO customers (id, name, created_at) VALUES
('cust-15ea238f', 'Demo1', '2025-12-17 17:46:02.378014'),
('cust-d48ec0e5', 'Demo1-EA', '2026-01-09 19:11:47.26866'),
('cust-4a88a446', 'Certain Events', '2026-01-15 16:24:40.894957'),
('cust-fa0d1d7f', 'Live Demo', '2026-01-20 21:22:40.449245')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- USERS
-- ============================================
INSERT INTO users (id, customer_id, email, first_name, last_name, role, phone_number, is_active, created_at) VALUES
('45310251', NULL, 'bdneu23@gmail.com', 'Brad', 'Neuman', 'super_admin', NULL, true, '2025-12-18 07:03:50.687131'),
('user-362c7f91', NULL, 'bdneu23@me.com', 'Brad1', 'Neuman1', 'super_admin', '+16508043400', true, '2026-01-05 16:57:45.382135'),
('user-a56ba732', NULL, 'jyarnell@certain.com', 'Jeff', 'Yarnell', 'super_admin', NULL, true, '2026-01-08 17:03:56.275324'),
('user-a3873bfa', 'cust-15ea238f', 'b1@c.com', 'Bradley24', 'Neuman', 'staff', '+15555555551', true, '2026-01-21 20:18:58.504143'),
('user-bf25c9b3', 'cust-4a88a446', 'bdneu23+44@gmail.com', 'Bradley', 'Neuman', 'staff', '+15555555555', true, '2026-01-21 20:27:48.120824'),
('user-fa45efa4', 'cust-15ea238f', 'bdneu23+56@gmail.com', 'B', 'Neuman', 'admin', '+14158555826', true, '2026-01-21 20:35:00.577357'),
('user-3c2154e3', 'cust-15ea238f', 'bdneu23+3454@gmail.com', 'Brad', 'Neuman', 'admin', '+15555553454', true, '2026-01-21 20:35:50.211225'),
('user-499f8cb2', 'cust-d48ec0e5', 'bdneu23+54@gmail.com', 'Test', 'Neuman', 'admin', '+15555555544', true, '2026-01-30 16:12:24.657825'),
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
-- VERIFICATION QUERIES (run after import)
-- ============================================
-- SELECT COUNT(*) as customer_count FROM customers;
-- SELECT COUNT(*) as user_count FROM users;
