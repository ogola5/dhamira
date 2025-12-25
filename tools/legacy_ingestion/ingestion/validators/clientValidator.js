export function validateClientJson(client, line) {
  const errors = [];

  if (!client.name) errors.push(`Line ${line}: Missing CLIENT NAME`);
  if (!client.nationalId) errors.push(`Line ${line}: Missing ID NO`);
  if (!client.phone) errors.push(`Line ${line}: Missing PHONE`);
  if (!client.groupName) errors.push(`Line ${line}: Missing GROUP`);
  if (!client.businessType) errors.push(`Line ${line}: Missing BUSINESS`);
  if (!client.businessLocation)
    errors.push(`Line ${line}: Missing RESIDENCE / LOCATION`);

  return errors;
}
