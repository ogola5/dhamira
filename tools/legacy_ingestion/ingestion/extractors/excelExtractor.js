import xlsx from 'xlsx';

function normalizeHeader(header) {
  return String(header || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function findHeaderRow(sheet) {
  const rows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(c => String(c).toUpperCase().trim());

    if (
      row.includes('CLIENT NAME') ||
      row.includes("CLIENT'S NAME")
    ) {
      return i;
    }
  }

  throw new Error('❌ Header row not found (CLIENT NAME)');
}

export function extractExcel(filePath, sheetName = null) {
  const workbook = xlsx.readFile(filePath);
  const sheet =
    workbook.Sheets[sheetName || workbook.SheetNames[0]];

  const headerRowIndex = findHeaderRow(sheet);

  const json = xlsx.utils.sheet_to_json(sheet, {
    range: headerRowIndex,
    defval: '',
    raw: false,
  });

  return json.map(row => {
    const out = {};
    for (const k of Object.keys(row)) {
      out[normalizeHeader(k)] = row[k];
    }
    return out;
  });
}
