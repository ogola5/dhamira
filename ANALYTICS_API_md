# Analytics API (Suggested)

This document lists recommended analytics endpoints for the frontend. If your backend already exposes similar endpoints, the frontend will prefer them; otherwise the UI falls back to mock data from `lib/mockAnalytics.ts`.

## Overview
GET /api/analytics/overview

Response (200)
```json
{
  "totalLoans": 1234,
  "totalDisbursedCents": 4520000000,
  "totalClients": 3456,
  "defaultRatePercent": 2.4,
  "activeLoans": { "count": 856, "amountCents": 3240000000 },
  "pendingApprovals": { "count": 142, "amountCents": 580000000 },
  "defaulted": { "count": 29, "amountCents": 120000000 },
  "trends": {
    "totalLoansChangePercent": 12,
    "totalDisbursedChangePercent": 8,
    "totalClientsChangePercent": 5,
    "defaultRateChangePercent": -0.3
  }
}
```

Notes:
- Monetary values are in cents to avoid floating point issues on the frontend.
- `trends` are month-over-month percentage changes (positive means increase).

## Portfolio Breakdown
GET /api/analytics/portfolio

Response (200)
```json
{
  "byStatus": {
    "active": { "count": 856, "amountCents": 3240000000 },
    "pending": { "count": 142, "amountCents": 580000000 },
    "defaulted": { "count": 29, "amountCents": 120000000 }
  },
  "byType": {
    "business": { "count": 900, "amountCents": 2500000000 },
    "consumer": { "count": 334, "amountCents": 2020000000 }
  }
}
```

## Endpoints the frontend expects (recommended)
- `GET /api/analytics/overview` — single-shot dashboard metrics
- `GET /api/analytics/portfolio` — breakdowns for charts
- `GET /api/analytics/loans?range=30` — recent loans for the last X days

If these endpoints are not available, the frontend uses `lib/mockAnalytics.ts` as a fallback. Implementing the endpoints above will provide real production data to the UI.

## Groups (related utility)
Assign Signatories
PUT /api/groups/:id/assign-signatories

Request
```json
{
  "signatoryAssignments": [
    { "role": "chairperson", "memberNationalId": "123" },
    { "role": "secretary", "memberNationalId": "456" },
    { "role": "treasurer", "memberNationalId": "789" }
  ]
}
```

Response (200)
```json
{
  "ok": true,
  "message": "Signatories assigned",
  "group": { "_id": "...", "name": "...", "signatories": [ /* ... */ ] }
}
```

---

## Advanced Analytics (recommended)
The frontend's advanced dashboard and reports expect several additional endpoints to power the requested sections: Portfolio, Demographics, Repayments, Loan Performance, Officers, and Risk Analysis. Implement these where possible — the frontend will call them when present and fall back to mocks otherwise.

1) Portfolio Breakdown (detailed)
GET /api/analytics/portfolio?range=30&groupBy=status

Response (200)
```json
{
  "byStatus": {
    "active": { "count": 856, "amountCents": 3240000000 },
    "pending": { "count": 142, "amountCents": 580000000 },
    "defaulted": { "count": 29, "amountCents": 120000000 }
  },
  "byType": {
    "business": { "count": 900, "amountCents": 2500000000 },
    "consumer": { "count": 334, "amountCents": 2020000000 }
  },
  "byRegion": {
    "Nairobi": { "count": 400, "amountCents": 1500000000 },
    "Mombasa": { "count": 120, "amountCents": 600000000 }
  }
}
```

Notes: support `range` (days), `groupBy` (status/type/region), and pagination for very large cardinality.

2) Demographics
GET /api/analytics/demographics?range=365

Response (200)
```json
{
  "ageBuckets": {
    "18-25": 1024,
    "26-35": 5400,
    "36-45": 3200,
    "46+": 800
  },
  "gender": { "male": 4200, "female": 4524, "other": 12 },
  "regions": { "Nairobi": 3000, "Kisumu": 800, "Eldoret": 500 }
}
```

Notes: values are client counts. Optional breakdowns: `byProduct`, `byOfficer`.

3) Repayments Summary
GET /api/analytics/repayments?range=30&groupBy=day

Response (200)
```json
{
  "totalRepaymentsCents": 125000000,
  "count": 3421,
  "recent": [
    { "date": "2025-12-28", "amountCents": 450000, "count": 12 },
    { "date": "2025-12-27", "amountCents": 1250000, "count": 31 }
  ],
  "byMethod": { "mpesa": 100000000, "cash": 25000000 }
}
```

4) Loan Performance / Vintage Analysis
GET /api/analytics/loan-performance?vintageMonths=12

Response (200)
```json
{
  "vintage": [
    { "month": "2025-01", "disbursedCount": 120, "disbursedCents": 20000000, "nplPercent": 1.2 },
    { "month": "2025-02", "disbursedCount": 90, "disbursedCents": 15000000, "nplPercent": 1.8 }
  ],
  "delinquencyBuckets": { "0-30": 95, "31-60": 20, "61-90": 8, "90+": 5 }
}
```

Notes: `nplPercent` = non-performing loans percent (90+ days). Useful for charts and cohort analysis.

5) Officers / Team Metrics
GET /api/analytics/officers?range=30&sort=loans

Response (200)
```json
{
  "officers": [
    { "id": "u1", "name": "Alice", "loansInitiated": 120, "approvals": 110, "approvalRate": 0.9167, "disbursedCents": 5000000 },
    { "id": "u2", "name": "Bob", "loansInitiated": 90, "approvals": 80, "approvalRate": 0.8889, "disbursedCents": 3200000 }
  ]
}
```

6) Risk Analysis / Score Distribution
GET /api/analytics/risk?range=365

Response (200)
```json
{
  "scoreBuckets": { "0-10": 120, "11-15": 420, "16-20": 2300, "21-25": 3296 },
  "topRiskDrivers": [
    { "driver": "lowSavings", "impact": 0.32 },
    { "driver": "lateRepayments", "impact": 0.21 }
  ],
  "expectedLossCents": 12000000
}
```

Implementation notes
- All endpoints return 200 with JSON; include clear error messages and standard `401/403/500` responses when appropriate.
- Monetary fields should use cents. Dates should be ISO-8601 strings. Percent values are raw numbers (e.g., 2.4 for 2.4%).
- Support query params: `range` (days), `startDate`, `endDate`, `groupBy`, `page`, `limit`, and optional `region`/`officerId` filters.

If any of these endpoints are missing on your backend I can:
- Add more detailed documentation for that specific endpoint (request/response + examples), or
- Wire the frontend to gracefully hide that section and surface a clear message like "Analytics data unavailable — implement /api/analytics/<name> to enable this view".

---
