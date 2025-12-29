import Loan from '../models/LoanModel.js';
import Client from '../models/ClientModel.js';
import Repayment from '../models/RepaymentModel.js';
import Transaction from '../models/TransactionModel.js';
import User from '../models/userModel.js';
import CreditAssessment from '../models/CreditAssessmentModel.js';

function pctChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

export async function overview(req, res, next) {
  try {
    const totalLoans = await Loan.countDocuments({});

    const disbursedAgg = await Loan.aggregate([
      { $match: { status: { $in: ['disbursed', 'repaid', 'defaulted'] } } },
      { $group: { _id: null, sum: { $sum: '$principal_cents' } } },
    ]);
    const totalDisbursedCents = (disbursedAgg[0] && disbursedAgg[0].sum) || 0;

    const totalClients = await Client.countDocuments({});

    const activeAgg = await Loan.aggregate([
      { $match: { status: 'disbursed' } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$outstanding_cents' } } },
    ]);
    const active = {
      count: (activeAgg[0] && activeAgg[0].count) || 0,
      amountCents: (activeAgg[0] && activeAgg[0].amount) || 0,
    };

    const pendingAgg = await Loan.aggregate([
      { $match: { status: { $in: ['approved', 'disbursement_pending'] } } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$principal_cents' } } },
    ]);
    const pendingApprovals = {
      count: (pendingAgg[0] && pendingAgg[0].count) || 0,
      amountCents: (pendingAgg[0] && pendingAgg[0].amount) || 0,
    };

    const defaultedAgg = await Loan.aggregate([
      { $match: { status: 'defaulted' } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$outstanding_cents' } } },
    ]);
    const defaulted = {
      count: (defaultedAgg[0] && defaultedAgg[0].count) || 0,
      amountCents: (defaultedAgg[0] && defaultedAgg[0].amount) || 0,
    };

    const defaultRatePercent = totalLoans ? Math.round((defaulted.count / totalLoans) * 10000) / 100 : 0;

    // Trends: compare last 30 days to previous 30 days
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prev30 = new Date(last30.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [currLoans, prevLoans] = await Promise.all([
      Loan.countDocuments({ createdAt: { $gte: last30 } }),
      Loan.countDocuments({ createdAt: { $gte: prev30, $lt: last30 } }),
    ]);

    const [currDisbursedAgg, prevDisbursedAgg] = await Promise.all([
      Loan.aggregate([
        { $match: { disbursedAt: { $gte: last30 } } },
        { $group: { _id: null, sum: { $sum: '$principal_cents' } } },
      ]),
      Loan.aggregate([
        { $match: { disbursedAt: { $gte: prev30, $lt: last30 } } },
        { $group: { _id: null, sum: { $sum: '$principal_cents' } } },
      ]),
    ]);
    const currDisbursed = (currDisbursedAgg[0] && currDisbursedAgg[0].sum) || 0;
    const prevDisbursed = (prevDisbursedAgg[0] && prevDisbursedAgg[0].sum) || 0;

    const [currClients, prevClients] = await Promise.all([
      Client.countDocuments({ createdAt: { $gte: last30 } }),
      Client.countDocuments({ createdAt: { $gte: prev30, $lt: last30 } }),
    ]);

    // Default rate change: compute percent for each window and compare
    const currDefaulted = await Loan.countDocuments({ status: 'defaulted', createdAt: { $gte: last30 } });
    const prevDefaulted = await Loan.countDocuments({ status: 'defaulted', createdAt: { $gte: prev30, $lt: last30 } });

    const currDefaultRate = currLoans ? (currDefaulted / currLoans) * 100 : 0;
    const prevDefaultRate = prevLoans ? (prevDefaulted / prevLoans) * 100 : 0;

    const trends = {
      totalLoansChangePercent: pctChange(currLoans, prevLoans),
      totalDisbursedChangePercent: pctChange(currDisbursed, prevDisbursed),
      totalClientsChangePercent: pctChange(currClients, prevClients),
      defaultRateChangePercent: Math.round((currDefaultRate - prevDefaultRate) * 100) / 100,
    };

    res.json({
      totalLoans,
      totalDisbursedCents,
      totalClients,
      defaultRatePercent,
      activeLoans: active,
      pendingApprovals,
      defaulted,
      trends,
    });
  } catch (err) {
    next(err);
  }
}

export async function portfolio(req, res, next) {
  try {
    const byStatusAgg = await Loan.aggregate([
      { $match: { status: { $in: ['disbursed', 'approved', 'disbursement_pending', 'defaulted'] } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$outstanding_cents' },
        },
      },
    ]);

    const mapStatus = { active: ['disbursed'], pending: ['approved', 'disbursement_pending'], defaulted: ['defaulted'] };
    const byStatus = {
      active: { count: 0, amountCents: 0 },
      pending: { count: 0, amountCents: 0 },
      defaulted: { count: 0, amountCents: 0 },
    };

    byStatusAgg.forEach((row) => {
      if (mapStatus.active.includes(row._id)) {
        byStatus.active.count += row.count;
        byStatus.active.amountCents += row.amount || 0;
      }
      if (mapStatus.pending.includes(row._id)) {
        byStatus.pending.count += row.count;
        byStatus.pending.amountCents += row.amount || 0;
      }
      if (mapStatus.defaulted.includes(row._id)) {
        byStatus.defaulted.count += row.count;
        byStatus.defaulted.amountCents += row.amount || 0;
      }
    });

    // By type (product). Map 'fafa' -> 'consumer' for frontend expectation
    const byTypeAgg = await Loan.aggregate([
      { $group: { _id: '$product', count: { $sum: 1 }, amount: { $sum: '$principal_cents' } } },
    ]);

    const byType = { business: { count: 0, amountCents: 0 }, consumer: { count: 0, amountCents: 0 } };
    byTypeAgg.forEach((r) => {
      if (r._id === 'business') {
        byType.business.count = r.count;
        byType.business.amountCents = r.amount || 0;
      }
      if (r._id === 'fafa') {
        byType.consumer.count = r.count;
        byType.consumer.amountCents = r.amount || 0;
      }
    });

    res.json({ byStatus, byType });
  } catch (err) {
    next(err);
  }
}

export async function recentLoans(req, res, next) {
  try {
    const range = parseInt(req.query.range, 10) || 30;
    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

    const loans = await Loan.find({ createdAt: { $gte: since } })
      .select('clientId principal_cents status product createdAt disbursedAt outstanding_cents')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ rangeDays: range, count: loans.length, data: loans });
  } catch (err) {
    next(err);
  }
}

export async function demographics(req, res, next) {
  try {
    const rangeDays = parseInt(req.query.range, 10) || 365;
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    // businessType buckets
    const byBusiness = await Client.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$businessType', count: { $sum: 1 } } },
    ]);

    const business = {};
    byBusiness.forEach(b => { business[b._id || 'unknown'] = b.count; });

    // regions -> using businessLocation as proxy
    const byRegion = await Client.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$businessLocation', count: { $sum: 1 } } },
    ]);
    const regions = {};
    byRegion.forEach(r => { regions[r._id || 'unknown'] = r.count; });

    // residenceType
    const byResidence = await Client.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$residenceType', count: { $sum: 1 } } },
    ]);
    const residenceType = {};
    byResidence.forEach(r => { residenceType[r._id || 'unknown'] = r.count; });

    res.json({ rangeDays, businessType: business, regions, residenceType });
  } catch (err) {
    next(err);
  }
}

export async function repaymentsSummary(req, res, next) {
  try {
    const range = parseInt(req.query.range, 10) || 30;
    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

    const totalAgg = await Repayment.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, sum: { $sum: '$amount_cents' }, count: { $sum: 1 } } },
    ]);
    const totalRepaymentsCents = (totalAgg[0] && totalAgg[0].sum) || 0;
    const count = (totalAgg[0] && totalAgg[0].count) || 0;

    const recent = await Repayment.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, amount: { $sum: '$amount_cents' }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 30 },
    ]);

    // byMethod using Transaction model where paymentMethod is stored in RepaymentModel.paymentMethod
    const byMethodAgg = await Repayment.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$paymentMethod', sum: { $sum: '$amount_cents' } } },
    ]);
    const byMethod = {};
    byMethodAgg.forEach(b => { byMethod[b._id || 'unknown'] = b.sum; });

    res.json({ totalRepaymentsCents, count, recent, byMethod });
  } catch (err) {
    next(err);
  }
}

export async function loanPerformance(req, res, next) {
  try {
    const vintageMonths = Math.min(parseInt(req.query.vintageMonths, 10) || 12, 36);
    const now = new Date();

    const vintage = [];
    for (let i = vintageMonths - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);

      const disbursedAgg = await Loan.aggregate([
        { $match: { disbursedAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, count: { $sum: 1 }, sum: { $sum: '$principal_cents' } } },
      ]);
      const disbursedCount = (disbursedAgg[0] && disbursedAgg[0].count) || 0;
      const disbursedCents = (disbursedAgg[0] && disbursedAgg[0].sum) || 0;

      // npl = loans disbursed in that month that are defaulted now (simple measure)
      const nplCountAgg = await Loan.aggregate([
        { $match: { disbursedAt: { $gte: start, $lt: end }, status: 'defaulted' } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);
      const nplCount = (nplCountAgg[0] && nplCountAgg[0].count) || 0;
      const nplPercent = disbursedCount ? Math.round((nplCount / disbursedCount) * 10000) / 100 : 0;

      vintage.push({ month: start.toISOString().slice(0,7), disbursedCount, disbursedCents, nplPercent });
    }

    // delinquency buckets (based on dueDate vs now and status not repaid/defaulted)
    const nowDate = new Date();
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const delinquentLoans = await Loan.find({ status: { $nin: ['repaid','initiated','approved','cancelled'] }, dueDate: { $lt: nowDate } }).select('dueDate');
    delinquentLoans.forEach(l => {
      const days = Math.floor((nowDate - new Date(l.dueDate)) / (24*60*60*1000));
      if (days <= 30) buckets['0-30']++;
      else if (days <= 60) buckets['31-60']++;
      else if (days <= 90) buckets['61-90']++;
      else buckets['90+']++;
    });

    res.json({ vintage, delinquencyBuckets: buckets });
  } catch (err) {
    next(err);
  }
}

export async function officers(req, res, next) {
  try {
    const range = parseInt(req.query.range, 10) || 30;
    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

    const users = await User.find({ role: { $in: ['loan_officer'] } }).select('_id username');
    const results = [];

    for (const u of users) {
      const loansInitiated = await Loan.countDocuments({ initiatedBy: u._id, createdAt: { $gte: since } });
      const approvals = await Loan.countDocuments({ approvedBy: u._id, approvedAt: { $gte: since } });
      const disbursedAgg = await Loan.aggregate([
        { $match: { disbursedAt: { $gte: since }, initiatedBy: u._id } },
        { $group: { _id: null, sum: { $sum: '$principal_cents' }, count: { $sum: 1 } } },
      ]);
      const disbursedCents = (disbursedAgg[0] && disbursedAgg[0].sum) || 0;
      const approvalRate = loansInitiated ? Math.round((approvals / loansInitiated) * 10000) / 100 : 0;

      results.push({ id: u._id, name: u.username, loansInitiated, approvals, approvalRate, disbursedCents });
    }

    res.json({ officers: results });
  } catch (err) {
    next(err);
  }
}

export async function risk(req, res, next) {
  try {
    const range = parseInt(req.query.range, 10) || 365;
    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

    // scoreBuckets from credit assessments: create a simple total score out of 25
    const assessments = await CreditAssessment.find({ createdAt: { $gte: since } }).lean();
    const buckets = { '0-10': 0, '11-15': 0, '16-20': 0, '21-25': 0 };
    assessments.forEach(a => {
      const score = (a.character||0)+(a.capacity||0)+(a.capital||0)+(a.collateral||0)+(a.conditions||0);
      if (score <= 10) buckets['0-10']++;
      else if (score <= 15) buckets['11-15']++;
      else if (score <= 20) buckets['16-20']++;
      else buckets['21-25']++;
    });

    // top risk drivers (basic heuristics)
    const lowSavings = await Client.countDocuments({ savings_balance_cents: { $lt: 10000 }, createdAt: { $gte: since } });
    const lateRepayments = await Loan.countDocuments({ dueDate: { $lt: new Date() }, status: { $nin: ['repaid','initiated','approved','cancelled'] } });
    const totalClients = await Client.countDocuments({ createdAt: { $gte: since } });

    const topRiskDrivers = [
      { driver: 'lowSavings', impact: totalClients ? Math.round((lowSavings/totalClients)*10000)/100 : 0 },
      { driver: 'lateRepayments', impact: totalClients ? Math.round((lateRepayments/totalClients)*10000)/100 : 0 },
    ];

    // expected loss: sum of outstanding for defaulted loans * 0.5 (very rough)
    const defAgg = await Loan.aggregate([
      { $match: { status: 'defaulted' } },
      { $group: { _id: null, sum: { $sum: '$outstanding_cents' } } },
    ]);
    const expectedLossCents = ((defAgg[0] && defAgg[0].sum) || 0) * 0.5;

    res.json({ scoreBuckets: buckets, topRiskDrivers, expectedLossCents });
  } catch (err) {
    next(err);
  }
}
