-- STEP 1A: Create Customer FIRST
-- Run this before users

INSERT INTO customers (id, name, contact_email, created_at) VALUES
('cust-15ea238f', 'Demo1', 'b@c.com', '2025-12-17 17:46:02.378014')
ON CONFLICT (id) DO NOTHING;
