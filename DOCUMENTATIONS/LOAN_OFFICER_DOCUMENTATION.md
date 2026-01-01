# Loan Officer — Quick Guide

**Purpose:** Describe how loan officers are created, their credentials, capabilities, and the API endpoints used to manage them.

**Create (super_admin only):**
- **Endpoint:** POST /api/loan-officers
- **Body:** `{ "name", "phone", "email", "nationalId" }`
- **Access:** `super_admin` only.
- **Behavior:** Creates a `User` with `role: 'loan_officer'` (username = `nationalId`) and a `LoanOfficer` profile stored in `models/LoanOfficerModel.js`.
- **Default password:** `12345678` (user should change after first login).

Example:

```bash
curl -X POST -H "Authorization: Bearer $SUPERADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Alice Officer","phone":"0712345678","email":"alice@example.com","nationalId":"ID12345678"}' \
  http://localhost:5011/api/loan-officers
```

**Login:**
- **Endpoint:** POST /api/auth/login
- **Body:** `{ "username": "<nationalId>", "password": "12345678" }`
- On successful login the server returns a JWT and sets an HTTP-only cookie named `token` for convenience across pages.

**Change Password (recommended after first login):**
- **Endpoint:** PUT /api/auth/change-password (protected)
- **Body:** `{ "currentPassword", "newPassword", "confirmPassword" }`

Example change-password:

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"currentPassword":"12345678","newPassword":"newstrongpass","confirmPassword":"newstrongpass"}' \
  http://localhost:5011/api/auth/change-password
```

**Capabilities / Permissions:**
- Loan officers authenticate as `role: 'loan_officer'` and can perform actions allowed to that role in the system (create clients, create groups where permitted, view assigned clients, record repayments, etc.).
- The system continues to use the `User` model for authorization checks; the `LoanOfficer` model is a profile with contact metadata.

- Note: When initiating a loan for a single client, the `groupId` field in the loan payload is optional. If the client belongs to a group the system will use the client's `groupId`; providing `groupId` is required only for group-level (bulk) initiation.

**Relevant files:**
- `models/LoanOfficerModel.js` — profile schema.
- `controllers/loanOfficerController.js` — creation logic.
- `routes/loanOfficerRoutes.js` — mounted at `/api/loan-officers`.
- `controllers/authController.js` and `routes/authRoutes.js` — login and change-password flows.

**Security notes:**
- Default password is intentionally simple for onboarding; enforce immediate password change and consider expiring the default password or forcing password reset via email/SMS.
- Ensure super-admin credentials are protected; creation endpoint is restricted to `super_admin` via `protect` + `restrictTo` middleware.

**Next steps (optional):**
- Add email/SMS notification to send credentials to newly created officers.
- Add endpoints to list, update, deactivate loan officers (`GET/PUT/DELETE /api/loan-officers/:id`).
- Add audit log entries for officer creation and password resets.
