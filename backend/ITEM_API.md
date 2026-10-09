# Personal item API foundation

Automatic deletion retention and archive behavior are documented in
[ITEM_RETENTION.md](ITEM_RETENTION.md). Deleted client IDs remain retired after
payload cleanup; POST checks minimal archive evidence to prevent resurrection.

All `/api/items` routes use the existing Bearer JWT authentication middleware.
Ownership comes exclusively from the authenticated account. There is no
organization filter or organization cascade deletion.

- `POST /api/items`: send the existing `ReminderItem` fields with `clientItemId`
  (or the existing `id`). If both are supplied they must match. Returns 201.
  A same-owner duplicate, including a deleted item, returns 409. Different
  owners may use the same client ID. Creation is not an upsert.
- `GET /api/items`: returns `{ success: true, items }`, excluding tombstones.
- `GET /api/items/deletions?since=<UTC ISO timestamp>`: authenticated deletion
  identities from soft-deleted rows and retained minimal archives. See
  [ITEM_DELETION_FEED.md](ITEM_DELETION_FEED.md).
- `GET /api/items/:clientItemId`: returns `{ success: true, item }` or 404.
- `PATCH /api/items/:clientItemId`: send only changed frontend item fields.
  Identity, ownership, creation time and server metadata cannot be edited.
  Returns the updated item and increments `revision` atomically.
- `DELETE /api/items/:clientItemId`: retains a tombstone, increments revision
  once, and returns `{ success: true }`. Repeating the deletion succeeds.
  Missing and cross-account items return the same 404.

Encode client IDs when building URLs; recurring occurrence IDs contain colons.
The public response includes `id` as an alias of `clientItemId`, frontend item
fields, `revision`, `deletedAt`, `serverCreatedAt` and `serverUpdatedAt`.
It excludes MongoDB identity and ownership. `createdAt` and `updatedAt` retain
the original client timestamps. Server timestamps are authoritative for backend
writes and future incremental synchronization; do not use client timestamps
as a server sync cursor. PATCH preserves omitted fields, including updatedAt.
Optional fields are replaced when supplied. PATCH null removes optional fields;
category, priority and alertBefore instead retain their frontend-nullable value.
Required fields cannot be removed.

Recurrence, history and completion metadata are stored without generating
occurrences or recalculating status. Device notification IDs are preserved for
round-trip compatibility; they must not be reused as valid OS schedules on a
different device. Restore must schedule alarms locally.

Explicit startup initialization creates indexes before accepting requests with
autoIndex disabled. It does not drop indexes or migrate/delete existing data.
Restart the backend to activate routes and create indexes. Automated tests use
isolated model doubles and real Express/JWT/schema validation; production
MongoDB writes and index creation are not certified by those tests.

This foundation does not yet expose active-item pagination,
optimistic concurrency preconditions, retry-operation deduplication, or a
multi-device conflict policy. Concurrent PATCH requests currently use MongoDB's
atomic writes and increment revision; the last write to each field wins. A
retried PATCH can increment revision again. Define those contracts before
connecting a frontend sync queue.
