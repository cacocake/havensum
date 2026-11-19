// Names of exported files, dated by the phone's local calendar date (owner decision L02).
import { localCalendarDate } from './calendar.js';

export function backupFileName(date = new Date()) {
  return `Havensum-backup-${localCalendarDate(date)}.json`;
}

export function transactionsCsvFileName(date = new Date()) {
  return `Havensum-transactions-${localCalendarDate(date)}.csv`;
}
