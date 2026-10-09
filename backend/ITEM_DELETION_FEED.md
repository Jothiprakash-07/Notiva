# Cross-device deletion feed

`GET /api/items/deletions?since=<UTC ISO timestamp>` uses existing JWT auth.
Register it before the `/:clientItemId` route. Owner comes exclusively from JWT,
never a query/body owner. Invalid timestamps return 400; unauthenticated requests
return 401; database errors return generic 503.

Response: `{ success: true, deletions: [{ clientItemId, deletedAt, revision? }],
cursor: <UTC ISO timestamp or null> }`. Only identities and deletion metadata
are public. No titles, descriptions, recurrence content, alarms or account data
are exposed. Revision is available for soft-deleted source rows; the existing
minimal archive does not retain revision, so archived entries omit it.

Both `items` and `deleted_items` are filtered by owner and `deletedAt > since`.
No `since` means full replay. Active rows are excluded. Read items first and
archive second so archive-before-delete cleanup cannot hide a record between
queries. Deduplicate by client ID (latest deletion wins). Explicit indexes on
`(ownerUserId, deletedAt)` support both source queries; autoIndex remains false.
15-day cleanup and its minimal archive schema are otherwise unchanged.

The cursor is derived from the newest returned deletion, minus one millisecond
for safe equal-timestamp replay; it is never advanced using the device clock or
simply the HTTP request time. Empty responses keep the supplied cursor. Sync
does a full replay on each new session/module restart and whenever a local
non-tombstoned ID is absent from the active server list. This catches old/delayed
deletions even if they predate the cursor; omission alone never deletes data.
Subsequent reconciled sync runs request the incremental feed.

## Local reconciliation

Push local operations, merge active items, then fetch/apply deletions. The
existing account generation and storage mutation locks protect session changes.
An authenticated deletion is final for that owner/client ID: synced rows and
pending updates disappear, pending deletes are confirmed, and obsolete outbox
operations are cleared. Intentional ID reuse/restore is not supported by the
existing server API. A genuinely different owner's same-ID pending create is
unaffected. Only explicit owner-scoped evidence can retire a pending create.

Local tombstones block stale active responses and stale local snapshots from
recreating deleted identities. Recurring occurrence deletion matches existing
local semantics: exclude its date, hide a deleted root occurrence while keeping
the series anchor, and reconcile future recurring alarms with existing services.
The algorithm does not stop the entire series when deleting one occurrence.

`deletionCursor` is persisted per owner inside the existing authoritative
`notiva.item.sync.queue.v1:<encodedUserId>` snapshot (native `.json` file/web
localStorage), together with items, outbox, tombstones and
`pendingDeletionCancellations`. Its existing backup recovers interrupted writes.
Cancellation intent commits before OS cancellation; cursor commits only after
cancellation/reconciliation. Existing notification/native services cancel only
the removed occurrence's persisted IDs and deterministic account-scoped ID.
Native cancellation failures keep durable intent for retry, including offline
item reads after restart. Unrelated alarms
remain local and work offline. Remote changes notify existing restore listeners
so the current lists refresh without UI redesign.

## Validation

- Backend: `node --test backend/tests/*.test.js`.
- Frontend: `node scripts/test-item-deletion-feed.cjs`, existing item sync/delete,
  recurrence and alarm contract scripts; `npx tsc --noEmit`.
- Real isolated MongoDB: `node backend/scripts/validateDeletionFeed.js`.
- Opt-in physical test: `node scripts/validate-device-deletion.cjs prepare`,
  `check`, `delete`, `check`, then force-stop/reopen and `check`. Uses one
  connected debuggable Android app and a second authenticated API session.
  This script only creates/deletes its clearly named test item, keeps tokens
  in memory, and never prints credentials or full payloads. It does not validate
  two physical phones. Its local marker identifies the test fixture without secrets.

## Limits and future work

Transport is foreground/network dependent (current retry interval: 30 seconds).
A remote deletion cannot reach a device while offline. Existing Expo
cancellation helpers may suppress OS errors; native bridge failures propagate
and retry. Retained recurring anchors intentionally preserve future occurrences.
Deletion feed responses are currently unpaginated; add stable pagination or a
dedicated ordered log if per-owner deletion history becomes large. Archives
remain indefinitely; coordinate any future TTL/purge with offline expiry/reset
policy so old devices cannot resurrect retired IDs. No TTL is installed here.
