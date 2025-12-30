import Group from '../../models/GroupModel.js';

/**
 * INSERT LEGACY GROUPS
 *
 * Assumptions:
 * - branchId is already validated upstream
 * - insert-only
 * - dry-run safe
 */
export async function insertGroups(groups, createdBy, dryRun = false) {
  let inserted = 0;
  const now = new Date();

  for (const g of groups) {
    if (!g.branchId) {
      throw new Error('insertGroups requires branchId on group');
    }

    if (!g.groupName) {
      throw new Error('Missing groupName');
    }

    // 1. Group name MUST be unique
    const existing = await Group.findOne({ name: g.groupName });
    if (existing) {
      throw new Error(`Duplicate group name detected: ${g.groupName}`);
    }

    if (dryRun) {
      inserted++;
      continue;
    }

    // 2. Insert — set loanOfficer to createdBy as fallback for legacy imports
    await Group.create({
      name: g.groupName,
      branchId: g.branchId,

      meetingDay: null,
      meetingTime: null,
      loanOfficer: createdBy,
      signatories: [],
      members: [],

      source: 'legacy_excel',
      status: 'legacy',
      legacyImportedAt: now,

      createdBy,
    });

    inserted++;
  }

  return inserted;
}
