/** Calendar geometry uses civil dates and UTC arithmetic, never timezone conversion of stored dates. */
export function calendarToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function calendarMonthShift(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(year, number - 1 + delta, 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function calendarMonthDays(month: string): string[] {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(year, number - 1, 1);
  date.setUTCDate(1 - date.getUTCDay());
  return Array.from({ length: 42 }, (_, offset) => {
    const day = new Date(date); day.setUTCDate(date.getUTCDate() + offset);
    return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`;
  });
}
