import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { localCalendarDate } from './calendar.js';

const k_activeAppState = 'active';

// The device's local date (L01/L02). When the app returns to the foreground
// on a later day, the new date re-renders the app, so entries dated today
// count without a restart or any confirmation.
export function useLocalDate() {
  const [today, setToday] = useState(localCalendarDate);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', appState => {
      if (appState !== k_activeAppState) {
        return;
      }
      setToday(localCalendarDate());
    });
    return () => subscription.remove();
  }, []);
  return today;
}
