import { TIME_SLOT_MAP } from '../utils/timeUtils.js';

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return null;
}

export function normalizeGroupRow(row) {
  return {
    groupName: pick(row, ['GROUP', 'GROUP NAME']),

    meetingDay: pick(row, ['DAY', 'MEETING DAY']),

    meetingTime:
      TIME_SLOT_MAP[pick(row, ['TIME', 'TIME SLOT'])] || null,

    loanOfficerUsername: pick(row, [
      'OFFICER',
      'LOAN OFFICER',
      'OFFICER NAME',
    ]),
  };
}
