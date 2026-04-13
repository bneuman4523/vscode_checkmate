# Twilio SMS Integration Setup Guide

## Overview

This guide walks you through securely adding your Twilio credentials to Replit and integrating SMS notifications for check-in events.

## Prerequisites

- ✅ Twilio account with active license
- ✅ Twilio Account SID
- ✅ Twilio Auth Token
- ✅ Twilio Phone Number (in E.164 format: +1234567890)

## Step 1: Add Twilio Credentials to Replit Secrets

### Option A: Using Replit Secrets UI (Recommended)

1. **Open the Secrets Panel**:
   - In your Replit workspace, look for the **Tools** panel on the left sidebar
   - Click on **Secrets** (lock icon 🔒)

2. **Add TWILIO_ACCOUNT_SID**:
   - Click **+ Add new secret**
   - Key: `TWILIO_ACCOUNT_SID`
   - Value: Paste your Twilio Account SID (starts with "AC...")
   - Click **Add secret**

3. **Add TWILIO_AUTH_TOKEN**:
   - Click **+ Add new secret**
   - Key: `TWILIO_AUTH_TOKEN`
   - Value: Paste your Twilio Auth Token
   - Click **Add secret**

4. **Add TWILIO_PHONE_NUMBER**:
   - Click **+ Add new secret**
   - Key: `TWILIO_PHONE_NUMBER`
   - Value: Your Twilio phone number in E.164 format (e.g., `+12025551234`)
   - Click **Add secret**

### Option B: Using Replit Twilio Connector (Alternative)

1. Click on **Tools** → **Integrations**
2. Search for "Twilio"
3. Click **Connect** and follow the authorization flow
4. Replit will automatically configure the secrets for you

**Note**: You dismissed the connector earlier, but you can always go back and use it if you prefer.

## Step 2: Verify Secrets Are Set

1. Open the **Shell** in Replit
2. Run this command to verify secrets are accessible:
   ```bash
   printenv | grep TWILIO
   ```
3. You should see output like:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=********************************
   TWILIO_PHONE_NUMBER=+12025551234
   ```

**Security Note**: The Shell shows the actual values, but these are **never exposed** in your code, UI, or to other users.

## Step 3: Install Twilio SDK

The Twilio SDK needs to be installed to send SMS messages.

1. I'll install it for you automatically, or you can run:
   ```bash
   npm install twilio
   ```

## Step 4: Update Notification Service

Once secrets are set, the notification service needs to be updated to use the actual Twilio SDK instead of placeholders.

### Current Code (Placeholder):
```typescript
// TODO: Use Twilio connector to send SMS
// For now, log the message
console.log('[NotificationService] SMS message:', message);
console.log('[NotificationService] Recipients:', config.smsRecipients);
```

### Updated Code (Real Integration):
```typescript
import twilio from 'twilio';

// In sendSMS method:
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

for (const recipient of config.smsRecipients) {
  await twilioClient.messages.create({
    to: recipient,
    from: process.env.TWILIO_PHONE_NUMBER,
    body: message,
  });
}
```

## Step 5: Test SMS Notifications

### Create a Test Notification Configuration

1. Navigate to **Notifications** in your app
2. Click **Add Notification**
3. Configure:
   - **Name**: "Test SMS Alert"
   - **Trigger Event**: Check-in
   - **Enable SMS**: Toggle ON
   - **Phone Numbers**: Your personal phone number (for testing)
4. Click **Save**

### Trigger a Test Check-In

1. Go to **Kiosk Mode**
2. Click **Start Check-In**
3. When check-in completes, you should receive an SMS like:

```
Check-in Alert: John Doe (VIP) has checked in to Annual Conference 2024. 
Company: Acme Corp, Title: CEO
```

## Step 6: Configure Production Notifications

Once testing is successful, configure real notification rules:

### Example: VIP Check-in Alerts

```json
{
  "name": "VIP Check-in Alerts",
  "triggerEvent": "check_in",
  "participantTypeFilter": "VIP",
  "smsEnabled": true,
  "smsRecipients": [
    "+12025551001",  // Event Manager
    "+12025551002"   // VIP Coordinator
  ]
}
```

### Example: Speaker Check-in Alerts

```json
{
  "name": "Speaker Check-in Alerts",
  "triggerEvent": "check_in",
  "participantTypeFilter": "Speaker",
  "smsEnabled": true,
  "smsRecipients": [
    "+12025551003"  // AV Coordinator
  ]
}
```

### Example: All Check-ins

```json
{
  "name": "All Check-in Alerts",
  "triggerEvent": "check_in",
  "smsEnabled": true,
  "emailEnabled": true,
  "smsRecipients": ["+12025551000"],
  "emailRecipients": ["events@company.com"]
}
```

## Security Best Practices

### ✅ Do's

- ✅ Store credentials in Replit Secrets only
- ✅ Use environment variables (`process.env.TWILIO_*`)
- ✅ Implement error handling for failed SMS
- ✅ Log SMS events (without showing credentials)
- ✅ Rotate Auth Token periodically
- ✅ Monitor Twilio usage dashboard for anomalies

### ❌ Don'ts

- ❌ Never hardcode credentials in code
- ❌ Never commit credentials to git
- ❌ Never log `process.env.TWILIO_AUTH_TOKEN`
- ❌ Never share secrets in chat or email
- ❌ Never expose secrets in error messages
- ❌ Never print environment variables in production code

## Troubleshooting

### SMS Not Sending

**Check 1: Verify Secrets Are Set**
```bash
printenv | grep TWILIO
```
All three secrets should appear.

**Check 2: Verify Phone Number Format**
- Must be E.164 format: `+[country code][number]`
- Example: `+12025551234` (not `(202) 555-1234`)

**Check 3: Check Twilio Dashboard**
- Log into [Twilio Console](https://console.twilio.com/)
- Check **Messaging** → **Logs**
- Look for error messages

**Check 4: Verify Recipient Numbers**
- Recipient numbers must also be in E.164 format
- If using trial account, recipients must be verified

**Check 5: Check Application Logs**
- Look for errors in notification service logs
- Check for rate limiting or API errors

### Common Error Messages

**Error: "The number +1234567890 is unverified"**
- **Solution**: Add number to verified list in Twilio Console (trial accounts only)

**Error: "Authenticate"**
- **Solution**: Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct

**Error: "Invalid 'To' Phone Number"**
- **Solution**: Ensure recipient number is in E.164 format (+1234567890)

**Error: "Permission to send an SMS has not been enabled"**
- **Solution**: Enable SMS in Twilio Console settings

### Rate Limiting

Twilio has rate limits depending on your account type:
- **Trial**: 1 message/second
- **Paid**: Varies by plan

If you hit rate limits:
1. Add delays between SMS sends
2. Batch notifications
3. Upgrade Twilio plan

## Cost Monitoring

### SMS Pricing
- Varies by country and carrier
- USA: ~$0.0079 per SMS (outbound)
- Check current pricing: [Twilio Pricing](https://www.twilio.com/pricing/messaging)

### Monitor Usage
1. Twilio Console → **Monitor** → **Usage**
2. Set up usage alerts
3. Track monthly costs

### Cost Optimization
- Use SMS only for critical notifications (VIPs, Speakers)
- Use email for general notifications (cheaper/free)
- Filter by participant type to reduce volume
- Set up notification schedules (avoid off-hours)

## Production Checklist

Before going live with SMS notifications:

- [ ] Twilio credentials stored in Replit Secrets
- [ ] Twilio SDK installed (`npm install twilio`)
- [ ] Notification service updated with real Twilio integration
- [ ] Test SMS sent and received successfully
- [ ] Production notification rules configured
- [ ] Phone numbers verified (if using trial account)
- [ ] Usage alerts set up in Twilio Console
- [ ] Error handling implemented
- [ ] Logging configured (without exposing secrets)
- [ ] Recipient phone numbers validated (E.164 format)
- [ ] Rate limiting understood and handled
- [ ] Cost monitoring in place

## Next Steps

Once SMS is working:

1. **Add Email Notifications** (SendGrid or Resend)
2. **Configure Webhooks** for third-party integrations
3. **Set up Notification Templates** for custom messages
4. **Implement Notification Preferences** (let attendees opt-in/out)

## Support Resources

- **Twilio Documentation**: https://www.twilio.com/docs
- **Twilio Node.js SDK**: https://www.twilio.com/docs/libraries/node
- **Twilio Support**: https://support.twilio.com/
- **Replit Secrets Docs**: https://docs.replit.com/programming-ide/workspace-features/secrets

## Files to Update

When you're ready to implement, these files need changes:

1. **server/services/notification-service.ts**
   - Replace TODO comments with actual Twilio SDK calls
   - Add error handling
   - Add logging

2. **NOTIFICATION_MODULE.md**
   - Mark SMS integration as complete
   - Update status from "planned" to "implemented"

3. **replit.md**
   - Remove Twilio reminder from "Important Reminders"
   - Update notification module status

---

**Need Help?** 
- Contact me when your Twilio license arrives
- I'll help you complete the integration step-by-step
- We'll test together before going live
