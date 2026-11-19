const k_shortMonthLabelOptions = { month: 'short', year: 'numeric' };

// "Dec 2025" for a YYYY-MM month key, read at noon so time zones cannot shift it.
export function shortMonthLabel(month) {
  return new Date(`${month}-01T12:00:00`).toLocaleString('en', k_shortMonthLabelOptions);
}

const k_monthNameOptions = { month: 'long' };
const k_anyYear = 2000;

// "November" for a month number from 1 to 12.
export function monthNumberName(monthNumber) {
  return new Date(k_anyYear, monthNumber - 1, 1, 12).toLocaleString('en', k_monthNameOptions);
}
