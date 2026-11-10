// Date and time maths for the pickers (UiDatePicker, UiTimePicker, UiDateTimePicker).
// Plain JS with no Vue, so test/dates.mjs can run it in Node.
//
// A calendar day is { y, m, d } with m = 1..12. A time of day is "HH:mm" (24 hour).
// Calendar maths uses UTC internally, so it never depends on the machine's time zone
// and never trips over a clock change. Only msOf / splitMs read the viewer's local
// zone, which is what <input type="datetime-local"> did before.

export const pad2 = (n) => String(n).padStart(2, "0");

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** 0 = Monday ... 6 = Sunday (UK weeks start on Monday). */
export const weekday = (y, m, d) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;

export function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Moves by whole months and keeps the day when it fits (31 Jan + 1 month = 28/29 Feb). */
export function addMonths({ y, m, d }, n) {
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12 + 12) % 12 + 1;
  return { y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) };
}

export const cmpDay = (a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d);
export const sameDay = (a, b) => !!a && !!b && cmpDay(a, b) === 0;

export function clampDay(day, min, max) {
  if (min && cmpDay(day, min) < 0) return { ...min };
  if (max && cmpDay(day, max) > 0) return { ...max };
  return day;
}

/** The six weeks (42 days) shown for a month, Monday first. Always six, so the grid never changes height. */
export function monthGrid(y, m) {
  const first = { y, m, d: 1 };
  const start = addDays(first, -weekday(y, m, 1));
  const out = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, w * 7 + i);
      row.push({ ...day, inMonth: day.m === m });
    }
    out.push(row);
  }
  return out;
}

/** The day of the month of the last Sunday: the UK clocks change then in March (forward) and October (back). */
export function lastSunday(y, m) {
  const last = daysInMonth(y, m);
  return last - ((weekday(y, m, last) + 1) % 7);
}

// ---- "2026-11-04" (the value type of <input type="date">) ----
export const isoOf = ({ y, m, d }) => `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;

export function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const day = { y: +m[1], m: +m[2], d: +m[3] };
  return day.m >= 1 && day.m <= 12 && day.d >= 1 && day.d <= daysInMonth(day.y, day.m) ? day : null;
}

// ---- display ----
const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
const utc = ({ y, m, d }) => new Date(Date.UTC(y, m - 1, d));

/** "Tue 4 Nov 2026". Built from parts, so it does not change with the browser's comma habits. */
export const formatDay = (day) => (day ? `${DAY.format(utc(day))} ${day.d} ${MONTH.format(utc(day))} ${day.y}` : "");
/** "November 2026" */
export const formatMonth = (y, m) => `${MONTH_LONG.format(utc({ y, m, d: 1 }))} ${y}`;
/** "Mon" ... "Sun" for column headers. */
export const weekdayNames = () => Array.from({ length: 7 }, (_, i) => DAY.format(utc(addDays({ y: 2024, m: 1, d: 1 }, i)))); // 1 Jan 2024 is a Monday
/** "Tuesday 4 November 2026", for screen readers. */
export const formatDayLong = (day) =>
  `${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(utc(day))} ${day.d} ${MONTH_LONG.format(utc(day))} ${day.y}`;

// ---- time of day ----
export const formatTime = (h, min) => `${pad2(h)}:${pad2(min)}`;

export function parseHm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  if (!m) return null;
  const h = +m[1], min = +m[2];
  return h < 24 && min < 60 ? { h, min } : null;
}

/**
 * What people type for a time: "18:30", "18.30", "1830", "6.30pm", "6pm", "6:30 PM", "18".
 * Returns "HH:mm" or null. "12am" is 00:00 and "12pm" is 12:00.
 */
export function parseTime(text) {
  const t = String(text || "").trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, ":").replace(/h/, ":");
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(t.replace(/:$/, ""));
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3] ? m[3][0] : "";
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === "p" ? 12 : 0);
  } else if (h > 23) return null;
  return formatTime(h, min);
}

/** Every time in `step`-minute steps: "00:00", "00:15" ... "23:45". */
export function timeSteps(step = 15) {
  const out = [];
  for (let i = 0; i < 1440; i += step) out.push(formatTime(Math.floor(i / 60), i % 60));
  return out;
}

/** The nearest slot at or after the given time, in steps ("18:07" -> "18:15"); wraps past midnight. */
export function roundUp(hm, step = 15) {
  const t = parseHm(hm);
  if (!t) return null;
  const total = Math.ceil((t.h * 60 + t.min) / step) * step % 1440;
  return formatTime(Math.floor(total / 60), total % 60);
}

// ---- local date-time <-> unix ms (the viewer's own zone) ----
export const todayLocal = (now = Date.now()) => { const d = new Date(now); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; };

/** ms -> { day, time } in the viewer's zone. */
export function splitMs(ms) {
  const d = new Date(ms);
  return { day: { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }, time: formatTime(d.getHours(), d.getMinutes()) };
}

/**
 * Local day and "HH:mm" -> ms. A time that does not exist (01:30 on the day the UK
 * clocks go forward) becomes the hour after (02:30 BST); a time that happens twice
 * (01:30 on the day they go back) is the first one (BST). Both are what the browser
 * does for <input type="datetime-local"> too.
 */
export function msOf(day, hm) {
  const t = parseHm(hm) || { h: 0, min: 0 };
  return new Date(day.y, day.m - 1, day.d, t.h, t.min, 0, 0).getTime();
}

/** The end of an event when the host has only given a start: two hours later, as elapsed time. */
export const defaultEnd = (startMs) => startMs + 2 * 3600 * 1000;
