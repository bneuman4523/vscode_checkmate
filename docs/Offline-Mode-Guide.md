# Offline Mode Guide

## Overview

Greet includes robust offline-first capabilities that allow staff to continue checking in attendees even when internet connectivity is lost. All check-ins performed offline are automatically synced back to the server when connectivity is restored.

## How It Works

### Automatic Data Caching

When a staff member opens the Staff Dashboard for an event, the system automatically:

1. **Downloads all attendee data** to the device's local storage (IndexedDB)
2. **Caches badge templates** needed for printing
3. **Stores event configuration** for offline access

This happens in the background without any action required from staff.

### Offline Check-in Flow

1. Staff opens the Staff Dashboard while online (data is cached automatically)
2. If connectivity is lost, the status indicator changes from green "Online" to orange "Offline"
3. Staff can continue checking in attendees normally
4. Check-ins are stored locally and added to a sync queue
5. When connectivity returns, the status changes back to "Online"
6. Queued check-ins automatically sync to the server

### Status Indicator

The Staff Dashboard header displays a connectivity status badge:

| Status | Badge Color | Description |
|--------|-------------|-------------|
| Online | Green | Connected and synced |
| Syncing | Gray (spinning) | Currently syncing pending actions |
| Offline | Orange | Working offline, check-ins will queue |
| X pending | Gray | Number of actions waiting to sync |

**Manual Sync**: When online, you can click the "X pending" badge to manually trigger a sync.

## Kiosk Mode

Kiosk mode has enhanced offline support with explicit pre-caching:

1. **Enable Offline Mode button**: Before going offline, use this to download all attendee and template data
2. **Progress indicator**: Shows caching progress (attendees, templates, events)
3. **Offline Mode Ready**: Confirmation when all data is cached
4. **Automatic fallback**: Uses cached data when connectivity drops

### Preparing a Kiosk for Offline Use

1. Set up the kiosk while connected to the internet
2. Navigate to the event kiosk
3. Click "Enable Offline Mode" button
4. Wait for "Offline Mode Ready" confirmation
5. The kiosk can now operate without internet

## Sync Queue Behavior

### What Gets Queued

- Attendee check-ins
- Check-in reversals (when supported)

### Sync Priority

When connectivity is restored:

1. Queue items are processed in order (first-in, first-out)
2. Each item is synced individually to ensure data integrity
3. Successfully synced items are removed from the queue
4. Failed items remain in queue for retry

### Error Handling

| Response Code | Behavior |
|---------------|----------|
| 200 OK | Success - removed from queue |
| 400 Bad Request | Invalid data - removed from queue |
| 409 Conflict | Already checked in - removed from queue |
| 401 Unauthorized | Auth expired - kept for retry after re-login |
| 500+ Server Error | Server issue - kept for automatic retry |

## Technical Details

### Storage

- **IndexedDB**: Browser-based database for offline storage
- **Capacity**: Typically 50MB+ available (varies by browser)
- **Persistence**: Data survives browser restarts

### Key Components

| File | Purpose |
|------|---------|
| `client/src/lib/offline-db.ts` | IndexedDB wrapper with attendee/template/queue storage |
| `client/src/components/OfflineStatus.tsx` | Header status indicator and sync trigger |
| `client/src/services/kiosk-precache-service.ts` | Kiosk mode pre-caching logic |
| `client/src/services/offline-checkin-service.ts` | Offline check-in processing |

### React Hooks

| Hook | Purpose |
|------|---------|
| `useOnlineStatus` | Track connectivity state and pending sync count |
| `useOfflineSync` | Auto-cache data when event loads |
| `useOfflineAttendees` | Get attendees with offline fallback |

## Best Practices

### Before the Event

1. **Test offline mode** at the venue before the event starts
2. **Pre-cache data** on all kiosk devices while connected
3. **Verify badge templates** render correctly offline

### During the Event

1. **Monitor the status indicator** to know when you're offline
2. **Don't worry about pending syncs** - they'll process automatically
3. **Keep devices charged** - offline mode uses local storage

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Check-ins not syncing | Verify internet connectivity, check status indicator |
| "X pending" not decreasing | May need to re-login if session expired |
| No cached data available | Return online and reload the dashboard |
| Kiosk shows empty attendee list | Use "Enable Offline Mode" to pre-cache |

## Limitations

1. **Initial connection required**: Must be online to initially load event data
2. **New attendees**: Attendees added after caching won't appear until back online
3. **Real-time updates**: Changes made by other staff won't sync while offline
4. **Badge printing**: Requires cached templates; new templates need online access

## Security Notes

- Cached data is stored locally on the device
- Staff authentication tokens are preserved for sync-back
- Expired tokens will prevent sync until re-login
- Data is automatically cleaned up when switching events
