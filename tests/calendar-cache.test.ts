import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarRange, dashboardRange, schoolYearRange, validDateKey } from "../lib/calendar-range";
import { isCalendarPayload, readCalendarSnapshot, saveCalendarSnapshot, type CalendarPayload } from "../lib/calendar-client";
import { PUBLIC_DATA_HEADERS, ERROR_HEADERS } from "../lib/public-cache";

const now = new Date("2026-10-29T20:00:00Z");
const payload: CalendarPayload = {
  ...schoolYearRange(now), source: "live", fetchedAt: now.toISOString(),
  days: [{ key: "2026-10-29", label: "B Schedule", events: [], periods: [
    { title: "Period 7", start: "2026-10-29T18:15:00Z", end: "2026-10-29T19:10:00Z" },
  ], extras: [] }],
};
function device() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test("dashboard requests use one shared 14-day Hawaii week window", () => {
  assert.deepEqual(dashboardRange(now), { from: "2026-10-26", to: "2026-11-08" });
  assert.deepEqual(dashboardRange(new Date("2026-11-02T05:00:00Z")), dashboardRange(now));
  assert.deepEqual(dashboardRange(new Date("2026-11-02T10:00:00Z")), { from: "2026-11-02", to: "2026-11-15" });
});

test("range query defaults to the school year and accepts real leap dates", () => {
  assert.deepEqual(calendarRange(new URLSearchParams(), now), schoolYearRange(now));
  assert.equal(validDateKey("2028-02-29"), true);
  assert.deepEqual(calendarRange(new URLSearchParams("from=2026-10-26&to=2026-11-08"), now), dashboardRange(now));
});

test("bad dates, reversed ranges, duplicate parameters and oversized windows fail", () => {
  for (const query of ["from=2026-02-30", "from=garbage", "from=", "from=2026-11-08&to=2026-10-26", "from=2026-10-26&from=2026-10-27", "from=2025-01-01&to=2027-01-01"]) {
    assert.throws(() => calendarRange(new URLSearchParams(query), now));
  }
});

test("full-year cache can restore a smaller dashboard during network failure", () => {
  const storage = device();
  saveCalendarSnapshot(storage, payload, true);
  const saved = readCalendarSnapshot(storage, dashboardRange(now));
  assert.equal(saved?.source, "saved");
  assert.equal(saved?.days[0].periods[0].title, "Period 7");
  assert.equal(saved?.fetchedAt, payload.fetchedAt);
  assert.equal(readCalendarSnapshot(storage, { from: "2027-07-01", to: "2028-06-30" }), null);
});

test("short caches cannot claim full-year coverage and malformed saved data is ignored", () => {
  const storage = device();
  saveCalendarSnapshot(storage, { ...payload, ...dashboardRange(now) }, false);
  assert.equal(readCalendarSnapshot(storage, schoolYearRange(now)), null);
  storage.setItem("iobot-calendar-v1-window", "not json");
  assert.equal(readCalendarSnapshot(storage, dashboardRange(now)), null);
  assert.equal(isCalendarPayload({ ...payload, days: [{ ...payload.days[0], periods: [{ title: "Period 7", start: "broken", end: "broken" }] }] }), false);
});

test("unavailable or full browser storage does not break fetching", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
  assert.doesNotThrow(() => saveCalendarSnapshot(blocked, payload, true));
  assert.equal(readCalendarSnapshot(blocked, dashboardRange(now)), null);
});

test("only successful public data gets the CDN policy; errors remain uncacheable", () => {
  assert.equal(PUBLIC_DATA_HEADERS["Cache-Control"], "public, s-maxage=600, stale-while-revalidate=86400");
  assert.equal(ERROR_HEADERS["Cache-Control"], "no-store");
});
