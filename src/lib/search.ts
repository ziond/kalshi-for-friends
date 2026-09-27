/** Case-insensitive "contains", ignoring surrounding spaces. An empty query matches everything. */
export function matchesSearch(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || text.toLowerCase().includes(q);
}
