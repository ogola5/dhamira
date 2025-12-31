# Savings Lifecycle — Dhamira

This document describes the full lifecycle of client savings in the Dhamira codebase: where savings are stored, how they are created and updated, audit trails, relevant routes/controllers/models, UI integration notes, and recommended improvements and migration steps.

---

## Summary (short)
- Aggregated current balance is stored on the `clients` collection in the field `savings_balance_cents` (see `models/ClientModel.js`).
- Individual savings events (deposits/deductions) are recorded as `Transaction` documents in the `transactions` collection with `rawCallback.source === 'savings'` (see `models/TransactionModel.js`).
- There are two API entry points used in the codebase to change savings:
  - `POST /api/savings` — full savings endpoint (creates a `Transaction` audit and updates client balance). Requires `approver_admin` or `super_admin`.
  - `POST /api/clients/:id/savings` — client-scoped add-only endpoint (adds to `Client.savings_balance_cents` only). Requires `initiator_admin` or `super_admin`.

## Models involved

- `Client` (`models/ClientModel.js`)
  - Field: `savings_balance_cents` (Number, default 0)
  - Field: `initialSavingsPaid` (Boolean)

- `Transaction` (`models/TransactionModel.js`)
  - Fields used: `type` (`manual`), `direction` (`IN` or `OUT`), `amount_cents`, `status`, `initiatedBy`, `rawCallback`.
  - `rawCallback` stores metadata and the `source: 'savings'` marker to allow querying savings transactions.

## Controllers and routes

- `controllers/savingsController.js`
  - `createSavings(req, res)` — main endpoint used for adding or deducting savings. Flow:
    1. Validate `clientId` and amount (`amountKES` or `amountCents`).
    2. Lookup `Client` by id. Permission check: only `approver_admin` or `super_admin` allowed.
    3. Compute `cents` (positive for deposit, negative for deduction). Prevent negative resulting balance.
    4. Atomically update `Client.savings_balance_cents` via `findByIdAndUpdate`.
    5. Create a `Transaction` document with `rawCallback.source='savings'` to record an audit entry.
    6. Return 201 with updated client information.

- `controllers/clientController.js` (method `addSavings`)
  - Endpoint: `POST /api/clients/:id/savings` — admin-only add (positive amounts only). Flow:
    1. Validate client id and amount.
    2. Check role (`initiator_admin`, `super_admin`).
    3. Update `Client.savings_balance_cents` with the positive addition.
    4. Return the updated client document.
  - Important: this route currently does not create a `Transaction` audit — it only updates the client.

## Typical API requests and responses

- Add/deduct using audited endpoint

Request:

POST /api/savings
Headers: `Authorization: Bearer <token>`

Body examples (add KES 100):

{
  "clientId": "6482a0f7f1a2b1c3d4e5f678",
  "amountKES": 100,
  "notes": "Monthly savings"
}

Body example (deduct KES 50):

{
  "clientId": "6482a0f7f1a2b1c3d4e5f678",
  "amountCents": -5000,
  "notes": "Loan repayment adjustment"
}

Successful response: 201

{
  "message": "Savings recorded",
  "client": { ...updated client document... }
}

- Client-scoped add-only

POST /api/clients/:id/savings

Body: { "amountKES": 100 }

Response: 200

{
  "message": "Savings added",
  "client": { ...updated client document... }
}

## Where to read savings data

- Aggregated balances for display: query `clients` and read `savings_balance_cents`.
  - Example Mongo query: `db.clients.find({}, { name:1, groupId:1, savings_balance_cents:1 }).pretty()`

- Event-level (audit) data: query `transactions` for `rawCallback.source === 'savings'`.
  - Example: `db.transactions.find({'rawCallback.source':'savings'}).sort({createdAt:-1}).limit(100).pretty()`

## UI integration guide (single-page CRUD for balances)

Goal: show a table with client name, group name, current savings, and an action to add/deduct.

1. Fetch clients with group names:

GET `/api/clients?page=1&limit=200`

The response `data` contains client documents with `groupId` populated with `name` (controller already calls `.populate('groupId', 'name')`).

2. Table columns:
- Client name: `client.name`
- Group: `client.groupId.name`
- Balance: `client.savings_balance_cents / 100` (format to currency)
- Actions: `Adjust` button

3. Adjust modal
- Show current balance
- Input for Amount (KES) and Sign (Add / Deduct) or allow negative input
- Notes field
- Submit button

4. Submit handler (preferred audited flow)
- Build payload:
  - amountCents = Math.round(Number(amountKES) * 100) * (sign === 'deduct' ? -1 : 1)
  - payload: `{ clientId, amountCents, notes }`
- Call `POST /api/savings` (this creates `Transaction` audit and updates the client). Requires `approver_admin` or `super_admin`.
- On success: update the row with the returned client or re-fetch the clients list.

Fallback (if user role cannot call `/api/savings` but can call client route):
- Use `POST /api/clients/:id/savings` but note: it only supports positive adds and does not create a `Transaction` audit.

## Error cases and validations handled by server

- Missing `clientId` or missing amount returns 400.
- Invalid client id returns 404.
- Unauthorized roles return 403 or 401 depending on auth state.
- Deductions that would create negative balance return 400 with `Insufficient savings for this deduction`.
- Transaction creation failure is non-fatal in `createSavings` — the code logs the failure but still returns success after updating client balance. (This is currently implemented; see `controllers/savingsController.js`.)

## Auditing and consistency considerations

- Currently `createSavings` updates the client's balance then creates a Transaction; if transaction creation fails the client still reflects the new balance and the audit is missing. For strict consistency consider using a two-phase approach (transactions first, then update) or a MongoDB transaction (session) to write both documents atomically.

- `clientController.addSavings` performs a direct balance update without creating a `Transaction`. If you rely on auditing for regulatory reasons, you should update this method to also create a `Transaction` record.

## Recommended improvements (priority)

1. Create an atomic endpoint `/api/clients/:id/savings/adjust` that:
   - Accepts positive/negative amounts,
   - Validates permissions,
   - Performs both updates (`Transaction` + `Client` balance) inside a MongoDB transaction (session) for atomicity,
   - Returns the updated client and transaction entry.

2. Modify `POST /api/clients/:id/savings` to also create a `Transaction` audit (to avoid gaps in history).

3. Make `createSavings` use a MongoDB session or a compensating mechanism if `Transaction.create` fails.

4. Add an index on `transactions.rawCallback.source` if you will query savings frequently (speeds listing of savings transactions).

5. Add server-side rate-limiting and audit logs for who adjusted balances.

## Backfill / migration steps (if you want a dedicated `savings` collection)

If you prefer a separate `savings` collection, follow these steps:

1. Create a `Savings` model that mirrors the audit you want: fields such as `clientId`, `amount_cents`, `direction`, `notes`, `createdBy`, `createdAt`.
2. Write a migration script that:
   - Reads all `transactions` where `rawCallback.source === 'savings'`.
   - For each transaction, insert into `savings` (if not already present) using the `transaction._id` as a reference.
   - Ensure idempotency by maintaining an index on the source transaction reference.
3. Optionally create a view or aggregation that materializes balances from `savings` events and compare with `Client.savings_balance_cents` to find discrepancies.
4. Once migrated and verified, update API endpoints to write to both `transactions` (for legacy continuity) and `savings` (for the new domain model), or migrate callers to only write `savings` and create a background job to sync the `transactions` collection.

## Tests and verification

- Unit tests should assert:
  - Adding positive amount updates `Client.savings_balance_cents` and creates a `Transaction` with correct `direction` and `amount_cents`.
  - Deducting amount that would cause negative balance is rejected.
  - Permissions: roles not allowed cannot call endpoints.

- Integration test flow:
  1. Create test user with `approver_admin` role.
  2. Create test `Client`.
  3. Call `POST /api/savings` to add amount. Verify `clients` and `transactions` collections updated.
  4. Call `POST /api/savings` to deduct amount. Verify no negative balance allowed beyond 0.

## Quick debug queries

- Check for mismatches between transaction-derived balances and stored client balances (simple heuristic):

```js
// Sum transactions by clientId
db.transactions.aggregate([
  { $match: { 'rawCallback.source': 'savings' } },
  { $group: { _id: '$rawCallback.clientId', totalCents: { $sum: { $cond: [ { $eq: [ '$direction', 'IN' ] }, '$amount_cents', { $multiply: [ -1, '$amount_cents' ] } ] } } } },
  { $out: 'tmp_savings_sums' }
]);

// Join with clients to find diffs
db.tmp_savings_sums.aggregate([
  { $lookup: { from: 'clients', localField: '_id', foreignField: '_id', as: 'client' } },
  { $unwind: '$client' },
  { $project: { clientId: '$_id', clientBalance: '$client.savings_balance_cents', txnSum: '$totalCents', diff: { $subtract: ['$client.savings_balance_cents', '$totalCents'] } } },
  { $match: { diff: { $ne: 0 } } },
  { $limit: 50 }
]).pretty();
```

This gives a quick list of clients whose stored balance differs from the sum of transaction events.

## Implementation pointers (code references)

- Update flow is implemented in `controllers/savingsController.js` — this is the canonical audited path. See the `createSavings` function for the exact behaviour.
- The light-weight add-only path is `controllers/clientController.js::addSavings` and is exposed via `routes/clientRoutes.js`.

---

If you’d like, I can now:
- implement an atomic `/api/clients/:id/savings/adjust` endpoint (server changes + tests), or
- update `addSavings` to create `Transaction` audits, or
- provide a React/JS component implementing the single-page UI described above.

Tell me which of these you want next and I will implement it.
