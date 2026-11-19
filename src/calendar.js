const k_monthKeyLength = 7;
const k_yearKeyLength = 4;
export const k_calendarDateLength = 10;

export function yearOfMonth(month) {
  return Number(month.slice(0, k_yearKeyLength));
}

export function monthNumberOf(month) {
  return Number(month.slice(k_yearKeyLength + 1, k_monthKeyLength));
}

// The device's local calendar date, matching how dates are entered.
export function localCalendarDate(date = new Date()) {
  return `${formatMonth(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

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

export function monthKeyOf(year, monthNumber) {
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
}

export function nextMonth(month) {
  return formatMonth(new Date(yearOfMonth(month), monthNumberOf(month), 1));
}
