import { TIME_SLOT_MAP } from '../utils/timeUtils.js';

function normalizeDay(v) {
  if (!v) return null;
  return v.toString().trim().toUpperCase();
}

function normalizeTime(v) {
  if (!v) return null;
  return TIME_SLOT_MAP[v.toLowerCase()] || null;
}

function extractGroupName(cell) {
  if (!cell) return null;
  return cell.toString().trim();
}

/**
 * Converts GROUP SCHEDULE matrix → flat group records
 */
export function normalizeGroupScheduleMatrix(rows) {
  const results = [];
  let currentDay = null;

  for (const row of rows) {
    // Column meanings (by observation)
    const dayCell = row['__EMPTY'];
    const timeCell = row['__EMPTY_1'];

    if (dayCell) {
      currentDay = normalizeDay(dayCell);
    }

    if (!currentDay || !timeCell) continue;

    const meetingTime = normalizeTime(timeCell);
    if (!meetingTime) continue;

    // All other columns may contain group names
    for (const [key, value] of Object.entries(row)) {
      if (key === '__EMPTY' || key === '__EMPTY_1') continue;
      if (!value) continue;

      const groupName = extractGroupName(value);
      if (!groupName) continue;

      results.push({
        groupName,
        meetingDay: currentDay,
        meetingTime,
        // officer assignment deferred
      });
    }
  }

  return results;
}
