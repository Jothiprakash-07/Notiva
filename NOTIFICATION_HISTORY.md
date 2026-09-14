# Notification history

Notifications is a device-local alert history, capped at the newest 200 entries. Native storage uses a separate expo-file-system document file; web uses localStorage. No backend or item-storage writes are involved.

## Recording

The root layout registers one received listener, and recovers currently presented notifications on mount and on AppState becoming active. The existing response consumer also records tapped notifications (including cold starts) as read. Nothing is recorded by scheduling or inferred from item due dates. Notification content provides the title/body/type snapshot even if the item is subsequently edited or deleted. Development test notifications are excluded.

Expo SDK 54 references: https://docs.expo.dev/versions/v54.0.0/sdk/notifications/#addnotificationreceivedlistenerlistener and https://docs.expo.dev/versions/v54.0.0/sdk/notifications/#getpresentednotificationsasync

Foreground receipt is recorded while the root listener is mounted. Background/closed delivery is best effort: a tap or an alert still in the tray on resume can be recovered. An alert dismissed before JavaScript observes it cannot be recovered. Recurring notifications may replace previous tray occurrences. Web has history storage/UI but the existing app does not generate native phone alerts there. This is not a complete OS delivery ledger, and receipt does not prove the user saw a banner.

The installed SDK 54 iOS serializer supplies Unix seconds; Android supplies milliseconds. Timestamps are normalized and formatted with the existing device-local date utilities. Rows show actual alert time even for all-day items.

## Behavior

Request identifier plus OS occurrence date deduplicates receipt, response, and tray observations, while preserving subsequent deliveries of recurring requests and separate burst requests. Writes are serialized. Clear All stores a cutoff as well as removing entries so old tray/response observations cannot restore cleared history. No system notifications are dismissed or cancelled by clearing history.

Opening the tab reloads using useFocusEffect without polling. A small subscription updates visible history and the unread tab badge after writes. Opening the screen does not mark entries read. Tapping loads the current referenced item and marks the entry read. Missing items show "This item is no longer available." Unresolved reminders/tasks use isActionRequired and the existing ActionRequiredStack; all others open the existing Details route. Phone notification taps retain their previous cancellation/navigation behavior.

## Verification

- npx tsc --noEmit: passed.
- Targeted ESLint on all six changed/created TypeScript files: passed.
- node scripts/test-notification-history.cjs: passed for mocked native file and web storage, including concurrent duplicate observations, recurring occurrences, timestamp normalization, sorting, 200-entry limit, read state, write failure recovery, clear/recovery replay, and subscriptions.
- Physical-device delivery and visual UI verification remain manual.

Device checklist: receive each item type in foreground; swipe its phone alert and verify history persists; tap one history row and inspect routing/badge; delete a referenced item and tap its retained row; cancel then confirm Clear All; resume with old alerts still in the tray and verify history remains empty; receive a new alert and verify it appears; test background receipt, cold-start tap, recurring occurrences, and restart persistence. Verify Clear All leaves items and scheduled phone alerts intact.
