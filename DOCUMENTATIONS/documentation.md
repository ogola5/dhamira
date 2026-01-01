**Logs & Notifications API**

- **Purpose:** expose application logs (file-based) and a simple notifications CRUD API backed by MongoDB.

**Routes**

- GET /api/logs
  - Query params:
    - `file` (optional): `all` (default) or `error` — selects `logs/all.log` or `logs/error.log`.
    - `level` (optional): filter by level token parsed from lines (e.g., `info`, `error`).
    - `since` (optional): ISO datetime string to filter entries newer than this date.
    - `limit` (optional): number of entries to return (default 200, max 1000).
  - Auth: protected; restricted to roles `super_admin`, `initiator_admin`, `approver_admin`.
  - Response: JSON `{ count, entries: [ { timestamp, level, message, raw } ] }`.

- GET /api/logs/notifications
  - Query params: `unread=true|false`, `limit`, `skip`.
  - Auth: protected (any authenticated user).
  - Response: `{ count, items: [...] }` where items are Notification documents.

- POST /api/logs/notifications
  - Body: `{ title, body, type?, metadata? }`.
  - Auth: protected.
  - Creates a Notification document. Returns created document.

- PUT /api/logs/notifications/:id/read
  - Marks notification as read. Auth: protected.

- DELETE /api/logs/notifications/:id
  - Deletes notification. Auth: restricted to `super_admin`, `initiator_admin`, `approver_admin`.

**Implementation notes**

- Logs
  - Reads from the `logs/` directory at the project root. Files currently: `all.log`, `error.log`.
  - Lines are parsed with a lightweight heuristic: the first ~23 chars are treated as timestamp, and the token before the first `:` after that is treated as `level`.
  - Results are returned newest-first with optional filtering. This is intended for operational visibility; do not use for high-throughput log analytics.

- Notifications
  - New Mongoose model `models/NotificationModel.js` with fields: `title`, `body`, `type`, `metadata`, `read`, `createdBy`.
  - Controller in `controllers/logsController.js` provides list/create/markRead/delete operations.
  - Routes in `routes/logsRoutes.js` under `/api/logs`.

**Security & Next steps**

- Consider rotating logs or using a structured logger (JSON) for easier parsing.
- For production, centralize logs (e.g., ELK/CloudWatch) and implement paginated streaming endpoints.
- Add rate-limiting and audit trails for notification creation/deletion.

**Files added/modified**

- Added: `models/NotificationModel.js`
- Added: `controllers/logsController.js`
- Added: `routes/logsRoutes.js`
- Modified: `server.js` (register route)
