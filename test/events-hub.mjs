// F15: the Events tab and the event hub. The status rule (Worker and app copies, clock edges),
// the my-events API, the one-event API and what it will and will not return, and source guards
// for the tab, the pages and the budget. Run: node test/events-hub.mjs
import { readFileSync } from "node:fs";
import { makeEnv, check, summary } from "./harness.mjs";
import { eventStatus as serverStatus, NO_END_GRACE_MS } from "../worker/eventstatus.js";
import { eventStatus as appStatus } from "../src/lib/eventstatus.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const H = 3600e3;

console.log("\n# Status rule (one helper, Worker and app)");
{
  const same = read("worker/eventstatus.js") === read("src/lib/eventstatus.js");
  check("the Worker and app copies of the helper are identical", same);
  const T = Date.UTC(2026, 10, 4, 18, 0);
  const cases = [
    // [name, event, checkedInAt, now, expected]
    ["started, no end time, just checked in", { startsAt: T }, T + 4 * 60e3, T + 5 * 60e3, "ongoing"],
    ["no start and no end time, just checked in", {}, T, T + 60e3, "ongoing"],
    ["starts exactly now", { startsAt: T, endsAt: T + 2 * H }, T - H, T, "ongoing"],
    ["checked in an hour early", { startsAt: T, endsAt: T + 2 * H }, T - H, T - 1, "upcoming"],
    ["upcoming with no end time", { startsAt: T }, T - H, T - 60e3, "upcoming"],
    ["one millisecond before the end time", { startsAt: T, endsAt: T + 2 * H }, T, T + 2 * H - 1, "ongoing"],
    ["exactly at the end time", { startsAt: T, endsAt: T + 2 * H }, T, T + 2 * H, "ended"],
    ["after the end time", { startsAt: T, endsAt: T + 2 * H }, T, T + 3 * H, "ended"],
    ["the host ended it mid-event", { startsAt: T, endsAt: T + 2 * H, endedAt: T + H }, T, T + H + 1, "ended"],
    ["the host ended it with no end time set", { startsAt: T, endedAt: T + H }, T, T + H, "ended"],
    ["the host ended it before it started", { startsAt: T, endedAt: T - 5 * 60e3 }, T - H, T - 60e3, "ended"],
    ["no end time: exactly 12 hours after the start is still on", { startsAt: T }, T, T + NO_END_GRACE_MS, "ongoing"],
    ["no end time: 12 hours and a millisecond after the start", { startsAt: T }, T, T + NO_END_GRACE_MS + 1, "ended"],
    ["no end time: a late check-in counts from the check-in", { startsAt: T }, T + 20 * H, T + 31 * H, "ongoing"],
    ["no end time: 12 hours after a late check-in", { startsAt: T }, T + 20 * H, T + 32 * H + 1, "ended"],
    ["no start or end time: counts from the check-in", {}, T, T + NO_END_GRACE_MS + 1, "ended"],
    ["an end time stops the 12 hour rule", { startsAt: T, endsAt: T + 30 * H }, T, T + 20 * H, "ongoing"],
    ["null fields behave as unset", { startsAt: null, endsAt: null, endedAt: null }, T, T + H, "ongoing"],
    ["no event at all does not throw", undefined, T, T, "ongoing"],
  ];
  for (const [name, ev, at, t, want] of cases) {
    const a = serverStatus(ev, at, t), b = appStatus(ev, at, t);
    check(`${name}: ${want}`, a === want && b === want, { a, b });
  }
}

summary();
