// utils/importUtils.js
export function normalize(value) {
  return typeof value === 'string' ? value.trim() : value;
}

export function isValidISODate(value) {
  return !value || !isNaN(Date.parse(value));
}

export const TIME_SLOT_MAP = {
  '9-10': '09:00',
  '10-11': '10:00',
  '11-12': '11:00',
  '12-1': '12:00',
  '1-2': '13:00',
};
