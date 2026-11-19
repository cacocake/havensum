import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { localCalendarDate } from './calendar.js';

const k_activeAppState = 'active';
// A little past midnight, so the timer never fires on the old day.
const k_afterMidnightMilliseconds = 1000;

function millisecondsUntilNextLocalDay(now = new Date()) {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return nextMidnight.getTime() - now.getTime() + k_afterMidnightMilliseconds;
}

// The device's local date (L01/L02). It changes at local midnight while the
// app stays open and is checked again when the app returns to the
// foreground, so entries dated today count without a restart or confirmation.
export function useLocalDate() {
  const [today, setToday] = useState(localCalendarDate);
  useEffect(() => {
    let timer = null;
    // Re-armed on every firing, even if the clock was set back and the date did not change.
    function scheduleNextDay() {
      timer = setTimeout(() => {
        setToday(localCalendarDate());
        scheduleNextDay();
      }, millisecondsUntilNextLocalDay());
    }
    scheduleNextDay();
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', appState => {
      if (appState !== k_activeAppState) {
        return;
      }
      setToday(localCalendarDate());
    });
    return () => subscription?.remove();
  }, []);
  return today;
}
