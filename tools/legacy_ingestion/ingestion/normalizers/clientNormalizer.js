function pick(row, keys) {
  for (const key of keys) {
    if (!row.hasOwnProperty(key)) continue;

    const v = row[key];
    if (v === null || v === undefined) continue;

    const s = String(v).trim();
    if (s !== '') return s;
  }
  return null;
}

export function normalizeClientRow(row, branchCode) {
  const name = pick(row, [
    "CLIENT'S NAME",
    'CLIENT NAME',
    'NAME',
  ]);

  const nationalId = pick(row, [
    'ID. NO',
    'ID NO',
    'ID',
    'NATIONAL ID',
  ]);

  const phone = pick(row, [
    'PHONE NO.',
    'PHONE NO',
    'PHONE',
    'MOBILE',
  ]);

  const groupName = pick(row, [
    'GROUP',
    'GROUP NAME',
  ]);

  return {
    // --------- STRICT FIELDS (must exist) ----------
    name,
    nationalId,
    phone,
    groupName,

    // --------- LENIENT LEGACY FIELDS ----------
    businessType:
      pick(row, [
        'BUSINESS',
        'BUSINESS TYPE',
      ]) || 'UNKNOWN',

    businessLocation:
      pick(row, [
        'RESIDENCE',
        'LOCATION',
      ]) || null,

    registrationDate:
      pick(row, [
        'REG. DATE',
        'REG DATE',
        'DATE',
      ]) || null,

    branchCode,
  };
}
