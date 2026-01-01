# Loan Disbursement Process Documentation

## Overview

The loan disbursement process handles the transfer of approved loan funds to clients via M-Pesa B2C (Business to Customer) payment. This documentation covers the complete disbursement workflow, from initiation to final confirmation.

## Table of Contents

1. [Disbursement Flow](#disbursement-flow)
2. [Prerequisites](#prerequisites)
3. [API Endpoint](#api-endpoint)
4. [Technical Implementation](#technical-implementation)
5. [Status Transitions](#status-transitions)
6. [M-Pesa B2C Integration](#m-pesa-b2c-integration)
7. [Error Handling](#error-handling)
8. [Idempotency](#idempotency)
9. [Ledger Accounting](#ledger-accounting)
10. [Testing](#testing)

---

## Disbursement Flow

```
┌─────────────────┐
│  Loan Approved  │
│ status: approved│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  Initiate Disbursement      │
│  PUT /api/loans/:id/disburse│
└────────┬────────────────────┘
         │
         ├─ Validate loan status
         ├─ Create Transaction record
         ├─ Update loan status to 'disbursement_pending'
         │
         ▼
┌─────────────────────────────┐
│  Trigger M-Pesa B2C API     │
│  (async, non-blocking)      │
└────────┬────────────────────┘
         │
         ├─ Call Safaricom API
         ├─ Store OriginatorConversationID
         │
         ▼
┌─────────────────────────────┐
│  M-Pesa Callback Handler    │
│  POST /api/mpesa/b2c/result │
└────────┬────────────────────┘
         │
         ├─ SUCCESS
         │  ├─ Update transaction status to 'completed'
         │  ├─ Post ledger entry (type: 'disbursement')
         │  ├─ Set loan.disbursedAt = now
         │  ├─ Set loan.status = 'disbursed'
         │  ├─ Generate repayment schedule
         │  └─ Response to client
         │
         └─ FAILURE
            ├─ Update transaction status to 'failed'
            ├─ Revert loan.status to 'approved'
            ├─ Log error details
            └─ Notify admin/initiator
```

---

## Prerequisites

Before a loan can be disbursed, the following conditions must be met:

### 1. Loan Status Requirements
- **Status**: `approved`
- **No Prior Disbursement**: `disbursementTransactionId` must be `null`
- **Approved By**: At least one approver must have approved the loan

### 2. Client Requirements
- Client must have a valid phone number (for M-Pesa)
- Phone number format: Kenyan mobile (254...)

### 3. M-Pesa Configuration
Environment variables must be properly configured:
```env
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_BASE_URL=https://api.safaricom.co.ke
MPESA_B2C_INITIATOR_NAME=your_initiator_name
MPESA_B2C_SECURITY_CREDENTIAL=your_encrypted_credential
MPESA_B2C_SHORTCODE=your_shortcode
MPESA_B2C_TIMEOUT_URL=https://yourdomain.com/api/mpesa/b2c/timeout
MPESA_B2C_RESULT_URL=https://yourdomain.com/api/mpesa/b2c/result
BASE_URL=https://yourdomain.com
```

### 4. User Permissions
Only users with the following roles can disburse loans:
- `approver_admin`
- `super_admin`

---

## API Endpoint

### Disburse Loan

**Endpoint**: `PUT /api/loans/:id/disburse`

**Method**: `PUT`

**Authentication**: Required (JWT Bearer Token)

**Authorization**: `approver_admin`, `super_admin`

#### Request

**URL Parameters**:
- `id` (string, required): The loan ID

**Headers**:
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Body**: None required (client phone is fetched from database)

Optional body parameters:
```json
{
  "phone": "254712345678"  // Override client's registered phone
}
```

#### Response

**Success (200 OK)**:
```json
{
  "message": "Disbursement initiated",
  "loanId": "69561a11535adc20e2bad683",
  "transactionId": "507f1f77bcf86cd799439011"
}
```

**Error Responses**:

```json
// 404 Not Found
{
  "message": "Loan not found"
}

// 400 Bad Request - Wrong Status
{
  "message": "Loan must be approved before disbursement"
}

// 400 Bad Request - Already Disbursed
{
  "message": "Disbursement already initiated"
}

// 401 Unauthorized
{
  "message": "Not authorized"
}

// 403 Forbidden
{
  "message": "Insufficient permissions"
}
```

---

## Technical Implementation

### Controller: `disbursementController.js`

The disbursement controller handles the following:

1. **Validation**
   - Verifies loan exists
   - Checks loan is in `approved` status
   - Ensures no prior disbursement transaction

2. **Transaction Creation**
   - Creates a `Transaction` record with:
     - `type`: `mpesa_b2c`
     - `direction`: `OUT`
     - `amount_cents`: loan principal
     - `status`: `pending`
     - `loanId`: reference to loan
     - `initiatedBy`: current user

3. **Loan State Update**
   - Sets `loan.status` to `disbursement_pending`
   - Links `loan.disbursementTransactionId` to created transaction

4. **M-Pesa B2C Trigger** (Non-blocking)
   - Asynchronously calls M-Pesa API
   - Does not wait for M-Pesa response
   - Errors are logged but don't fail the request

### Key Code Snippet

```javascript
export const disburseLoan = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id);
  
  // Validations...
  
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Create transaction
    const tx = await Transaction.insertMany([{
      type: 'mpesa_b2c',
      direction: 'OUT',
      amount_cents: loan.principal_cents,
      status: 'pending',
      loanId: loan._id,
      initiatedBy: req.user._id,
    }], { session });

    // Update loan
    loan.status = 'disbursement_pending';
    loan.disbursementTransactionId = tx[0]._id;
    await loan.save({ session });

    await session.commitTransaction();

    // Trigger M-Pesa B2C asynchronously
    (async () => {
      // Call B2CService.disburseLoan()
    })();

    res.json({
      message: 'Disbursement initiated',
      loanId: loan._id,
      transactionId: tx[0]._id,
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});
```

---

## Status Transitions

### Loan Status Flow

```
approved
   │
   │ PUT /api/loans/:id/disburse
   ▼
disbursement_pending
   │
   ├─ SUCCESS (M-Pesa callback)
   │  ▼
   │  disbursed
   │
   └─ FAILURE (M-Pesa callback)
      ▼
      approved (reverted)
```

### Transaction Status Flow

```
pending
   │
   ├─ SUCCESS
   │  ▼
   │  completed
   │
   ├─ FAILURE
   │  ▼
   │  failed
   │
   └─ TIMEOUT
      ▼
      timeout
```

---

## M-Pesa B2C Integration

### B2CService Class

Located in: `mpesa/b2cService.js`

#### Methods

##### `disburseLoan({ loanId, phone, amount_cents, initiatedBy })`

Initiates a B2C payment request to Safaricom.

**Parameters**:
- `loanId` (ObjectId): Loan being disbursed
- `phone` (string): Client's mobile number (254...)
- `amount_cents` (number): Amount in cents
- `initiatedBy` (ObjectId): User initiating disbursement

**Process**:
1. Normalizes phone number to MSISDN format
2. Generates idempotency key
3. Creates/fetches transaction record (idempotent)
4. Sends B2C request to Safaricom
5. Stores `OriginatorConversationID` for callback matching

**Safaricom Payload**:
```json
{
  "InitiatorName": "api_operator",
  "SecurityCredential": "encrypted_password",
  "CommandID": "BusinessPayment",
  "Amount": 5000,
  "PartyA": "600000",
  "PartyB": "254712345678",
  "Remarks": "Loan disbursement 69561a11535adc20e2bad683",
  "QueueTimeOutURL": "https://yourdomain.com/api/mpesa/b2c/timeout",
  "ResultURL": "https://yourdomain.com/api/mpesa/b2c/result",
  "Occasion": "69561a11535adc20e2bad683"
}
```

### M-Pesa Callback Handler

Located in: `controllers/mpesaB2CController.js`

**Endpoint**: `POST /api/mpesa/b2c/result`

Handles the result callback from Safaricom after B2C payment processing.

#### Success Callback Processing

When M-Pesa confirms successful disbursement:

1. **Find Transaction**
   - Match by `OriginatorConversationID` or `ConversationID`

2. **Update Transaction**
   - Set `status` to `completed`
   - Store `mpesaReceiptNumber`
   - Store `transactionDate`

3. **Update Loan**
   - Set `loan.disbursedAt` to current timestamp
   - Set `loan.disbursedBy` to initiator
   - Update `loan.status` to `disbursed`

4. **Post Ledger Entry**
   - Create ledger entry with type `disbursement`
   - Amount: `loan.principal_cents`
   - Increases outstanding balance

5. **Generate Repayment Schedule**
   - Call `generateRepaymentSchedule(loan)`
   - Creates schedule based on product type, term, and disbursement date

6. **Recalculate Loan Totals**
   - Apply ledger entries with `applyLoanLedger(loan)`
   - Update cached totals

#### Failure Callback Processing

When M-Pesa reports disbursement failure:

1. **Update Transaction**
   - Set `status` to `failed`
   - Store error code and message

2. **Revert Loan Status**
   - Set `loan.status` back to `approved`
   - Clear `loan.disbursementTransactionId`

3. **Notification**
   - Log error for admin review
   - (Optional) Send notification to initiator

---

## Error Handling

### Common Errors

#### 1. Invalid Phone Number
**Cause**: Client phone is missing or invalid format
**Resolution**: Update client's phone number to valid Kenyan mobile (254...)

#### 2. Insufficient B2C Balance
**Cause**: M-Pesa paybill account has insufficient funds
**Resolution**: Top up M-Pesa account

#### 3. Invalid Security Credential
**Cause**: B2C security credential is expired or incorrect
**Resolution**: Regenerate credential in Safaricom portal and update `MPESA_B2C_SECURITY_CREDENTIAL`

#### 4. Network Timeout
**Cause**: M-Pesa API is slow or unavailable
**Resolution**: Transaction remains in `pending` status; retry manually or wait for timeout callback

#### 5. Duplicate Disbursement
**Cause**: Attempting to disburse already disbursed loan
**Resolution**: Check loan status; use idempotency to prevent duplicate payments

### Error Logging

All B2C errors are logged with:
- Loan ID
- Transaction ID
- Error code from M-Pesa
- Error message
- Timestamp

---

## Idempotency

### Purpose
Prevents duplicate disbursements if the same request is made multiple times (e.g., due to network issues or user error).

### Implementation

#### Idempotency Key Generation
```javascript
makeIdempotencyKey(type, loanId, amount_cents, msisdn)
// Example: "mpesa_b2c:69561a11535adc20e2bad683:500000:254712345678"
```

#### Transaction Upsert
```javascript
const tx = await Transaction.findOneAndUpdate(
  { type: 'mpesa_b2c', idempotencyKey },
  {
    $setOnInsert: {
      type: 'mpesa_b2c',
      direction: 'OUT',
      amount_cents,
      status: 'pending',
      loanId,
      phone: msisdn,
      idempotencyKey,
      initiatedBy,
    },
  },
  { upsert: true, new: true }
);
```

If a transaction with the same idempotency key already exists:
- Returns existing transaction
- Does not create duplicate
- Does not call M-Pesa API again if status is not `pending`

---

## Ledger Accounting

### Disbursement Ledger Entry

When disbursement succeeds, a ledger entry is posted:

**Entry Type**: `disbursement`

**Fields**:
- `loanId`: Reference to loan
- `type`: `'disbursement'`
- `amount_cents`: Loan principal (positive value)
- `transactionId`: Reference to M-Pesa transaction
- `timestamp`: Disbursement completion time
- `postedBy`: User who initiated disbursement

### Effect on Loan Balance

The disbursement ledger entry:
- **Increases** `total_due_cents` (principal + interest)
- **Increases** `outstanding_cents`
- Sets the baseline from which repayments are tracked

### Ledger Processing

Located in: `utils/applyLoanLedger.js`

```javascript
// For disbursement entries
if (entry.type === 'disbursement') {
  outstanding += entry.amount_cents;
  totalDue += entry.amount_cents;
}

// Update loan status based on outstanding
if (loan.disbursedAt && outstanding === 0) {
  loan.status = 'repaid';
} else if (loan.disbursedAt && loan.status !== 'defaulted') {
  loan.status = 'disbursed';
}
```

---

## Testing

### Manual Testing Steps

#### 1. Prepare Test Loan
```bash
# Create and approve a test loan via API or UI
# Ensure client has valid phone number
```

#### 2. Initiate Disbursement
```bash
curl -X PUT http://localhost:5011/api/loans/{loanId}/disburse \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json"
```

**Expected Response**:
```json
{
  "message": "Disbursement initiated",
  "loanId": "...",
  "transactionId": "..."
}
```

#### 3. Check Loan Status
```bash
curl http://localhost:5011/api/loans/{loanId} \
  -H "Authorization: Bearer {token}"
```

**Expected**: `status: "disbursement_pending"`

#### 4. Verify Transaction
```bash
# Query transactions collection
db.transactions.findOne({ _id: ObjectId("{transactionId}") })
```

**Expected**:
- `status: "pending"`
- `type: "mpesa_b2c"`
- `checkoutRequestId` present (if M-Pesa call succeeded)

#### 5. Simulate M-Pesa Callback
```bash
# Send test callback to result endpoint
curl -X POST http://localhost:5011/api/mpesa/b2c/result \
  -H "Content-Type: application/json" \
  -d '{
    "Result": {
      "ResultType": 0,
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "OriginatorConversationID": "...",
      "ConversationID": "...",
      "TransactionID": "MPESA123",
      "ResultParameters": {
        "ResultParameter": [
          { "Key": "TransactionAmount", "Value": 5000 },
          { "Key": "TransactionReceipt", "Value": "MPESA123" }
        ]
      }
    }
  }'
```

#### 6. Verify Final State
- Loan status: `disbursed`
- Loan `disbursedAt` set
- Transaction status: `completed`
- Ledger entry created
- Repayment schedule generated

### Automated Testing

#### Unit Tests (Example)
```javascript
describe('Disbursement Controller', () => {
  it('should initiate disbursement for approved loan', async () => {
    const loan = await Loan.create({
      clientId: client._id,
      status: 'approved',
      principal_cents: 500000,
      // ... other fields
    });

    const res = await request(app)
      .put(`/api/loans/${loan._id}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.message).toBe('Disbursement initiated');
    
    const updatedLoan = await Loan.findById(loan._id);
    expect(updatedLoan.status).toBe('disbursement_pending');
  });

  it('should reject disbursement for non-approved loan', async () => {
    const loan = await Loan.create({
      clientId: client._id,
      status: 'initiated',
      principal_cents: 500000,
    });

    await request(app)
      .put(`/api/loans/${loan._id}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('should prevent duplicate disbursement', async () => {
    const loan = await Loan.create({
      clientId: client._id,
      status: 'approved',
      principal_cents: 500000,
    });

    // First disbursement
    await request(app)
      .put(`/api/loans/${loan._id}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Second disbursement attempt
    await request(app)
      .put(`/api/loans/${loan._id}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
```

---

## Database Models

### Loan Model Fields (Disbursement-Related)

```javascript
{
  status: {
    type: String,
    enum: ['initiated', 'approved', 'disbursement_pending', 'disbursed', 'repaid', 'defaulted', 'cancelled']
  },
  disbursedAt: { type: Date, default: null },
  disbursedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  disbursementTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' }
}
```

### Transaction Model Fields

```javascript
{
  type: { type: String, enum: ['mpesa_b2c', 'mpesa_c2b', 'cash', 'bank'] },
  direction: { type: String, enum: ['IN', 'OUT'] },
  amount_cents: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'timeout'] },
  loanId: { type: Schema.Types.ObjectId, ref: 'Loan' },
  phone: { type: String },
  checkoutRequestId: { type: String }, // OriginatorConversationID from M-Pesa
  mpesaReceiptNumber: { type: String },
  idempotencyKey: { type: String, unique: true },
  initiatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}
```

### Ledger Entry Model Fields

```javascript
{
  loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true },
  type: { type: String, enum: ['disbursement', 'repayment', 'reversal'] },
  amount_cents: { type: Number, required: true },
  transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
  timestamp: { type: Date, default: Date.now },
  postedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}
```

---

## Security Considerations

### 1. Authorization
- Only `approver_admin` and `super_admin` can disburse loans
- Enforced via middleware: `restrictTo('approver_admin', 'super_admin')`

### 2. Transaction Integrity
- Uses MongoDB transactions to ensure atomicity
- If any step fails, entire operation is rolled back

### 3. M-Pesa Security Credential
- Encrypted password stored in environment variable
- Generated using Safaricom's certificate
- Should be rotated periodically

### 4. Callback Verification
- (Recommended) Verify callback origin from Safaricom IP ranges
- (Recommended) Add HMAC signature verification

### 5. Audit Trail
- All disbursements logged with:
  - User who initiated (`disbursedBy`)
  - Timestamp (`disbursedAt`)
  - Transaction reference (`disbursementTransactionId`)

---

## Troubleshooting

### Problem: Disbursement stuck in "pending"

**Symptoms**:
- Loan status remains `disbursement_pending`
- Transaction status remains `pending`
- No callback received

**Solutions**:
1. Check M-Pesa callback URL is publicly accessible
2. Verify `MPESA_B2C_RESULT_URL` is correct
3. Check Safaricom portal for transaction status
4. Review server logs for callback errors
5. Manually trigger callback if payment succeeded on M-Pesa side

### Problem: "Insufficient permissions" error

**Symptoms**:
- 403 Forbidden response
- User cannot disburse despite being admin

**Solutions**:
1. Verify user role in database: `db.users.findOne({ _id: userId })`
2. Ensure role is `approver_admin` or `super_admin`
3. Check JWT token is valid and not expired

### Problem: M-Pesa "Invalid Security Credential"

**Symptoms**:
- M-Pesa returns error code 87409
- Transaction fails immediately

**Solutions**:
1. Regenerate security credential in Safaricom portal
2. Use correct certificate for encryption (production vs sandbox)
3. Update `MPESA_B2C_SECURITY_CREDENTIAL` environment variable
4. Restart server to load new credential

### Problem: "Loan must be approved before disbursement"

**Symptoms**:
- 400 Bad Request
- Loan is in `initiated` or other non-approved status

**Solutions**:
1. Approve loan via: `PUT /api/loans/{id}/approve`
2. Verify loan status: `GET /api/loans/{id}`
3. Ensure sufficient approvals if multi-approval required

---

## Related Documentation

- [Loan Initiation Documentation](./LOAN_INITIATION_CHANGES.md)
- [Repayment Documentation](./repayment_documentation.md) _(to be created)_
- [M-Pesa Integration Guide](./mpesa_integration.md) _(to be created)_
- [Analytics API](../ANALYTICS_API_md)

---

## Changelog

### Version 1.0 (January 2026)
- Initial disbursement process documentation
- Fixed route method from POST to PUT
- Documented M-Pesa B2C integration flow
- Added idempotency implementation details
- Included troubleshooting guide

---

## Support

For issues or questions about the disbursement process:
1. Check this documentation
2. Review server logs in `logs/` directory
3. Check M-Pesa transaction history in Safaricom portal
4. Contact system administrator

---

**Last Updated**: January 1, 2026  
**Author**: Development Team  
**Version**: 1.0
