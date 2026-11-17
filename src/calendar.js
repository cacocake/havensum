const k_monthKeyLength = 7;
export const k_calendarDateLength = 10;

export function monthOf(date) {
  return date.slice(0, k_monthKeyLength);
}

export function formatMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function previousMonths(month, historyWindow) {
  const [year, monthNumber] = month.split('-').map(Number);
  return Array.from({ length: historyWindow }, (_, offset) => formatMonth(new Date(year, monthNumber - 2 - offset, 1)));
}

export function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}
