# Admin Edit API Guide

## Overview
Admins have extended privileges to edit both client and group details, including the ability to reassign entities between branches and loan officers. This guide covers all available admin editing capabilities.

---

## 🔐 Authentication
All requests require authentication with an `admin` or `super_admin` role.

**Header:**
```
Authorization: Bearer <your_jwt_token>
```

---

## 📝 Client Editing API

### Update Client Details
**Endpoint:** `PUT /api/clients/:id`

**Access:** `admin`, `super_admin`, `loan_officer` (own clients only)

### Admin Capabilities
Admins can update the following fields:

| Field | Type | Description | Restrictions |
|-------|------|-------------|--------------|
| `name` | String | Client's full name | None |
| `phone` | String | Phone number | None |
| `nationalId` | String | National ID number | ⚠️ Cannot change if client has loan history |
| `businessType` | String | Type of business | None |
| `businessLocation` | String | Business location | None |
| `nextOfKin` | Object | Next of kin details | None |
| `residenceType` | String | Type of residence | None |
| `groupId` | ObjectId | Reassign to different group | Admin only |
| `loanOfficer` | ObjectId | Reassign to different loan officer | Admin only |
| `branchId` | ObjectId | Reassign to different branch | Admin only |

### Example Requests

#### 1. Update Basic Information
```bash
curl -X PUT http://localhost:5011/api/clients/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe Updated",
    "phone": "0712345678",
    "businessType": "Retail Shop",
    "businessLocation": "Mombasa Road"
  }'
```

**Response:**
```json
{
  "message": "Client updated",
  "client": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Jane Doe Updated",
    "phone": "0712345678",
    "nationalId": "12345678",
    "businessType": "Retail Shop",
    "businessLocation": "Mombasa Road",
    "groupId": "...",
    "branchId": "...",
    "loanOfficer": "...",
    "status": "active"
  }
}
```

#### 2. Reassign Client to Different Group
```bash
curl -X PUT http://localhost:5011/api/clients/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "507f1f77bcf86cd799439022"
  }'
```

#### 3. Reassign Client to Different Loan Officer
```bash
curl -X PUT http://localhost:5011/api/clients/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "loanOfficer": "507f1f77bcf86cd799439033"
  }'
```

#### 4. Reassign Client to Different Branch
```bash
curl -X PUT http://localhost:5011/api/clients/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "507f1f77bcf86cd799439044",
    "loanOfficer": "507f1f77bcf86cd799439033"
  }'
```

#### 5. Update Next of Kin
```bash
curl -X PUT http://localhost:5011/api/clients/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "nextOfKin": {
      "name": "John Doe",
      "phone": "0722334455",
      "relationship": "Brother"
    }
  }'
```

### Error Responses

**Attempting to change nationalId when client has loans:**
```json
{
  "message": "Cannot modify nationalId after loan history exists"
}
```

**Unauthorized (loan officer trying to edit another's client):**
```json
{
  "message": "Not allowed"
}
```

---

## 👥 Group Editing API

### Update Group Details
**Endpoint:** `PUT /api/groups/:id`

**Access:** `admin`, `super_admin`, `loan_officer` (own groups only)

### Admin Capabilities
Admins can update the following fields:

| Field | Type | Description | Restrictions |
|-------|------|-------------|--------------|
| `name` | String | Group name | None |
| `meetingDay` | String | Meeting day (Monday-Thursday) | None |
| `meetingTime` | String | Meeting time (any time format) | None |
| `loanOfficer` | ObjectId | Reassign to different loan officer | Admin only |
| `branchId` | ObjectId | Reassign to different branch | Admin only |
| `status` | String | Group status (pending/active/suspended) | Admin only |
| `members` | Array | Array of client IDs | Admin only |
| `signatories` | Array | Array of 3 signatory objects | Admin only, must have exactly 3 |

### Example Requests

#### 1. Update Group Name and Meeting Schedule
```bash
curl -X PUT http://localhost:5011/api/groups/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kileleshwa Women Group",
    "meetingDay": "Wednesday",
    "meetingTime": "10:00"
  }'
```

**Response:**
```json
{
  "message": "Group updated",
  "group": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Kileleshwa Women Group",
    "meetingDay": "Wednesday",
    "meetingTime": "10:00",
    "branchId": "...",
    "loanOfficer": "...",
    "status": "active"
  }
}
```

#### 2. Reassign Group to Different Loan Officer
```bash
curl -X PUT http://localhost:5011/api/groups/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "loanOfficer": "507f1f77bcf86cd799439033"
  }'
```

#### 3. Reassign Group to Different Branch
```bash
curl -X PUT http://localhost:5011/api/groups/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "507f1f77bcf86cd799439044",
    "loanOfficer": "507f1f77bcf86cd799439033"
  }'
```

#### 4. Change Group Status
```bash
curl -X PUT http://localhost:5011/api/groups/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "suspended"
  }'
```

#### 5. Update Group Members
```bash
curl -X PUT http://localhost:5011/api/groups/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "members": [
      "507f1f77bcf86cd799439021",
      "507f1f77bcf86cd799439022",
      "507f1f77bcf86cd799439023",
      "507f1f77bcf86cd799439024",
      "507f1f77bcf86cd799439025"
    ]
  }'
```

#### 6. Update Group Signatories
```bash
curl -X PUT http://localhost:5011/api/groups/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "signatories": [
      {
        "role": "chairperson",
        "clientId": "507f1f77bcf86cd799439021"
      },
      {
        "role": "secretary",
        "clientId": "507f1f77bcf86cd799439022"
      },
      {
        "role": "treasurer",
        "clientId": "507f1f77bcf86cd799439023"
      }
    ]
  }'
```

**Response:**
```json
{
  "message": "Group updated",
  "group": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Kileleshwa Women Group",
    "signatories": [
      {
        "role": "chairperson",
        "clientId": "507f1f77bcf86cd799439021"
      },
      {
        "role": "secretary",
        "clientId": "507f1f77bcf86cd799439022"
      },
      {
        "role": "treasurer",
        "clientId": "507f1f77bcf86cd799439023"
      }
    ],
    "status": "active"
  }
}
```

---

## 🔄 Common Use Cases

### Use Case 1: Transfer Client to New Branch and Officer
When restructuring operations, you may need to transfer clients between branches:

```javascript
// Step 1: Update the client
const response = await fetch('http://localhost:5011/api/clients/507f1f77bcf86cd799439011', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    branchId: '507f1f77bcf86cd799439044',  // New branch
    loanOfficer: '507f1f77bcf86cd799439033'  // Officer in new branch
  })
});
```

### Use Case 2: Bulk Group Reassignment
Transfer multiple groups to a new loan officer:

```javascript
const groups = ['groupId1', 'groupId2', 'groupId3'];
const newOfficerId = '507f1f77bcf86cd799439033';

for (const groupId of groups) {
  await fetch(`http://localhost:5011/api/groups/${groupId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      loanOfficer: newOfficerId
    })
  });
}
```

### Use Case 3: Update Client Contact Information
Update client's phone number and business details:

```javascript
const response = await fetch(`http://localhost:5011/api/clients/${clientId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    phone: '0712345678',
    businessType: 'Hardware Shop',
    businessLocation: 'Nairobi CBD'
  })
});
```

---

## ⚠️ Important Notes

### Client Editing Restrictions
1. **National ID**: Cannot be changed if the client has any loan history
2. **Loan Officer Access**: Loan officers can only edit basic information of their own clients
3. **Structural Fields**: Admins can reassign clients, but loan officers cannot if loans exist

### Group Editing Restrictions
1. **Signatories**: Can be updated directly through the main update endpoint by admins
   - Must provide exactly 3 signatories with unique roles (chairperson, secretary, treasurer)
   - Each signatory must be a different client
   - Dedicated endpoint also available: `PUT /api/groups/:id/signatories`
2. **Loan Officer Access**: Loan officers can only edit meeting schedules of their own groups
3. **Members**: Admins have full control over member lists
4. **Meeting Time**: No time restrictions - any time format accepted

### Data Integrity
- When reassigning clients to a new group, ensure the group belongs to the same branch
- When reassigning to a new branch, also update the loan officer to one from that branch
- Validate group status before making structural changes

---

## 📊 Frontend Integration Example

### React/TypeScript Example

```typescript
// Update client details
const updateClient = async (clientId: string, updates: Partial<Client>) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const data = await response.json();
    return data.client;
  } catch (error) {
    console.error('Failed to update client:', error);
    throw error;
  }
};

// Update group details
const updateGroup = async (groupId: string, updates: Partial<Group>) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const data = await response.json();
    return data.group;
  } catch (error) {
    console.error('Failed to update group:', error);
    throw error;
  }
};

// Usage
await updateClient('507f1f77bcf86cd799439011', {
  name: 'Jane Doe',
  phone: '0712345678'
});

await updateGroup('507f1f77bcf86cd799439022', {
  meetingDay: 'Wednesday',
  loanOfficer: '507f1f77bcf86cd799439033'
});
```

---

## 🧪 Testing with Postman

### Collection Setup

1. **Create Environment Variables:**
   - `base_url`: `http://localhost:5011`
   - `token`: Your JWT token

2. **Import Requests:**

**Update Client Request:**
```
PUT {{base_url}}/api/clients/:clientId
Headers:
  Authorization: Bearer {{token}}
  Content-Type: application/json
Body (JSON):
{
  "name": "Updated Name",
  "phone": "0712345678"
}
```

**Update Group Request:**
```
PUT {{base_url}}/api/groups/:groupId
Headers:
  Authorization: Bearer {{token}}
  Content-Type: application/json
Body (JSON):
{
  "name": "Updated Group Name",
  "meetingDay": "Wednesday"
}
```

---

## 📋 Quick Reference

### Client Update Endpoints
- **URL**: `PUT /api/clients/:id`
- **Auth**: Required (admin/super_admin/loan_officer)
- **Body**: JSON object with fields to update

### Group Update Endpoints
- **URL**: `PUT /api/groups/:id`
- **Auth**: Required (admin/super_admin/loan_officer)
- **Body**: JSON object with fields to update

### Admin-Only Fields
**Clients:**
- `groupId` (reassignment)
- `loanOfficer` (reassignment)
- `branchId` (reassignment)

**Groups:**
- `loanOfficer` (reassignment)
- `branchId` (reassignment)
- `status` (status change)
- `members` (member list)
- `signatories` (signatory assignments - must be exactly 3)

---

**Last Updated:** January 2, 2026  
**Version:** 1.0
