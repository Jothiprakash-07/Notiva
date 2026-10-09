# Deleted item retention

User DELETE continues to soft-delete an item. Normal GET and PATCH exclude it.
The payload stays in `items` for 15 days by default. At the exact retention
boundary (`deletedAt <= now - retention`) it becomes eligible for cleanup.
Daily processing means actual payload removal can occur up to one daily cycle
later, or later still if the database/job is unavailable.

`ITEM_DELETE_RETENTION_DAYS` configures a positive number of days. Missing
configuration defaults to 15; invalid configuration prevents scheduler startup.
No short-duration production/test environment override is provided. Tests inject
time or use old deletion timestamps. Restart the backend after configuration changes.

After MongoDB connection and identity, item and archive index initialization,
the scheduler runs once, then schedules another run 24 hours after completion.
Runs do not overlap in the same scheduler. Errors log only fixed messages/counts
and retry on the next scheduled run. No Compass/manual deletion is needed.

Cleanup reads at most 100 metadata projections per batch using `_id` keyset
pagination. It upserts `deleted_items` with only `ownerUserId`, `clientItemId`,
`type`, `deletedAt`, `hardDeletedAt`, `reason` (`user_deleted`), and MongoDB `_id`.
No title, description, notes, history, alarm data or account/auth data is copied.
`hardDeletedAt` is the first archive attempt time preceding the conditional delete;
if deletion fails or concurrent state changes, it is not proof that removal completed.
The original remains available for retry on any unacknowledged/failed audit write.
Audit and delete request majority acknowledgement. There is no cross-document
transaction: an audit can exist temporarily (or after a skipped concurrent change)
while the source still exists. The delete matches `_id`, expected `deletedAt`,
`revision` and `serverUpdatedAt`; active/restored or normally modified rows survive.
Direct database writers must also maintain revision/server timestamp semantics.

Explicit indexes retain `autoIndex: false` and never drop existing indexes:
- `items`: `deletedAt` for expiry selection.
- `deleted_items`: unique `(ownerUserId, clientItemId, deletedAt)` for one audit
  per deletion lifecycle and efficient owner/client lookup. Different users and
  distinct deletion timestamps do not collide.

Stats: `found` counts candidates, `archived` counts new audit inserts,
`hardDeleted` counts removed documents, `failed` counts per-item failures.
A conditional delete with zero matches is safely skipped, not a failure.

## Sync compatibility

GET continues to return only active records. The authenticated
`GET /api/items/deletions` feed reads soft-deleted items and minimal archives.
Frontend merge preserves local tombstones, and DELETE 404 is acknowledged as
success by sync. Hard deletion preserves these contracts.
POST checks owner/client deletion evidence in the archive and returns 409 for
a retired ID, preventing delayed offline creates from resurrecting it. The
existing API does not support intentional reuse/restore of a deleted ID; use a
new client ID. The archive unique index itself permits distinct lifecycles.
While cleanup and POST race, the existing item unique index protects the ID
until the audit is acknowledged; thereafter the archive check protects it.
POST also checks the archive after insertion. If cleanup raced with its initial
lookup, it soft-deletes only that newly inserted document and returns 409.

Frontend sync applies explicit deletion evidence to stale local copies. Plain GET
omission never deletes local-only data. See `ITEM_DELETION_FEED.md` for cursor,
conflict and alarm reconciliation behavior.
Payload retention is not a maximum offline duration: minimal deletion evidence
remains indefinitely for stale-create protection.

## Operations and future policy

Run backend regressions: `node --test tests/*.test.js` from `backend`.
Run sync regressions: `node scripts/test-item-sync.cjs` and
`node scripts/test-item-delete-sync.cjs` from the project root.
Local MongoDB validation: `node scripts/validateItemCleanup.js` from `backend`.
It uses only a uniquely named isolated test database on localhost, creates its
own fixtures and removes only those test documents; it never loads `.env`.

Archives are retained for this task. Consider a future optional 90-day purge/TTL
only after a deletion-feed/offline-expiry policy ensures old clients cannot
recreate deleted data when archive evidence expires. No TTL is installed now.
Multiple instances can safely retry audit upserts/conditional deletes, although
unique-upsert races may fail and retry later. Add a distributed job lock or an
external singleton scheduler if deployment scales. Batches bound memory, not
total run time; large backlogs may need job time limits and metrics later.
