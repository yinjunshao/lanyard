// F68: the status chip (In progress, Upcoming, Ended) and the order of both event lists. The host dashboard and the
// attendee Events tab share one status rule (statusOf from useEventClock), one ordering (groupByStatus) and one chip.
// A fixed clock drives the ordering; the host list is read from the real Worker; the chip colours are worked out
// from the tokens in main.css for Light, Dark and Midnight. What the eye sees is checked in a browser (see the plan).
// Run: node test/event-status.mjs
import { readFileSync, readdirSync } from "node:fs";
import { makeEnv, check, summary, becomeHost } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const H = 3600e3;

const tx = await import("../src/lib/eventtext.js");
const { groupByStatus, statusAt } = tx;

const NOW = Date.UTC(2026, 10, 24, 12, 0);
// What useEventClock().statusOf does, with the server's clock `at` (eventlive.js needs Vue and the app's api, so
// the rule lives in eventtext.js and a source guard below checks the clock calls it).
const clockAt = (at) => ({ statusOf: (e) => statusAt(e, at) });
const st = clockAt(NOW);

console.log("\n# The words");
check("the three words are In progress, Upcoming and Ended; the ids are unchanged", JSON.stringify(tx.STATUS_LABEL) === JSON.stringify({ ongoing: "In progress", upcoming: "Upcoming", ended: "Ended" }), tx.STATUS_LABEL);
check("statusText says In progress and Ended, and Starts 18:00 for an upcoming event", tx.statusText("ongoing", {}) === "In progress" && tx.statusText("ended", {}) === "Ended" && /^Starts /.test(tx.statusText("upcoming", { startsAt: NOW + H })));

console.log("\n# The status rule on the host's rows (no check-in)");
const ev = (o) => ({ startsAt: null, endsAt: null, endedAt: null, ...o });
const cases = [
  ["started and not over", ev({ startsAt: NOW - H, endsAt: NOW + H }), "ongoing"],
  ["starts later", ev({ startsAt: NOW + 2 * H, endsAt: NOW + 4 * H }), "upcoming"],
  ["end time passed", ev({ startsAt: NOW - 5 * H, endsAt: NOW - 2 * H }), "ended"],
  ["End event pressed while it is on", ev({ startsAt: NOW - H, endsAt: NOW + H, endedAt: NOW - 60e3 }), "ended"],
  ["no end time, started 2 hours ago", ev({ startsAt: NOW - 2 * H }), "ongoing"],
  ["no end time, started a day ago", ev({ startsAt: NOW - 24 * H }), "ended"],
  ["no start and no end is upcoming until it is ended", ev({}), "upcoming"],
  ["no start, ended by the host", ev({ endedAt: NOW - H }), "ended"],
];
for (const [name, e, want] of cases) check(`${name}: ${want}`, st.statusOf(e) === want, st.statusOf(e));
{
  const ahead = clockAt(NOW + 3 * H);
  const e = ev({ startsAt: NOW + 2 * H, endsAt: NOW + 4 * H });
  check("a wrong clock on this device changes nothing: the server's time decides", ahead.statusOf(e) === "ongoing" && st.statusOf(e) === "upcoming");
}

console.log("\n# The order of both lists");
{
  const list = [
    ev({ id: "end-old", startsAt: NOW - 50 * H, endsAt: NOW - 48 * H, checkedInAt: NOW - 50 * H }),
    ev({ id: "up-late", startsAt: NOW + 30 * H, endsAt: NOW + 32 * H, checkedInAt: NOW - H }),
    ev({ id: "live-a", startsAt: NOW - 2 * H, endsAt: NOW + 2 * H, checkedInAt: NOW - 90 * 60e3 }),
    ev({ id: "end-new", startsAt: NOW - 10 * H, endsAt: NOW - 8 * H, checkedInAt: NOW - 10 * H }),
    ev({ id: "up-soon", startsAt: NOW + 2 * H, endsAt: NOW + 4 * H, checkedInAt: NOW - 30 * 60e3 }),
    ev({ id: "live-b", startsAt: NOW - H, endsAt: NOW + 5 * H, checkedInAt: NOW - 30 * 60e3 }),
  ];
  const rows = list.map((e) => ({ e, status: st.statusOf(e) }));
  const ids = (a) => a.map((r) => r.e.id).join();
  const attendee = groupByStatus(rows, (e) => e.checkedInAt);
  check("attendee: In progress holds only live events, latest check-in first", ids(attendee.ongoing) === "live-b,live-a", ids(attendee.ongoing));
  check("attendee: Upcoming is soonest first", ids(attendee.upcoming) === "up-soon,up-late", ids(attendee.upcoming));
  check("attendee: Ended is newest attended first", ids(attendee.ended) === "end-new,end-old", ids(attendee.ended));
  const host = groupByStatus(rows, (e) => e.startsAt);
  check("host: In progress, Upcoming (soonest first), Ended (newest first)", ids(host.ongoing) === "live-b,live-a" && ids(host.upcoming) === "up-soon,up-late" && ids(host.ended) === "end-new,end-old", [ids(host.ongoing), ids(host.upcoming), ids(host.ended)]);
  check("every event is in exactly one group", host.ongoing.length + host.upcoming.length + host.ended.length === list.length);
  const g = groupByStatus([{ e: ev({ id: "x" }), status: "upcoming" }, { e: ev({ id: "y", startsAt: NOW + H }), status: "upcoming" }], (e) => e.startsAt);
  check("an upcoming event with no start time sorts last, not first", ids(g.upcoming) === "y,x", ids(g.upcoming));
  check("an empty list gives three empty groups", Object.values(groupByStatus([], (e) => e.startsAt)).every((a) => a.length === 0));
}

console.log("\n# The host list comes from the real Worker, with the server's clock");
{
  const T = await makeEnv();
  const { client, env } = T;
  const host = client({ ip: "10.68.0.1", site: "host" });
  const info = await becomeHost(host, { kind: "company", name: "Status Co" });
  env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 20, 0, ?, ?)").run("cr-68", info.org.json.id, "test", Date.now());
  const t = Date.now();
  const mk = async (body) => {
    const r = await host.post("/api/host/events", body);
    if (r.status !== 201) throw new Error(r.text);
    return r.json;
  };
  const live = await mk({ name: "On now", startsAt: t - H, endsAt: t + H });
  const soon = await mk({ name: "Starts later", startsAt: t + 3 * H, endsAt: t + 5 * H });
  const old = await mk({ name: "Over", startsAt: t - 30 * H, endsAt: t - 28 * H });
  const stopped = await mk({ name: "Stopped early", startsAt: t - H, endsAt: t + 4 * H });
  await host.post(`/api/host/events/${stopped.id}/end`, {});
  const me = (await host.get("/api/host/me")).json;
  check("the response carries the server's time", Math.abs(me.now - Date.now()) < 60e3, me.now);
  const byId = (id) => me.events.find((e) => e.id === id);
  check("each event carries endedAt (null until the host ends it), with start and end as before", me.events.every((e) => "endedAt" in e && "startsAt" in e && "endsAt" in e) && byId(stopped.id).endedAt > 0 && byId(live.id).endedAt === null && byId(stopped.id).ended === true);
  const c = clockAt(me.now);
  const g = groupByStatus(me.events.map((e) => ({ e, status: c.statusOf(e) })), (e) => e.startsAt);
  check("a host with an ended, an in-progress and an upcoming event sees In progress, Upcoming, Ended with the right events", g.ongoing.map((r) => r.e.id).join() === live.id && g.upcoming.map((r) => r.e.id).join() === soon.id && g.ended.map((r) => r.e.id).sort().join() === [stopped.id, old.id].sort().join(), [g.ongoing.length, g.upcoming.length, g.ended.length]);
  check("the events added to the response say nothing about people", !/attendee|people|email/i.test(JSON.stringify(me.events)));
}

console.log("\n# Source guards: both lists, the words, no Ongoing");
const chipSrc = read("src/components/EventStatusChip.vue");
{
  const events = read("src/views/Events.vue"), dash = read("src/views/HostDashboard.vue");
  check("the Events tab and the host dashboard use the one clock, the one ordering and the one chip", [events, dash].every((s) => /useEventClock/.test(s) && /groupByStatus/.test(s) && /<EventStatusChip/.test(s)));
  check("the clock the pages use calls the same rule", /statusOf: \(ev\) => statusAt\(ev, tick\.value \+ skew\.value\)/.test(read("src/lib/eventlive.js")));
  check("the host dashboard feeds the clock the server's time", /setServerNow\(d\.now\)/.test(dash));
  check("the host dashboard works out each status with statusOf, not the old ended flag", /statusOf\(e\)/.test(dash) && !/e\.ended\s*\?/.test(dash));
  check("the host rows say Live, Open and Report", dash.includes('ongoing: "Live ›", upcoming: "Open ›", ended: "Report ›"'));
  check("both lists have In progress first, then Upcoming, then Ended or Past events", /title: "In progress"[\s\S]*title: "Upcoming"/.test(events) && /title: "In progress"[\s\S]*title: "Upcoming"[\s\S]*title: "Ended"/.test(dash) && events.indexOf("events-past") > events.indexOf('v-for="g in live"'));
  check("an upcoming row keeps its start time beside the chip", events.includes("status === 'upcoming'") && events.includes("statusText(status, e)"));
  check("the chip has no animation and no hard-coded colour", !/animation|transition|@keyframes/.test(chipSrc) && !/#[0-9a-f]{3,8}\b/i.test(chipSrc.slice(chipSrc.indexOf("<style"))));
  check("the words file imports only the shared status rule", (read("src/lib/eventtext.js").match(/^import .*$/gm) || []).join() === `import { eventStatus } from "./eventstatus.js";`);
  check("no entry file imports the new code (it stays in the lazy app and host chunks)", ["src/main.js", "src/App.vue", "src/router/index.js", "src/lib/store.js", "src/lib/api.js"].every((f) => !/EventStatusChip|eventlive/.test(read(f))));
  const files = [];
  const walk = (u, rel) => {
    for (const e of readdirSync(u, { withFileTypes: true })) {
      if (e.isDirectory()) walk(new URL(e.name + "/", u), rel + e.name + "/");
      else if (/\.(vue|js|html)$/.test(e.name)) files.push(rel + e.name);
    }
  };
  walk(new URL("../src/", import.meta.url), "src/");
  walk(new URL("../worker/", import.meta.url), "worker/");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const stray = files.filter((f) => /Ongoing/.test(strip(read(f))));
  check("the word Ongoing (capital O, as a person would read it) is in no source file outside comments", stray.length === 0, stray);
}

console.log("\n# Chip contrast: 4.5:1 on every surface in Light, Dark and Midnight (from the tokens)");
{
  const css = read("src/styles/main.css");
  const block = (sel) => {
    const i = css.indexOf(sel + " {");
    return css.slice(i, css.indexOf("}", i));
  };
  const tok = (b, n) => b.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  const light = block(":root");
  const night = block(':root:is([data-theme="night"], [data-theme="midnight"])');
  const mid = block(':root[data-theme="midnight"]');
  const themes = {
    Light: (n) => tok(light, n),
    Dark: (n) => tok(night, n) || tok(light, n),
    Midnight: (n) => tok(mid, n) || tok(night, n) || tok(light, n),
  };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  check("In progress and Upcoming text is --strap-deep, Ended is --graphite, the dot is --strap", /\.status-chip\.ongoing, \.status-chip\.upcoming \{ color: var\(--strap-deep\); \}/.test(chipSrc) && /\.status-chip\.ended \{ color: var\(--graphite\); \}/.test(chipSrc) && /\.status-dot \{[^}]*background: var\(--strap\)/.test(chipSrc));
  for (const [name, t] of Object.entries(themes)) {
    for (const surface of ["paper", "paper-raised"]) {
      for (const [word, tk] of [["In progress", "strap-deep"], ["Upcoming", "strap-deep"], ["Ended", "graphite"]]) {
        const r = ratio(t(tk), t(surface));
        check(`${name}: ${word} (${tk} ${t(tk)}) on ${surface} ${t(surface)} is ${r.toFixed(2)}:1`, r >= 4.5, r);
      }
    }
    const dot = ratio(t("strap"), t("paper-raised"));
    check(`${name}: the In progress dot is at least 3:1 on the surface (${dot.toFixed(2)}), and the word beside it carries the meaning`, dot >= 3, dot);
  }
}
summary();
