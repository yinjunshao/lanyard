// F08: the date maths behind the pickers (src/lib/dates.js), run in Node with no Vue.
// The zone is fixed to Europe/London before any Date is built, so the clock-change
// checks do not depend on where the machine is. Assumption: the owner and their
// hosts are in the UK, so the browser's zone is Europe/London.
process.env.TZ = "Europe/London";
import { check, summary } from "./harness.mjs";
const {
  addDays, addMonths, cmpDay, clampDay, daysInMonth, defaultEnd, formatDay, formatDayLong, formatMonth, formatTime,
  isLeap, isoOf, lastSunday, monthGrid, msOf, parseHm, parseIso, parseTime, roundUp, splitMs, timeSteps, weekday, weekdayNames,
} = await import("../src/lib/dates.js");
const { fromLocalInput, toLocalInput } = await import("../src/lib/time.js");

console.log("\n# The test zone took effect");
check("1 July is BST (UTC+1)", new Date(2026, 6, 1, 12).getTimezoneOffset() === -60);
check("1 January is GMT (UTC+0)", new Date(2026, 0, 1, 12).getTimezoneOffset() === 0);

console.log("\n# Month lengths and leap years");
check("31-day months", [1, 3, 5, 7, 8, 10, 12].every((m) => daysInMonth(2026, m) === 31));
check("30-day months", [4, 6, 9, 11].every((m) => daysInMonth(2026, m) === 30));
check("February 2026 has 28 days", daysInMonth(2026, 2) === 28);
check("February 2024 has 29 days", daysInMonth(2024, 2) === 29);
check("2000 is a leap year, 1900 and 2100 are not", isLeap(2000) && !isLeap(1900) && !isLeap(2100));
check("29 Feb 2028 + 1 year-of-days lands on 28 Feb 2029", cmpDay(addMonths({ y: 2028, m: 2, d: 29 }, 12), { y: 2029, m: 2, d: 28 }) === 0);
check("31 Jan + 1 month is the last day of February", cmpDay(addMonths({ y: 2026, m: 1, d: 31 }, 1), { y: 2026, m: 2, d: 28 }) === 0);
check("addMonths steps back over a year end", cmpDay(addMonths({ y: 2026, m: 1, d: 15 }, -2), { y: 2025, m: 11, d: 15 }) === 0);
check("addDays crosses a month and a year", cmpDay(addDays({ y: 2026, m: 12, d: 31 }, 1), { y: 2027, m: 1, d: 1 }) === 0 && cmpDay(addDays({ y: 2024, m: 2, d: 28 }, 1), { y: 2024, m: 2, d: 29 }) === 0);

console.log("\n# Weeks start on Monday");
check("4 Nov 2026 is a Wednesday (index 2)", weekday(2026, 11, 4) === 2);
check("1 Jan 2024 is a Monday (index 0), 7 Jan a Sunday (6)", weekday(2024, 1, 1) === 0 && weekday(2024, 1, 7) === 6);
const grid = monthGrid(2026, 11);
check("the grid is always six weeks of seven", grid.length === 6 && grid.every((r) => r.length === 7));
check("Nov 2026 starts on Sunday, so the first row begins on Mon 26 Oct", cmpDay(grid[0][0], { y: 2026, m: 10, d: 26 }) === 0 && grid[0][6].d === 1 && grid[0][6].inMonth);
check("only November days are marked inMonth, and there are 30", grid.flat().filter((c) => c.inMonth).length === 30);
check("Feb 2027 starts on a Monday, so the grid starts on 1 Feb", cmpDay(monthGrid(2027, 2)[0][0], { y: 2027, m: 2, d: 1 }) === 0);
check("column headers run Mon to Sun", weekdayNames().join(",") === "Mon,Tue,Wed,Thu,Fri,Sat,Sun");

console.log("\n# Display");
check("formatDay gives 'Wed 4 Nov 2026'", formatDay({ y: 2026, m: 11, d: 4 }) === "Wed 4 Nov 2026");
check("formatDayLong spells it out", formatDayLong({ y: 2026, m: 11, d: 4 }) === "Wednesday 4 November 2026");
check("formatMonth gives 'November 2026'", formatMonth(2026, 11) === "November 2026");
check("iso round trip", isoOf({ y: 2026, m: 3, d: 9 }) === "2026-03-09" && cmpDay(parseIso("2026-03-09"), { y: 2026, m: 3, d: 9 }) === 0);
check("parseIso rejects 31 Feb and rubbish", parseIso("2026-02-31") === null && parseIso("nope") === null && parseIso("") === null);
check("clampDay respects min and max", cmpDay(clampDay({ y: 2026, m: 1, d: 1 }, { y: 2026, m: 2, d: 1 }, null), { y: 2026, m: 2, d: 1 }) === 0 && cmpDay(clampDay({ y: 2026, m: 5, d: 1 }, null, { y: 2026, m: 2, d: 1 }), { y: 2026, m: 2, d: 1 }) === 0);

console.log("\n# Typed times");
const t = (s) => parseTime(s);
check("18:30", t("18:30") === "18:30");
check("18.30", t("18.30") === "18:30");
check("1830", t("1830") === "18:30");
check("6.30pm", t("6.30pm") === "18:30");
check("6:30 PM", t("6:30 PM") === "18:30");
check("6pm", t("6pm") === "18:00");
check("9", t("9") === "09:00");
check("630 (three digits) is 06:30", t("630") === "06:30");
check("12am is 00:00 and 12pm is 12:00", t("12am") === "00:00" && t("12pm") === "12:00" && t("12:15am") === "00:15");
check("25:00, 7:75, 13pm and words are rejected", t("25:00") === null && t("7:75") === null && t("13pm") === null && t("soon") === null && t("") === null);
check("parseHm accepts only HH:mm", parseHm("07:05").h === 7 && parseHm("7:5") === null && parseHm("24:00") === null);
const steps = timeSteps();
check("96 steps of 15 minutes from 00:00 to 23:45", steps.length === 96 && steps[0] === "00:00" && steps[1] === "00:15" && steps[95] === "23:45");
check("roundUp goes to the next quarter hour and wraps past midnight", roundUp("18:07") === "18:15" && roundUp("18:15") === "18:15" && roundUp("23:50") === "00:00");

console.log("\n# Clocks change: last Sunday of March and October");
check("last Sundays: 2024 (31 Mar, 27 Oct), 2025 (30 Mar, 26 Oct), 2026 (29 Mar, 25 Oct)",
  lastSunday(2024, 3) === 31 && lastSunday(2024, 10) === 27 && lastSunday(2025, 3) === 30 && lastSunday(2025, 10) === 26 &&
  lastSunday(2026, 3) === 29 && lastSunday(2026, 10) === 25);
check("the zone really changes on those days", new Date(2026, 2, 29, 12).getTimezoneOffset() === -60 && new Date(2026, 2, 28, 12).getTimezoneOffset() === 0 &&
  new Date(2026, 9, 25, 12).getTimezoneOffset() === 0 && new Date(2026, 9, 24, 12).getTimezoneOffset() === -60);

// Every quarter hour on the Saturday, Sunday and Monday round-trips (day + time -> ms -> day + time),
// except the hour that does not exist in spring (01:00-01:59 on 29 Mar), which moves to 02:xx.
function roundTrip(y, m, d0, gapDay, gapHours) {
  const bad = [];
  let count = 0;
  for (let k = -1; k <= 1; k++) {
    const day = addDays({ y, m, d: d0 }, k);
    for (const hm of timeSteps()) {
      const inGap = cmpDay(day, { y, m, d: gapDay }) === 0 && gapHours.includes(hm.slice(0, 2));
      if (inGap) continue;
      count++;
      const back = splitMs(msOf(day, hm));
      if (cmpDay(back.day, day) !== 0 || back.time !== hm) bad.push(isoOf(day) + " " + hm + " -> " + isoOf(back.day) + " " + back.time);
    }
  }
  return { bad, count };
}
const spring = roundTrip(2026, 3, 29, 29, ["01"]);
check(`March: all ${spring.count} quarter hours survive (except the 01:xx that does not exist)` , spring.bad.length === 0, spring.bad.slice(0, 3).join("; "));
const autumn = roundTrip(2026, 10, 25, 25, []);
check(`October: all ${autumn.count} quarter hours survive`, autumn.bad.length === 0, autumn.bad.slice(0, 3).join("; "));
check("a time that does not exist (01:30 on 29 Mar 2026) becomes 02:30 BST", splitMs(msOf({ y: 2026, m: 3, d: 29 }, "01:30")).time === "02:30");
check("a time that happens twice (01:30 on 25 Oct 2026) is the first one, BST", msOf({ y: 2026, m: 10, d: 25 }, "01:30") === Date.UTC(2026, 9, 25, 0, 30));
const second = Date.UTC(2026, 9, 25, 1, 30); // 01:30 GMT, the second 01:30
check("an untouched stored time is never changed: the picker only emits when the host edits", splitMs(second).time === "01:30" && second !== msOf({ y: 2026, m: 10, d: 25 }, "01:30"));
check("the existing datetime-local helpers agree across both weekends",
  [Date.UTC(2026, 2, 29, 0, 30), Date.UTC(2026, 2, 29, 1, 30), Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 26, 12, 0)].every((ms) => fromLocalInput(toLocalInput(ms)) === ms));

console.log("\n# End time defaults to start + 2 hours (elapsed)");
check("19:00 start gives 21:00", splitMs(defaultEnd(msOf({ y: 2026, m: 11, d: 10 }, "19:00"))).time === "21:00");
check("00:30 GMT on the spring day gives 03:30 BST (two real hours)", splitMs(defaultEnd(msOf({ y: 2026, m: 3, d: 29 }, "00:30"))).time === "03:30");
check("23:00 on 24 Oct gives 01:00 BST on the 25th", (() => { const e = splitMs(defaultEnd(msOf({ y: 2026, m: 10, d: 24 }, "23:00"))); return e.day.d === 25 && e.time === "01:00"; })());
check("an event across the autumn change really lasts 3 hours of clock face", (() => { const s = msOf({ y: 2026, m: 10, d: 25 }, "00:00"); const e = msOf({ y: 2026, m: 10, d: 25 }, "02:00"); return (e - s) === 3 * 3600 * 1000; })());
check("formatTime pads", formatTime(7, 5) === "07:05");

summary();
