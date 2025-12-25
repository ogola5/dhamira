/**
 * ingestion/ingest.js
 * LEGACY MIGRATION CLI — CLIENT-DRIVEN GROUP INGESTION (FINAL)
 */

import mongoose from 'mongoose';
import connectDB from '../config/db.js';

import Branch from '../models/BranchModel.js';
import Group from '../models/GroupModel.js';

import { extractExcel } from './extractors/excelExtractor.js';
import { normalizeClientRow } from './normalizers/clientNormalizer.js';

import { validateGroupJson } from './validators/groupValidator.js';
import { validateClientJson } from './validators/clientValidator.js';

import { insertGroups } from './inserters/groupInserter.js';
import { insertClients } from './inserters/clientInserter.js';

/* ======================================================
   CLI ARG PARSER
====================================================== */

const [, , type, ...argv] = process.argv;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;

    if (t.includes('=')) {
      const [k, ...v] = t.split('=');
      args[k] = v.join('=');
    } else if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
      args[t] = true;
    } else {
      args[t] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const args = parseArgs(argv);

const branchCode  = args['--branch'];
const clientsFile = args['--clients'];
const dryRun      = Boolean(args['--dry-run']);

if (type !== 'branch_clients') {
  console.error('❌ Usage: node ingestion/ingest.js branch_clients --branch=001 --clients=INTAKE.xlsx [--dry-run]');
  process.exit(1);
}

if (!branchCode) {
  console.error('❌ Missing --branch');
  process.exit(1);
}

if (!clientsFile) {
  console.error('❌ Missing --clients');
  process.exit(1);
}

/* ======================================================
   SYSTEM USER (LEGACY OWNER)
====================================================== */

const SYSTEM_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

/* ======================================================
   GROUP DERIVATION (AUTHORITATIVE)
====================================================== */

function deriveGroupsFromClients(clients, branchId) {
  const seen = new Set();
  const groups = [];

  for (const c of clients) {
    const name = c.groupName;
    if (!name) continue;

    if (!seen.has(name)) {
      seen.add(name);
      groups.push({
        groupName: name,
        branchId,
        source: 'legacy_excel',
        status: 'legacy',
        legacyImportedAt: new Date(),
      });
    }
  }

  return groups;
}

/* ======================================================
   MAIN
====================================================== */

async function run() {
  try {
    await connectDB();

    console.log('🔎 Parsed CLI:', {
      type,
      branchCode,
      clientsFile,
      dryRun,
    });

    /* ---------- RESOLVE BRANCH ---------- */
    const branch = await Branch.findOne({ code: String(branchCode) }).lean();
    if (!branch) {
      throw new Error(`Branch not found for code=${branchCode}`);
    }

    const branchId = branch._id;

    /* ---------- STEP 1: EXTRACT + NORMALIZE CLIENTS ---------- */
    const rawClients = extractExcel(clientsFile);
    if (!rawClients.length) {
      throw new Error('Clients file is empty');
    }

    const clients = rawClients.map(r => normalizeClientRow(r, branchCode));

    clients.forEach((c, i) => {
      const errs = validateClientJson(c, i + 2);
      if (errs.length) {
        errs.forEach(e => console.error(e));
        process.exit(1);
      }
    });

    /* ---------- STEP 2: DERIVE GROUPS ---------- */
    const groups = deriveGroupsFromClients(clients, branchId);

    groups.forEach((g, i) => {
      const errs = validateGroupJson(g, i + 2);
      if (errs.length) {
        errs.forEach(e => console.error(e));
        process.exit(1);
      }
    });

    console.log(`📦 Derived ${groups.length} groups from intake`);

    /* ---------- STEP 3: INSERT GROUPS ---------- */
    await insertGroups(groups, SYSTEM_USER_ID, dryRun);

    /* ---------- STEP 4: BUILD GROUP MAP ---------- */
    const groupMap = new Map();

    if (dryRun) {
      // Dry-run: simulate persisted groups
      for (const g of groups) {
        groupMap.set(g.groupName, new mongoose.Types.ObjectId());
      }
    } else {
      // Real run: load persisted groups
      const persistedGroups = await Group.find({ branchId })
        .select('_id name')
        .lean();

      persistedGroups.forEach(g => groupMap.set(g.name, g._id));
    }

    /* ---------- STEP 5: INSERT CLIENTS ---------- */
    await insertClients(clients, SYSTEM_USER_ID, dryRun, groupMap);

    console.log(
      dryRun
        ? `✅ Dry-run OK (groups=${groups.length}, clients=${clients.length})`
        : `✅ Migration committed (groups=${groups.length}, clients=${clients.length})`
    );
  } catch (err) {
    console.error('\n❌ Ingestion failed');
    console.error(err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

run();
