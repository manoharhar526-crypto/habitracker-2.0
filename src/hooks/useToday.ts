import { useEffect, useState } from "react";

/** Current date that refreshes at midnight and whenever the app comes back to the foreground. */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const now = new Date();
      setToday(prev => (prev.toDateString() === now.toDateString() ? prev : now));
      clearTimeout(timer);
      const next = new Date(now);
      next.setHours(24, 0, 1, 0);
      timer = setTimeout(refresh, next.getTime() - now.getTime());
    };
    refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return today;
}
