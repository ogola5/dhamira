import Client from '../../models/ClientModel.js';

/**
 * LEGACY CLIENT INSERTION
 *
 * Rules:
 * - INSERT ONLY (no updates)
 * - FAIL on duplicate nationalId
 * - groupMap is the ONLY source of truth
 * - dry-run safe
 */
export async function insertClients(
  rows,
  createdBy,
  dryRun = false,
  groupMap
) {
  if (!groupMap || !(groupMap instanceof Map)) {
    throw new Error('insertClients requires a valid groupMap');
  }

  let inserted = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // ---------------- SAFETY NORMALIZATION ----------------
    const groupName = row.groupName?.trim();
    if (!groupName) {
      throw new Error(`Row ${i + 2}: Missing groupName`);
    }

    const groupId = groupMap.get(groupName);
    if (!groupId) {
      throw new Error(
        `Row ${i + 2}: Group not found in groupMap → ${groupName}`
      );
    }

    // ---------------- DUPLICATE PROTECTION ----------------
    if (!dryRun) {
      const exists = await Client.exists({
        nationalId: row.nationalId,
      });

      if (exists) {
        throw new Error(
          `Duplicate nationalId detected: ${row.nationalId} (row ${i + 2})`
        );
      }
    }

    // ---------------- DRY RUN ----------------
    if (dryRun) {
      inserted++;
      continue;
    }

    // ---------------- INSERT ----------------
    // Resolve group to obtain branchId and loanOfficer (required fields)
    const Group = (await import('../../models/GroupModel.js')).default;
    const group = await Group.findById(groupId).select('branchId loanOfficer');
    if (!group) {
      throw new Error(`Row ${i + 2}: Group not found by id ${groupId}`);
    }

    const loanOfficer = group.loanOfficer || createdBy;
    const branchId = group.branchId;

    await Client.create({
      name: row.name,
      nationalId: row.nationalId,
      phone: row.phone,

      groupId,
      branchId,
      loanOfficer,

      businessType: row.businessType,
      businessLocation: row.businessLocation,

      photoUrl: '/uploads/placeholder-client.jpg',

      registrationDate: row.registrationDate
        ? new Date(row.registrationDate)
        : undefined,

      // LEGACY METADATA
      source: 'legacy_excel',
      status: 'legacy',

      createdBy,
    });

    inserted++;
  }

  return inserted;
}
