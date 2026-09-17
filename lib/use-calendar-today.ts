'use client';

import { useEffect, useState } from 'react';
import { calendarToday } from './calendar-clock.mjs';

/** Refresh at minute boundaries, including Brasília midnight, and after resume. */
export function useCalendarToday(): string {
  const [today, setToday] = useState(() => calendarToday());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const refresh = () => {
      if (!active) return;
      if (timer !== undefined) clearTimeout(timer);
      setToday(calendarToday());
      // Recalculate each tick to avoid drift and catch device clock changes.
      timer = setTimeout(refresh, 60_000 - Date.now() % 60_000 + 25);
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return today;
}
