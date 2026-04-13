# Security & Data Architecture

## Multi-Tenant Data Isolation

This application implements strict tenant isolation for PCI and compliance certifications:

### Database Architecture

1. **Customer-Level Isolation**
   - All data tables include `customer_id` foreign key
   - Row-Level Security (RLS) enforced at database level
   - No cross-customer data access possible
   - Cascade deletes ensure complete data removal

2. **Minimal Data Storage**
   - Only essential PII stored (first name, last name, email)
   - No payment information stored in application
   - No sensitive personal data beyond what's needed for check-in/badges
   - External platform data referenced by ID only (not duplicated)

3. **Credential Security**
   - API credentials NEVER stored in database
   - Credentials stored as environment variables per customer
   - Database only stores reference key names
   - All credentials encrypted at rest
   - Credentials rotatable without data migration

4. **Audit Trail**
   - Minimal check-in logging for compliance
   - Timestamps for all critical actions
   - User attribution where applicable
   - Automatic cleanup policies

### Data Flow

```
External Platform → API Integration → Minimal Local Cache → Event Check-in
                                            ↓
                                    IndexedDB (Offline)
                                            ↓
                                    Sync Queue (when online)
```

### Compliance Features

- **PCI DSS**: No payment data stored
- **GDPR**: Minimal PII, easy data deletion
- **SOC 2**: Audit trails, access controls
- **Multi-tenant**: Complete data isolation per customer

### Data Retention

- Attendee data: Event-scoped, deletable post-event
- Credentials: Rotatable, encrypted at rest
- Logs: Configurable retention periods
- Templates: Customer-owned, persistent

## Security Best Practices

1. All database queries filtered by `customer_id`
2. API endpoints validate customer context
3. Users cannot access other customers' data
4. Super admins have read-only view of customer list only
5. Credentials managed through secure environment variables
