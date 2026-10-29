export type DateRange = { from: string; to: string };

export function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Honolulu", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function validDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function shiftDate(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function schoolYearRange(now = new Date()): DateRange {
  const key = dateKey(now);
  const year = Number(key.slice(0, 4)) - (Number(key.slice(5, 7)) < 7 ? 1 : 0);
  return { from: `${year}-07-01`, to: `${year + 1}-06-30` };
}

// A shared Monday-to-Sunday URL keeps dashboard requests identical across students.
export function dashboardRange(now = new Date()): DateRange {
  const key = dateKey(now);
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
  const from = shiftDate(key, weekday === 0 ? -6 : 1 - weekday);
  return { from, to: shiftDate(from, 13) };
}

export function calendarRange(params: URLSearchParams, now = new Date()): DateRange {
  const year = schoolYearRange(now);
  if (params.getAll("from").length > 1 || params.getAll("to").length > 1) {
    throw new Error("Supply from and to only once.");
  }
  const from = params.get("from") ?? year.from;
  const to = params.get("to") ?? year.to;
  if (!validDateKey(from) || !validDateKey(to)) throw new Error("Use real dates in YYYY-MM-DD format.");
  if (from > to) throw new Error("from must be on or before to.");
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 365) {
    throw new Error("Request at most 366 days.");
  }
  return { from, to };
}
