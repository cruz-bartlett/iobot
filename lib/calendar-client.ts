import { type DateRange, validDateKey } from "./calendar-range";

type TimedEvent = { title: string; start: string; end: string };
export type CalendarPayload = {
  days: Array<{ key: string; label: string; events: Array<{ title: string }>; periods: TimedEvent[]; extras?: TimedEvent[] }>;
  from: string;
  to: string;
  source?: "live" | "saved";
  fetchedAt?: string;
  sourceUrl?: string;
};

type StorageAccess = Pick<Storage, "getItem" | "setItem">;
const WINDOW_KEY = "iobot-calendar-v1-window";
const YEAR_KEY = "iobot-calendar-v1-year";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const titled = (value: unknown) => record(value) && typeof value.title === "string";
const timed = (value: unknown) => record(value) && titled(value) &&
  typeof value.start === "string" && Number.isFinite(Date.parse(value.start)) &&
  typeof value.end === "string" && Number.isFinite(Date.parse(value.end)) && Date.parse(value.end) > Date.parse(value.start);

export function isCalendarPayload(value: unknown): value is CalendarPayload {
  if (!record(value) || !validDateKey(value.from) || !validDateKey(value.to) || value.from > value.to ||
    !Array.isArray(value.days) || value.days.length > 366) return false;
  const from = value.from, to = value.to;
  if (value.fetchedAt !== undefined && (typeof value.fetchedAt !== "string" || !Number.isFinite(Date.parse(value.fetchedAt)))) return false;
  return value.days.every(day => record(day) && validDateKey(day.key) && day.key >= from && day.key <= to &&
    typeof day.label === "string" && Array.isArray(day.events) && day.events.every(titled) &&
    Array.isArray(day.periods) && day.periods.every(timed) &&
    (day.extras === undefined || (Array.isArray(day.extras) && day.extras.every(timed))));
}

export function readCalendarSnapshot(storage: StorageAccess, range: DateRange): CalendarPayload | null {
  for (const key of [WINDOW_KEY, YEAR_KEY]) {
    try {
      const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
      if (isCalendarPayload(value) && value.from <= range.from && value.to >= range.to) {
        return { ...value, ...range, source: "saved", days: value.days.filter(day => day.key >= range.from && day.key <= range.to) };
      }
    } catch { /* Corrupt or disabled browser storage must not block the app. */ }
  }
  return null;
}

export function saveCalendarSnapshot(storage: StorageAccess, payload: CalendarPayload, fullYear: boolean) {
  try { storage.setItem(fullYear ? YEAR_KEY : WINDOW_KEY, JSON.stringify(payload)); }
  catch { /* Storage quota/private browsing failures do not invalidate a good network response. */ }
}
