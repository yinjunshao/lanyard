// Small date helpers shared by the event and follow-up screens.

/** ms → value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ms, or null. */
export const fromLocalInput = (v) => (v ? new Date(v).getTime() : null);

export const fmtDay = (t) =>
  t ? new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "";

export const fmtDateTime = (t) =>
  t ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

/** 9am local time, `days` from today. */
export function morningIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

/** "today", "tomorrow", "in 3 days", "2 days ago". */
export function relativeDay(t) {
  const start = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((start(t) - start(Date.now())) / 864e5);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
