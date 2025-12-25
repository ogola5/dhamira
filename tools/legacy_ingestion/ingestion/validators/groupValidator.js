export function validateGroupJson(group, line) {
  const errors = [];

  if (!group.groupName) {
    errors.push(`Line ${line}: Missing GROUP name`);
  }

  return errors;
}
