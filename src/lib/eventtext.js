// F15: the words and dates on the Events page and the event hub. No imports, so it is easy to test.
// All dates are en-GB in the viewer's own time zone, like the connection time on a person's page.
const clock = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = (t) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "");
export const timeOfDay = (t) => (t ? clock(t) : "");
// "Tue 4 Nov 2026", in the viewer's own time zone.
export const dateOf = (t) => (t ? day(t) : "");
export const connectionsText = (n) => (n === 1 ? "1 connection" : `${n || 0} connections`);

export const STATUS_LABEL = { ongoing: "Ongoing", ended: "Ended" };
// The words under a name for the one status: "Ongoing", "Ended", or "Starts 18:00" (with the day if not today).
export function statusText(status, ev) {
  if (status === "upcoming") {
    const sameDay = new Date(ev.startsAt).toDateString() === new Date().toDateString();
    return sameDay ? `Starts ${clock(ev.startsAt)}` : `Starts ${day(ev.startsAt)}, ${clock(ev.startsAt)}`;
  }
  return STATUS_LABEL[status] || "";
}
