// F15: the words and dates on the Events page and the event hub. F68: and the status and order of the event lists.
// Imports only the shared status rule, so it is easy to test.
import { eventStatus } from "./eventstatus.js";
// All dates are en-GB in the viewer's own time zone, like the connection time on a person's page.
const clock = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = (t) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "");
export const timeOfDay = (t) => (t ? clock(t) : "");
// "Tue 4 Nov 2026", in the viewer's own time zone.
export const dateOf = (t) => (t ? day(t) : "");
export const connectionsText = (n) => (n === 1 ? "1 connection" : `${n || 0} connections`);

// F68: the three words shown as a chip on every event list. The ids stay "ongoing", "upcoming" and "ended".
export const STATUS_LABEL = { ongoing: "In progress", upcoming: "Upcoming", ended: "Ended" };
// The words under a name for the one status: "In progress", "Ended", or "Starts 18:00" (with the day if not today).
export function statusText(status, ev) {
  if (status === "upcoming") {
    const sameDay = new Date(ev.startsAt).toDateString() === new Date().toDateString();
    return sameDay ? `Starts ${clock(ev.startsAt)}` : `Starts ${day(ev.startsAt)}, ${clock(ev.startsAt)}`;
  }
  return STATUS_LABEL[status] || "";
}

// A perk the host typed as "Free coffee (Show this at the bar before 11am)": the words before the brackets are the
// button, the words inside them open when it is pressed. With no brackets (or nothing before them) it is just a line.
export function perkParts(text) {
  const t = String(text || "").trim();
  const m = /^(.*?)\s*\(([^]*)\)\s*$/.exec(t);
  if (!m || !m[1].trim() || !m[2].trim()) return { label: t, detail: "" };
  return { label: m[1].trim(), detail: m[2].trim() };
}

// F68: the order of every event list: In progress first, then Upcoming (soonest first), then Ended (newest first).
// The one status of a listed event at time t. The host's list has no check-in, and an event with no start, no end
// and not ended is upcoming, not over.
export function statusAt(ev, t) {
  if (!ev.startsAt && !ev.endsAt && !ev.endedAt && !ev.checkedInAt) return "upcoming";
  return eventStatus(ev, ev.checkedInAt, t);
}

// rows: [{ e, status }]. recent(e): when the event was last of interest (attended, or started), for newest first.
export function groupByStatus(rows, recent) {
  const by = (s) => rows.filter((r) => r.status === s);
  const soonest = (a, b) => (a.e.startsAt || Infinity) - (b.e.startsAt || Infinity);
  const newest = (a, b) => (recent(b.e) || 0) - (recent(a.e) || 0);
  return {
    ongoing: by("ongoing").sort(newest),
    upcoming: by("upcoming").sort(soonest),
    ended: by("ended").sort(newest),
  };
}
