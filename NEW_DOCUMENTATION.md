# System Changes and Improvements Documentation

## Overview
This document outlines the key changes made to the permissions system, role-based access control, and new functionalities implemented in the loan management system.

---

## 1. Role-Based Permissions Matrix

The system now operates on a three-tier permission model with clear separation of duties:

| Feature | Loan Officer (Maker) | Admins (Checker) | Super Admin (System) |
|---------|---------------------|------------------|---------------------|
| **Branches** | View Assigned | Manage Branch | Create Branches |
| **Admins/Staff** | ❌ | ❌ | Create Admins/Officers |
| **Groups** | Initiate Creation | Approve & Activate | Assign/Reassign Officers |
| **Clients** | Onboard/Create | Approve & Activate | Edit Details/Adjust |
| **Loan Initiation** | ✅ Yes | ❌ No | ❌ No |
| **Loan Approval** | ❌ No | ✅ Yes | ❌ No |
| **Disbursement** | ❌ No | ✅ Yes | ❌ No |

### Key Principles
- **Maker-Checker Model**: Loan Officers initiate; Admins approve
- **Separation of Duties**: No single role can both create and approve critical operations
- **Super Admin Oversight**: System-level management without operational involvement

---

## 2. Hierarchical Structure

The system follows a strict hierarchical data model:

```
Branch (Root)
    ↓
Branch Controller (Admin)
    ↓
Loan Officer
    ↓
Groups
    ↓
Clients
```

### Entity Definitions

#### **Branch (Root)**
- Created by the Super Admin
- Represents a physical location or region
- Root entity in the organizational hierarchy

#### **Branch Controller (Admin)**
- Assigned to a specific branch
- Oversees all operations within that location
- Responsible for approving groups, clients, loans, and disbursements

#### **Loan Officer**
- Assigned to a specific Branch
- Can **only see data within their assigned branch**
- Responsible for:
  - Creating groups
  - Onboarding clients
  - Initiating loans
  - Performing credit assessments

#### **Groups**
- Created by the Loan Officer within their branch
- **Must have 3 mandatory signatories**:
  - Chairperson
  - Secretary
  - Treasurer
- Requires approval from Admin before activation

#### **Clients**
- Onboarded by the Loan Officer
- Must be attached to a specific Group
- Requires approval from Admin before activation

---

## 3. Loan Officer Performance Dashboard

Since the Loan Officer is the "owner" of the group's health, their interface tracks four key metrics:

### Key Performance Indicators (KPIs)

1. **Loans Initiated**
   - Applications currently in the pipeline
   - Status: Pending assessment/approval
   - Tracks active workload

2. **Loans Disbursed**
   - Total capital successfully sent to their groups
   - Measures successful loan origination
   - Tracks portfolio growth

3. **Loans in Arrears**
   - List of clients who have missed payments
   - At-risk portfolio indicator
   - Requires follow-up action

4. **Loans Recovered**
   - Total principal and interest successfully paid back
   - Measures collection efficiency
   - Tracks portfolio health

---

## 4. New Loan Movement Flow

The loan lifecycle follows a structured 5-stage process:

### Stage 1: Group Setup
1. Loan Officer creates a group
2. Assigns 3 mandatory signatories:
   - Chairperson
   - Secretary
   - Treasurer
3. Admin approves group (activates it in the system)

### Stage 2: Client Onboarding
1. Loan Officer creates a client profile
2. Client is attached to a specific group
3. Admin approves and activates client

### Stage 3: Loan Initiation
1. Loan Officer starts the loan process
2. **Prerequisite**: Savings criteria must be met
3. System validates client eligibility

### Stage 4: Credit Assessment
1. Loan Officer performs the **5 C's scoring**:
   - Character
   - Capacity
   - Capital
   - Collateral
   - Conditions
2. Assessment is submitted for review

### Stage 5: Validation, Approval & Disbursement
1. Admin (Branch Controller) reviews:
   - The credit assessment
   - The group's overall health
2. Admin approves the loan
3. Admin clicks **Disburse** to release funds
4. **Note**: Super Admin is NOT involved in approval/disbursement clicks

---

## 5. Super Admin Interface Implementation

### New Functionalities

#### User Management
- **"Create Admin" Button**
  - Form to onboard new Branch Controllers
  - Assign admin to specific branch
  - Set permissions and access levels

- **"Create Loan Officer" Button**
  - Form to onboard new Loan Officers
  - Assign officer to specific branch
  - Define operational scope

#### Branch Management
- **"Create Branch" Form**
  - Add new physical locations/regions
  - Define branch parameters
  - Set operational details

#### Assignment & Reassignment
- **Group/Client Profile Dropdown**
  - "Assign/Change Loan Officer" option
  - Allows reassignment of groups/clients between officers
  - Maintains audit trail of assignments

#### Operational Restrictions
- **Disabled Actions for Super Admin**:
  - ❌ "Initiate" button (loan initiation)
  - ❌ "Approve" button (loan approval)
  - ❌ "Disburse" button (disbursement)
- **Enforcement**: `if (role === 'super_admin')` → disable operational buttons
- **Rationale**: Super Admin manages system, not operations

---

## 6. Client Creation Form Enhancements

### Error Prevention Logic

To prevent "orphaned" clients in the system, the client creation form now requires:

#### Mandatory Fields
1. **Branch ID**
   - Client must be assigned to a branch
   - Dropdown selection from active branches

2. **Group ID**
   - Client must be attached to a group
   - Dropdown shows only groups in selected branch

#### Validation Rules
- Form submission blocked if `branchId` is missing
- Form submission blocked if `groupId` is missing
- Ensures every client has a clear organizational hierarchy

#### Benefits
- Prevents data orphaning
- Maintains referential integrity
- Simplifies data queries and reporting
- Ensures proper branch-based access control

---

## 7. Group Signatories Logic

### Requirements

When creating or editing a group, the system enforces strict signatory rules:

#### Mandatory Roles
Each group must have exactly **3 different clients** assigned to:
1. **Chairperson**
2. **Secretary**
3. **Treasurer**

#### Validation Rules
- All 3 roles must be filled
- Each role must be assigned to a **different client**
- No client can hold multiple signatory positions within the same group
- UI must prevent duplicate selections

#### Implementation
```javascript
// Pseudo-code validation
if (chairperson === secretary || chairperson === treasurer || secretary === treasurer) {
  throw new Error("Each signatory role must be assigned to a different client");
}

if (!chairperson || !secretary || !treasurer) {
  throw new Error("All three signatory roles (Chairperson, Secretary, Treasurer) are mandatory");
}
```

#### Benefits
- Ensures proper group governance
- Distributes responsibility among multiple clients
- Reduces fraud risk through multiple authorization requirements
- Aligns with microfinance best practices

---

## 8. Summary of Key Changes

### Permission Changes
✅ Implemented maker-checker model for loan operations  
✅ Separated Super Admin from operational workflows  
✅ Enforced branch-level data isolation for Loan Officers  

### New Features
✅ Loan Officer Performance Dashboard with 4 KPIs  
✅ Super Admin user and branch management interface  
✅ Mandatory group signatories enforcement  
✅ Enhanced client creation form with required branch/group assignment  

### Data Integrity Improvements
✅ Prevention of orphaned clients  
✅ Strict hierarchical data relationships  
✅ Validation of group signatory uniqueness  

### Workflow Enhancements
✅ Clear 5-stage loan movement process  
✅ Defined approval checkpoints  
✅ Role-specific action restrictions  

---

## 9. Impact & Benefits

### For Loan Officers
- Clear ownership of group/client portfolios
- Performance visibility through KPI dashboard
- Streamlined loan initiation process
- Focus on origination and collection

### For Admins (Branch Controllers)
- Oversight and approval authority
- Quality control checkpoints
- Risk management through validation reviews
- Operational control within branch

### For Super Admins
- System-wide management capabilities
- User and branch administration
- Strategic oversight without operational burden
- Assignment flexibility for resource optimization

### For the Organization
- Reduced fraud risk through separation of duties
- Improved data quality and integrity
- Better accountability and audit trails
- Scalable permission model for growth

---

## 10. Future Considerations

### Potential Enhancements
- Automated loan officer performance reporting
- Group health scoring algorithms
- Risk-based approval workflows
- Multi-level approval chains for large loans
- Mobile interface for field operations
- Real-time alerts for arrears and defaults

### Compliance & Audit
- All actions logged with user ID and timestamp
- Maker-checker actions linked in audit trail
- Approval reasons captured for reporting
- Rejection workflows with mandatory comments

---

**Document Version**: 1.0  
**Last Updated**: January 2, 2026  
**Status**: Active Implementation
