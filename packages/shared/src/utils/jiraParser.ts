export function extractJiraKeys(text: string): string[] {
  if (!text) return [];
  const regex = /[A-Z][A-Z0-9]+-\d+/g;
  const matches = text.match(regex);
  return matches ? Array.from(new Set(matches)) : [];
}

export function determineJiraStatus(keys: string[]): 'matched' | 'ambiguous' | 'unmatched' {
  if (keys.length === 1) return 'matched';
  if (keys.length > 1) return 'ambiguous';
  return 'unmatched';
}
