# Loan Initiation System Changes — Migration Guide

**Date:** January 1, 2026  
**Purpose:** Document recent changes to loan initiation logic and provide guidance for frontend/client integration.

---

## Overview of Changes

This document describes the backend changes made to support more flexible loan initiation workflows, including optional group membership, relaxed savings requirements, and improved guarantor handling.

---

## 1. Group ID is Now Optional for Individual Loans

### What Changed
Previously, all loans required a `groupId` to be provided during initiation. The system now supports individual client loans without group membership.

### Backend Changes
- **File:** `models/LoanModel.js`
- **Change:** `groupId` field changed from `required: true` to `required: false, default: null`
- **Impact:** Individual clients can apply for loans without being part of a group

### Frontend Integration

#### Request Body (POST /api/loans/initiate)
```json
{
  "clientNationalId": "12345678",
  "product": "business",
  "amountKES": 10000,
  "term": 4,
  "guarantors": [...],
  "purpose": "Business expansion"
}
```

**Note:** `groupId` is **optional** in the request body. The system will:
- Use the client's existing `groupId` if the client is a group member
- Set `groupId` to `null` if the client is not in a group
- Only validate group-specific rules (signatories, member counts) when `groupId` is provided for group-level initiation

#### Graceful Degradation
- The system continues to work for clients who are part of groups (legacy behavior)
- Clients with `status: 'legacy'` or inactive groups will receive a warning in server logs but loan initiation will continue
- No breaking changes to existing frontend code

#### Validation Rules
When `groupId` is provided (group-level initiation):
- Group must exist and have `status: 'active'`
- Group must have exactly 3 signatories
- FAFA products require ≥5 members
- Business products require ≥7 members

When `groupId` is omitted (individual client initiation):
- Group validation is skipped
- Loan is linked to client's existing group (if any) or left as individual

---

## 2. Savings Requirement Removed

### What Changed
The 20% savings balance requirement has been removed from loan initiation.

### Backend Changes
- **File:** `controllers/loanController.js`
- **Lines Removed:**
  ```javascript
  // REMOVED (group-level initiation):
  if (client.savings_balance_cents < Math.round(principal_cents * 0.2)) {
    results.skipped.push({ clientId: client._id, reason: 'insufficient savings' });
    continue;
  }
  
  // REMOVED (individual client initiation):
  if (client.savings_balance_cents < Math.round(principal_cents * 0.2)) {
    res.status(400);
    throw new Error('Client must have at least 20% savings');
  }
  ```

### Frontend Integration
- Remove any frontend validation that checks for 20% savings balance before allowing loan application
- Remove UI messages like "Client must have at least 20% of loan amount in savings"
- Clients can now apply for loans regardless of their savings balance

### Business Impact
- This change aligns with new lending policies that may evaluate creditworthiness through other means
- Consider adding alternative validation rules if needed (e.g., credit assessment scores, loan history)

---

## 3. Enhanced Guarantor Matching and Linking

### What Changed
The system now intelligently links guarantors to existing client records using multiple fallback strategies.

### Backend Changes
- **File:** `controllers/loanController.js`
- **Function:** `createGuarantorEntry()`

#### Guarantor Resolution Logic
The system attempts to match guarantors to existing clients using this priority order:

1. **Explicit Client ID** — If `clientId` is provided in the guarantor payload
2. **National ID Match** — If `clientNationalId` matches an existing client
3. **Phone Number Match** — If `phone` matches an existing client
4. **External Guarantor** — If no match found, creates external guarantor record

### Frontend Integration

#### Guarantor Payload Format
```json
{
  "guarantors": [
    {
      "name": "Jane Doe",
      "clientNationalId": "12345678",
      "phone": "0712345678",
      "isMember": true,
      "relationship": "friend",
      "clientId": "694cf4b84db8fb109212bcb4"  // Optional: explicit client ID
    },
    {
      "name": "John Smith",
      "clientNationalId": "87654321",
      "phone": "0723456789",
      "isMember": false,
      "relationship": "business_partner"
    }
  ]
}
```

#### Field Requirements
- **For Internal Guarantors (isMember: true):**
  - Provide `clientId` (preferred) OR `clientNationalId` OR `phone`
  - System will link to existing client record
  - Set `external: false` in database

- **For External Guarantors (isMember: false):**
  - Provide `name`, `clientNationalId`, `phone`
  - Creates standalone guarantor record
  - Set `external: true` in database

#### Minimum Guarantor Requirements
- **Individual Client Loans:** Minimum 3 guarantors required
- **Group-Level Loans:** Guarantors are optional (can be attached or omitted)

### Graceful Error Handling
If guarantor creation fails (e.g., duplicate entries, validation errors):
- Loan is still created successfully
- Errors are logged but do not block loan initiation
- Response includes `guarantorErrors` array with details

**Example Response:**
```json
{
  "message": "Loan initiated",
  "loan": { ... },
  "application_fee_cents": 24000,
  "guarantors": [
    { "_id": "...", "clientId": "...", ... }
  ],
  "guarantorErrors": [
    "Duplicate guarantor with nationalId 12345678"
  ]
}
```

### Frontend Recommendations
- Display guarantor errors to users without blocking the loan flow
- Provide UI to review and fix guarantor issues post-initiation
- Consider adding a "Review Guarantors" step in loan detail view

---

## 4. Database Index Updates for Guarantors

### What Changed
Fixed database indexes to allow multiple external guarantors per loan.

### Technical Details
- **Previous Issue:** Unique index on `(loanId, clientId)` prevented multiple external guarantors (where `clientId: null`)
- **Solution:** Added partial filter `{ clientId: { $type: 'objectId' } }` to only enforce uniqueness when `clientId` exists

#### New Index Configuration
```javascript
// Only prevent duplicate guarantors when clientId is present (internal guarantors)
{ loanId: 1, clientId: 1 } — unique, partial filter: clientId is ObjectId

// Prevent duplicate external guarantors by national ID
{ loanId: 1, guarantorNationalId: 1 } — unique, partial filter: guarantorNationalId is non-empty string
```

### Migration Required
Run this script **once** to update existing database indexes:
```bash
node scripts/fix_guarantor_indexes.js
```

### Impact on Frontend
- Multiple external guarantors can now be added to a single loan
- Previously failing requests will now succeed
- No frontend code changes required

---

## 5. Product Validation

### Common Frontend Error
**Error:** `product: 'business g' is not a valid enum value`

### Root Cause
Frontend is sending an incorrect product value (e.g., `'business g'` instead of `'business'`)

### Valid Product Values
- `'fafa'` — FAFA weekly loan product
- `'business'` — Business monthly loan product

### Frontend Fix Required
Check your product selection component and ensure:
```javascript
// ❌ WRONG
const productValue = selectedProduct.label; // "Business Loan" or "business g"

// ✅ CORRECT
const productValue = selectedProduct.value; // "business" or "fafa"
```

Trim and validate the product value before submission:
```javascript
const payload = {
  ...formData,
  product: formData.product.trim().toLowerCase(),  // Ensure clean value
};
```

---

## 6. Application Fee Payment Status

### Current Behavior
- Loans are created with `applicationFeePaid: false` by default
- Fee payment must be recorded separately using the "Mark Fee Paid" endpoint

### Endpoints

#### Mark Single Loan Fee as Paid
```http
PUT /api/loans/:loanId/mark-application-fee-paid
Authorization: Bearer {token}
```

#### Bulk Mark Fees as Paid
```http
POST /api/loans/mark-application-fee-paid-bulk
Content-Type: application/json

{
  "loanIds": ["loanId1", "loanId2", "loanId3"]
}
```

### Frontend Integration
- Display fee payment status in loan details
- Provide "Mark as Paid" button (for authorized roles: `initiator_admin`, `approver_admin`, `super_admin`)
- Support bulk operations for group loan initiation

### Future Enhancement
Consider adding `applicationFeePaid: true` option during loan initiation if the fee is paid upfront (e.g., through M-Pesa integration).

---

## Testing Checklist

Use this checklist to verify frontend compatibility with backend changes:

- [ ] **Individual Loan Creation**
  - [ ] Loan can be initiated without providing `groupId`
  - [ ] Loan works for clients not in any group
  - [ ] Loan works for clients in groups with `status: 'legacy'`

- [ ] **Savings Validation**
  - [ ] Clients with 0 savings balance can initiate loans
  - [ ] No frontend errors about "insufficient savings"

- [ ] **Guarantor Handling**
  - [ ] 3+ guarantors can be added to individual loans
  - [ ] Guarantors are linked to existing clients when `clientId`/`nationalId`/`phone` matches
  - [ ] External guarantors (non-members) are created correctly
  - [ ] Guarantor errors are displayed but don't block loan creation

- [ ] **Product Validation**
  - [ ] Product dropdown sends `'fafa'` or `'business'` (exact lowercase values)
  - [ ] No trailing spaces or extra characters in product value

- [ ] **Application Fee**
  - [ ] Fee payment status displayed correctly
  - [ ] "Mark as Paid" button works for authorized users

---

## Rollback Plan

If issues arise, you can rollback specific changes:

### Revert Group ID Optional Change
```javascript
// models/LoanModel.js
groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
```

### Restore Savings Requirement
```javascript
// controllers/loanController.js (around line 173 and line 263)
if (client.savings_balance_cents < Math.round(principal_cents * 0.2)) {
  res.status(400);
  throw new Error('Client must have at least 20% savings');
}
```

### Revert Guarantor Indexes
```bash
# Drop custom indexes and let default indexes take over
db.guarantors.dropIndex('loanId_1_clientId_1');
db.guarantors.dropIndex('loanId_1_guarantorNationalId_1');
```

---

## API Changes Summary

### Modified Endpoints

#### POST /api/loans/initiate
**Changed Fields:**
- `groupId` — now optional (previously required for single-client initiation)
- `guarantors` — improved matching logic, errors no longer block loan creation

**Removed Validations:**
- 20% savings balance requirement

**Behavior Changes:**
- Clients without groups can initiate loans
- Guarantor creation errors logged but don't fail request

### No Breaking Changes
- All existing API contracts remain compatible
- Additional flexibility added without removing features
- Frontend code using old patterns will continue to work

---

## Support and Questions

For questions or issues related to these changes:
1. Review server logs for detailed error messages
2. Check `guarantorErrors` array in loan initiation response
3. Verify database indexes using: `db.guarantors.getIndexes()`
4. Run migration script if guarantor creation fails with duplicate key errors

**Files Modified:**
- `models/LoanModel.js` — groupId optional
- `models/GuarantorModel.js` — index partial filters
- `controllers/loanController.js` — guarantor matching, savings validation removed
- `scripts/fix_guarantor_indexes.js` — database migration

**Migration Required:** Yes (run `node scripts/fix_guarantor_indexes.js` once)

**Backwards Compatible:** Yes (existing frontend code continues to work)

---

**Document Version:** 1.0  
**Last Updated:** January 1, 2026
