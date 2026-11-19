const k_shortMonthLabelOptions = { month: 'short', year: 'numeric' };

// "Dec 2025" for a YYYY-MM month key, read at noon so time zones cannot shift it.
export function shortMonthLabel(month) {
  return new Date(`${month}-01T12:00:00`).toLocaleString('en', k_shortMonthLabelOptions);
}
