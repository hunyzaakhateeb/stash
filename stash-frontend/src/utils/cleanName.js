export function getCleanFileName(name) {
  if (!name) return '';
  return name
    .replace(/^\d+-/, '') // remove timestamp prefix like 1786558312247-
    .replace(/[\u200B-\u200D\uFEFF\u202F\u00A0]/g, ' ') // replace hidden unicode spaces
    .replace(/â€¯/g, ' ') // replace utf-8 encoding artifacts
    .replace(/â€“/g, '-')
    .trim();
}
