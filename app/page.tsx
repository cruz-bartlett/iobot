"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, Coffee, ExternalLink, GraduationCap, LayoutDashboard,
  LogOut, Moon, RefreshCw, Save, Settings2, Sun,
  UserRound, UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { dashboardRange, schoolYearRange } from "@/lib/calendar-range";
import { type CalendarPayload, isCalendarPayload, readCalendarSnapshot, saveCalendarSnapshot } from "@/lib/calendar-client";

const HAWAII_TZ = "Pacific/Honolulu";
type EventItem = { title: string; start: Date; end: Date; allDay: boolean };
type DayData = { key: string; date: Date; events: EventItem[]; periods: EventItem[]; extras: EventItem[]; label: string };
type FoodMenu = { date: string; dateKey: string | null; current: boolean; items: { station: string; meal: string }[]; scheduleLabel: string | null; periodOrder: number[]; sourceUrl: string; todayEvents?: Array<{ time: string; title: string }> };
type SignedInUser = { email: string; displayName: string };

function hawaiiDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: HAWAII_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}
function dateFromKey(key: string) { return new Date(`${key}T12:00:00-10:00`); }
function addDays(date: Date, amount: number) { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + amount); return copy; }
function startOfWeek(date: Date) { const day = new Date(`${hawaiiDateKey(date)}T00:00:00Z`).getUTCDay(); return addDays(date, day === 0 ? -6 : 1 - day); }
function longDate(date: Date) { return new Intl.DateTimeFormat("en-US", { timeZone: HAWAII_TZ, weekday: "long", month: "long", day: "numeric" }).format(date); }
function shortDay(date: Date) { return new Intl.DateTimeFormat("en-US", { timeZone: HAWAII_TZ, weekday: "short" }).format(date); }
function shortMonth(date: Date) { return new Intl.DateTimeFormat("en-US", { timeZone: HAWAII_TZ, month: "short" }).format(date); }
function formatTime(date: Date, use24Hour: boolean) { return new Intl.DateTimeFormat("en-US", { timeZone: HAWAII_TZ, hour: "numeric", minute: "2-digit", hour12: !use24Hour }).format(date); }
function formatCountdown(ms: number) { const total = Math.max(0, Math.floor(ms / 1000)); const hours = Math.floor(total / 3600); const minutes = Math.floor((total % 3600) / 60); const seconds = total % 60; return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`; }
function formatDuration(start: Date, end: Date) { return `${Math.round((end.getTime() - start.getTime()) / 60000)} min`; }
function periodNumber(title: string) { const match = title.trim().match(/^Period\s+([1-8])$/i); return match ? Number(match[1]) : null; }
function periodCount(day?: DayData) { return day?.periods.filter((period) => periodNumber(period.title) !== null).length ?? 0; }
function namedPeriod(title: string, classes: string[]) { const number = periodNumber(title); return number && classes[number - 1]?.trim() ? classes[number - 1].trim() : title; }
function greeting(now: Date) { const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: HAWAII_TZ, hour: "2-digit", hourCycle: "h23" }).format(now)); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function scheduleCode(label: string) { return label.match(/\b(?:ALT\s*)?([A-F])(?:[1-3])?\b/i)?.[1]?.toUpperCase() ?? "—"; }
function daySegments(day: DayData) { return [...day.periods, ...day.extras].sort((a, b) => a.start.getTime() - b.start.getTime()); }
function isHoliday(day?: DayData) { return Boolean(day && !day.periods.length && day.events.some((event) => /holiday|no school|break|closed|day off/i.test(event.title))); }
function dateTone(date: Date, day?: DayData) { return isHoliday(day) ? "holiday" : [0, 6].includes(new Date(`${hawaiiDateKey(date)}T00:00:00Z`).getUTCDay()) ? "weekend" : "weekday"; }
function chapelGrades(label: string) {
  if (!/chapel/i.test(label) || /no chapel/i.test(label)) return [];
  const pair = label.match(/Grs?\.?\s*(7|8|9|10|11|12)\s*&\s*(7|8|9|10|11|12)\s+Chapel/i);
  if (pair) return [pair[1], pair[2]];
  const single = label.match(/Gr(?:ade)?\s*(7|8|9|10|11|12)\s+Chapel/i);
  return single ? [single[1]] : ["7", "8", "9", "10", "11", "12"];
}
function calendarFromPayload(payload: CalendarPayload) {
  const grouped = new Map<string, DayData>();
  for (const day of payload.days) { const date = dateFromKey(day.key); grouped.set(day.key, { key: day.key, date, label: day.label, events: day.events.map((event) => ({ title: event.title, start: date, end: date, allDay: true })), periods: day.periods.map((period) => ({ title: period.title, start: new Date(period.start), end: new Date(period.end), allDay: false })), extras: (day.extras ?? []).map((extra) => ({ title: extra.title, start: new Date(extra.start), end: new Date(extra.end), allDay: false })) }); }
  return grouped;
}
async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 12000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(input, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); } }

function PeriodRows({ day, now, classes, use24Hour, detailed = false }: { day: DayData; now: Date; classes: string[]; use24Hour: boolean; detailed?: boolean }) {
  const segments = daySegments(day);
  if (!segments.length) return <div className="empty-state"><Sun /><h3>{day.label.includes("unavailable") ? "Schedule unavailable" : "No classes scheduled"}</h3><p>{day.events[0]?.title ?? "There is no bell schedule for this day."}</p></div>;
  return <>{segments.map((period, index) => {
    const current = now >= period.start && now < period.end; const done = now >= period.end; const number = periodNumber(period.title); const custom = number ? classes[number - 1]?.trim() : "";
    const extra = number === null;
    return <div className={`period-row period-${number ?? index + 1} ${extra ? "extra-row" : ""} extra-${period.title.toLowerCase().replace(/[^a-z]+/g, "-")} ${current ? "current" : ""} ${done ? "done" : ""}`} key={`${period.title}-${period.start.toISOString()}`}><div className="period-index">{done ? <Check /> : extra ? /lunch/i.test(period.title) ? <UtensilsCrossed /> : /break/i.test(period.title) ? <Coffee /> : <Bell /> : number}</div><div className="period-name"><div className="period-name-label"><strong>{namedPeriod(period.title, classes)}</strong>{custom && <span>Period {number}</span>}</div>{current && <small>Now</small>}</div>{detailed && <span className="duration">{formatDuration(period.start, period.end)}</span>}<time>{formatTime(period.start, use24Hour)} <span>–</span> {formatTime(period.end, use24Hour)}</time></div>;
  })}</>;
}

function DesktopNav() {
  return <TabsList className="desktop-nav" aria-label="Main navigation"><TabsTrigger value="today"><LayoutDashboard />Today</TabsTrigger><TabsTrigger value="week"><BookOpen />Week</TabsTrigger><TabsTrigger value="calendar"><CalendarDays />Calendar</TabsTrigger><TabsTrigger value="settings"><Settings2 />Settings</TabsTrigger></TabsList>;
}

export default function Home() {
  const [now, setNow] = useState(() => new Date("2000-01-01T12:00:00-10:00"));
  const [calendar, setCalendar] = useState<Map<string, DayData>>(new Map());
  const [loading, setLoading] = useState(true); const [live, setLive] = useState(true); const [showInitialLoader, setShowInitialLoader] = useState(false);
  const [food, setFood] = useState<FoodMenu | null>(null); const [foodLoading, setFoodLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("2000-01-01"); const [activeTab, setActiveTab] = useState("today");
  const [classes, setClasses] = useState<string[]>(Array(8).fill("")); const [user, setUser] = useState<SignedInUser | null>(null);
  const [accountLoading, setAccountLoading] = useState(true); const [savingClasses, setSavingClasses] = useState(false); const [classesSaved, setClassesSaved] = useState(false);
  const [dark, setDark] = useState(true); const [use24Hour, setUse24Hour] = useState(false); const [autoRefresh, setAutoRefresh] = useState(true); const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [gradeLevel, setGradeLevel] = useState("");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const dateRailRef = useRef<HTMLDivElement>(null);
  const fullCalendarYearRef = useRef("");
  const calendarRequests = useRef(new Map<string, Promise<void>>());
  const [calendarError, setCalendarError] = useState("");

  const loadCalendar = useCallback(async (quiet = false, fullYear = false) => {
    const range = fullYear ? schoolYearRange() : dashboardRange();
    const url = fullYear ? "/api/calendar" : `/api/calendar?from=${range.from}&to=${range.to}`;
    const existing = calendarRequests.current.get(url);
    if (existing) return existing;
    const apply = (payload: CalendarPayload) => {
      const incoming = calendarFromPayload(payload);
      // A small dashboard response must never erase a concurrently loaded full year.
      setCalendar(previous => new Map([...previous, ...incoming]));
      setLive(payload.source === "live");
      if (payload.fetchedAt) setLastUpdated(new Date(payload.fetchedAt));
      if (fullYear) fullCalendarYearRef.current = range.from;
      setCalendarError("");
    };
    let restored = false;
    try {
      const saved = readCalendarSnapshot(localStorage, range);
      if (saved) { apply(saved); restored = true; if (!quiet) setLoading(false); }
    } catch { /* localStorage itself may be unavailable. */ }
    if (!quiet && !restored) setLoading(true);
    const work = (async () => {
      try {
        // Default fetch caching allows the browser to use Vercel's shared CDN response.
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error("Calendar unavailable");
        const payload: unknown = await response.json();
        if (!isCalendarPayload(payload) || payload.from !== range.from || payload.to !== range.to) throw new Error("Invalid calendar response");
        apply(payload);
        try { saveCalendarSnapshot(localStorage, payload, fullYear); } catch { /* Device storage is optional. */ }
      } catch {
        setLive(false);
        setCalendarError(restored ? "Offline: showing the saved schedule. Last saved data may have changed." : "Calendar refresh failed. Check your connection and try again.");
      } finally { if (!quiet) setLoading(false); }
    })();
    calendarRequests.current.set(url, work);
    try { await work; } finally { calendarRequests.current.delete(url); }
  }, []);
  const loadFood = useCallback(async (quiet = false) => { if (!quiet) setFoodLoading(true); try { const response = await fetchWithTimeout("/api/food"); if (!response.ok) throw new Error(); const menu = await response.json() as FoodMenu; setFood({ ...menu, current: menu.dateKey === hawaiiDateKey(new Date()) }); } catch { /* Keep the last menu visible. */ } finally { if (!quiet) setFoodLoading(false); } }, []);
  const loadAccount = useCallback(async () => { setAccountLoading(true); try { const response = await fetchWithTimeout("/api/classes", { cache: "no-store" }); if (response.status === 401) { setUser(null); return; } if (!response.ok) throw new Error(); const data = await response.json() as { user: SignedInUser; classes: string[] }; setUser(data.user); setClasses(data.classes); } catch { /* Keep current values. */ } finally { setAccountLoading(false); } }, []);
  const saveClasses = async () => { setSavingClasses(true); setClassesSaved(false); setSaveError(""); try { localStorage.setItem("iobot-classes", JSON.stringify(classes)); if (user) { const response = await fetch("/api/classes", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ classes }) }); if (!response.ok) throw new Error("Account sync failed. Your names are saved on this device."); } setClassesSaved(true); window.setTimeout(() => setClassesSaved(false), 2200); } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save class names."); } finally { setSavingClasses(false); } };
  const refreshAll = useCallback(() => { void Promise.all([loadCalendar(false, activeTab === "calendar"), loadFood(), loadAccount()]); }, [loadCalendar, loadFood, loadAccount, activeTab]);
  const openDay = (key: string) => { setSelectedKey(key); setActiveTab("calendar"); };

  useEffect(() => { const hydrationTimer = window.setTimeout(() => { const current = new Date(); setNow(current); setSelectedKey(hawaiiDateKey(current)); const storedDark = localStorage.getItem("iobot-dark"); const stored24 = localStorage.getItem("iobot-24-hour"); const storedRefresh = localStorage.getItem("iobot-auto-refresh"); const storedGrade = localStorage.getItem("iobot-grade"); if (storedDark !== null) setDark(storedDark === "true"); if (stored24 !== null) setUse24Hour(stored24 === "true"); if (storedRefresh !== null) setAutoRefresh(storedRefresh === "true"); if (storedGrade) setGradeLevel(storedGrade); try { const saved = JSON.parse(localStorage.getItem("iobot-classes") ?? "null"); if (Array.isArray(saved) && saved.length === 8 && saved.every(value => typeof value === "string")) setClasses(saved); } catch { /* Ignore invalid device data. */ } setPreferencesReady(true); void Promise.all([loadCalendar(), loadFood(), loadAccount()]); }, 0); return () => window.clearTimeout(hydrationTimer); }, [loadCalendar, loadFood, loadAccount]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!loading || calendar.size > 0) return; const timer = window.setTimeout(() => setShowInitialLoader(true), 350); return () => window.clearTimeout(timer); }, [loading, calendar.size]);
  useEffect(() => { if (!preferencesReady) return; document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem("iobot-dark", String(dark)); }, [dark, preferencesReady]);
  useEffect(() => { if (!preferencesReady) return; localStorage.setItem("iobot-24-hour", String(use24Hour)); }, [use24Hour, preferencesReady]);
  useEffect(() => { if (!preferencesReady) return; if (gradeLevel) localStorage.setItem("iobot-grade", gradeLevel); else localStorage.removeItem("iobot-grade"); }, [gradeLevel, preferencesReady]);
  useEffect(() => { if (!preferencesReady) return; localStorage.setItem("iobot-auto-refresh", String(autoRefresh)); if (!autoRefresh) return; const timer = window.setInterval(() => void Promise.all([loadCalendar(true, activeTab === "calendar"), loadFood(true)]), 900000); return () => window.clearInterval(timer); }, [autoRefresh, loadCalendar, loadFood, preferencesReady, activeTab]);

  const todayKey = hawaiiDateKey(now);
  useEffect(() => {
    const year = schoolYearRange(dateFromKey(todayKey));
    if (activeTab === "calendar" && fullCalendarYearRef.current !== year.from) void loadCalendar(false, true);
  }, [activeTab, loadCalendar, todayKey]);
  useEffect(() => {
    const refresh = () => { void loadCalendar(true, activeTab === "calendar"); void loadFood(true); };
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, [activeTab, loadCalendar, loadFood]);

  const fallbackDay = useMemo<DayData>(() => ({ key: todayKey, date: dateFromKey(todayKey), events: [], periods: [], extras: [], label: loading ? "Loading schedule…" : "Schedule unavailable" }), [todayKey, loading]);
  const today = calendar.get(todayKey) ?? fallbackDay;
  const selected = calendar.get(selectedKey) ?? { key: selectedKey, date: dateFromKey(selectedKey), events: [], periods: [], extras: [], label: loading ? "Loading schedule…" : "Schedule unavailable" };
  const todaySegments = daySegments(today); const currentPeriod = todaySegments.find((period) => now >= period.start && now < period.end); const nextPeriod = todaySegments.find((period) => now < period.start); const completedPeriods = today.periods.filter((period) => now >= period.end).length;
  const schoolProgress = todaySegments.length ? Math.min(100, Math.max(0, currentPeriod ? ((now.getTime() - todaySegments[0].start.getTime()) / (todaySegments.at(-1)!.end.getTime() - todaySegments[0].start.getTime())) * 100 : now >= todaySegments.at(-1)!.end ? 100 : 0)) : 0;
  const status = loading && calendar.size === 0 ? { eyebrow: "Checking the official calendar", title: "Loading your day", detail: "Getting the latest schedule", countdown: "—", progress: 0 } : today.label.includes("unavailable") ? { eyebrow: "Calendar unavailable", title: "Schedule unavailable", detail: "Refresh to check the official calendar", countdown: "—", progress: 0 } : currentPeriod ? { eyebrow: periodNumber(currentPeriod.title) ? "In class now" : "Happening now", title: namedPeriod(currentPeriod.title, classes), detail: `Ends at ${formatTime(currentPeriod.end, use24Hour)}`, countdown: formatCountdown(currentPeriod.end.getTime() - now.getTime()), progress: ((now.getTime() - currentPeriod.start.getTime()) / (currentPeriod.end.getTime() - currentPeriod.start.getTime())) * 100 } : nextPeriod ? { eyebrow: now < todaySegments[0]?.start ? greeting(now) : "Up next", title: namedPeriod(nextPeriod.title, classes), detail: `Starts at ${formatTime(nextPeriod.start, use24Hour)}`, countdown: formatCountdown(nextPeriod.start.getTime() - now.getTime()), progress: 0 } : todaySegments.length ? { eyebrow: "School day complete", title: "You’re all done", detail: `Finished at ${formatTime(todaySegments.at(-1)!.end, use24Hour)}`, countdown: "Done", progress: 100 } : { eyebrow: "Open day", title: "No classes scheduled", detail: today.events[0]?.title ?? "Enjoy the day", countdown: "—", progress: 0 };
  const dateRail = useMemo(() => Array.from({ length: 21 }, (_, index) => addDays(dateFromKey(todayKey), index - 3)), [todayKey]);
  const schoolYearDates = useMemo(() => {
    const year = Number(todayKey.slice(0,4)); const month = Number(todayKey.slice(5,7))-1;
    const start = new Date(`${month >= 6 ? year : year - 1}-07-01T12:00:00-10:00`);
    const end = new Date(`${month >= 6 ? year + 1 : year}-06-30T12:00:00-10:00`);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return Array.from({ length: days }, (_, index) => addDays(start, index));
  }, [todayKey]);
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(startOfWeek(dateFromKey(todayKey)), index)), [todayKey]);
  const todayChapelGrades = chapelGrades(today.label);
  const selectedChapelGrades = chapelGrades(selected.label);

  useEffect(() => {
    if (activeTab !== "calendar") return;
    const timer = window.setTimeout(() => {
      const rail = dateRailRef.current;
      const selectedButton = rail?.querySelector<HTMLElement>(`[data-date="${selectedKey}"]`);
      if (!rail || !selectedButton) return;
      rail.scrollTo({ left: selectedButton.offsetLeft - rail.clientWidth / 2 + selectedButton.clientWidth / 2, behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, selectedKey]);

  useEffect(() => { type ToolDefinition = { name: string; title: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute: (input: unknown) => unknown | Promise<unknown> }; type ModelContext = { registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => void | Promise<void> }; const context = (document as unknown as { modelContext?: ModelContext }).modelContext; if (!context?.registerTool) return; const lifecycle = new AbortController(); void context.registerTool({ name: "read_today_schedule", title: "Read today's schedule", description: "Return today's ʻIolani bell schedule and class times in Hawaii time.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => ({ date: longDate(now), schedule: today.label, periods: today.periods.map((period) => ({ name: namedPeriod(period.title, classes), period: periodNumber(period.title), start: formatTime(period.start, use24Hour), end: formatTime(period.end, use24Hour) })) }) }, { signal: lifecycle.signal }); return () => lifecycle.abort(); }, [today, now, classes, use24Hour]);

  return <main className="app-shell"><div className="ambient ambient-one" /><div className="ambient ambient-two" />
    {showInitialLoader && loading && calendar.size === 0 && <div className="initial-loader" role="status" aria-live="polite"><div className="penguin-track"><span className="speed-line speed-one" /><span className="speed-line speed-two" /><Image src="/iobot-penguin.svg" alt="IoBot penguin running" width={68} height={68} priority /></div><strong>Getting your day ready</strong><p>Syncing the latest ʻIolani schedule…</p></div>}
    <Tabs value={activeTab} onValueChange={setActiveTab} className="app-tabs">
      <TabsContent value="today" className="dashboard-view"><section className="welcome-row"><div className="welcome-copy"><p>{longDate(now)} · Honolulu</p><div className="welcome-title-row"><h1>{greeting(now)}{user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}.</h1><DesktopNav /></div><span>Here’s everything you need for {today.label.toLowerCase()}.</span></div><div className="date-cluster"><div className="letter-badge"><span>Letter day</span><strong>{scheduleCode(today.label)}</strong></div><div className={`day-badge ${dateTone(dateFromKey(todayKey), today)}`}><span>{shortDay(now)}</span><strong>{dateFromKey(todayKey).getUTCDate()}</strong><small>{shortMonth(now)}</small></div></div></section>{todayChapelGrades.length > 0 && (!gradeLevel || todayChapelGrades.includes(gradeLevel)) && <div className="chapel-banner"><BookOpen /><div><strong>{gradeLevel ? "You have chapel today" : `Grades ${todayChapelGrades.join(" & ")} have chapel today`}</strong><span>{gradeLevel ? `Your Grade ${gradeLevel} schedule includes chapel.` : "Choose your grade in Settings for a personal reminder."}</span></div></div>}
        <section className="dashboard-grid"><div className="main-column"><article className="hero-card"><div className="hero-orbit" /><div className="hero-top"><span className="eyebrow"><i />{status.eyebrow}</span><span className="schedule-pill">{today.label}</span></div><div className="hero-content"><div><h2>{status.title}</h2><p>{status.detail}</p></div><div className="timer" aria-label="Time remaining">{status.countdown}</div></div><div className="hero-progress"><span style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }} /></div><div className="hero-footer"><span>{completedPeriods} of {periodCount(today)} periods complete</span><span>{Math.round(schoolProgress)}% through the school day</span></div></article>
          <div className="section-heading"><div><p>Today’s timeline</p><span>{periodCount(today)} numbered periods · Hawaii Standard Time</span></div><button onClick={() => setActiveTab("calendar")}>Full calendar <ArrowRight /></button></div><section className="schedule-card">{loading ? <div className="empty-state"><RefreshCw className="spin" /><p>Loading today’s schedule…</p></div> : <PeriodRows day={today} now={now} classes={classes} use24Hour={use24Hour} detailed />}</section></div>
          <aside className="side-column"><article className="food-card"><div className="card-title"><div><span className="card-kicker">Campus dining</span><h2>Today’s menu</h2></div><span className="title-icon"><UtensilsCrossed /></span></div><p className="card-subtitle">{food?.dateKey === todayKey ? food.date : food ? `Latest bulletin · ${food.date}` : "Daily Bulletin"}</p>{foodLoading ? <div className="food-empty"><RefreshCw className="spin" />Checking the menu…</div> : food ? <div className="food-list">{food.items.map((item, index) => <div key={item.station}><span>{index + 1}</span><div><small>{item.station}</small><strong>{item.meal}</strong></div></div>)}</div> : <div className="food-empty">No menu has been posted.</div>}<a className="card-link" href="https://www.iolani.org/calendar/daily-weekly-bulletin" target="_blank" rel="noreferrer">View official bulletin <ExternalLink /></a></article>
            <article className="coming-card"><div className="card-title"><div><span className="card-kicker">Plan ahead</span><h2>Coming up</h2></div><span className="title-icon"><CalendarDays /></span></div><div className="mini-days">{dateRail.slice(3, 10).map((date) => { const key = hawaiiDateKey(date); const day = calendar.get(key); return <button key={key} onClick={() => openDay(key)} className={`${key === todayKey ? "today" : ""} ${dateTone(date, day)}`}><span>{shortDay(date).slice(0, 1)}</span><strong>{date.getUTCDate()}</strong><i className={periodCount(day) ? "has-school" : ""} /></button>; })}</div><div className="up-next-list">{dateRail.slice(4).filter((date) => calendar.has(hawaiiDateKey(date))).slice(0, 3).map((date) => { const day = calendar.get(hawaiiDateKey(date))!; return <button key={day.key} onClick={() => openDay(day.key)}><span>{shortMonth(date)}<strong>{date.getUTCDate()}</strong></span><div><b>{day.label}</b><small>{periodCount(day) ? `${periodCount(day)} periods` : day.events[0]?.title ?? "No classes"}</small></div><ChevronRight /></button>; })}</div></article>
            </aside></section></TabsContent>
      <TabsContent value="week" className="wide-view"><div className="view-heading"><div><p>Weekly planner</p><h1>Your week at a glance</h1><span>Every day is listed from earliest to latest in Hawaii Standard Time.</span></div><div className="view-actions"><DesktopNav /><Button variant="outline" onClick={() => setActiveTab("today")}>Back to today</Button></div></div><section className="week-grid">{weekDays.map((date) => { const key = hawaiiDateKey(date); const day = calendar.get(key); const isToday = key === todayKey; const segments = day ? daySegments(day) : []; return <article key={key} className={`week-card ${isToday ? "is-today" : ""} ${dateTone(date, day)}`}><button className="week-card-head" onClick={() => openDay(key)}><div><span>{isToday ? "Today" : shortDay(date)}</span><strong>{date.getUTCDate()}</strong><small>{shortMonth(date)}</small></div><div><h2>{day?.label ?? "No school"}</h2><p>{periodCount(day)} classes{day?.extras.length ? ` · ${day.extras.map((extra) => extra.title).join(" · ")}` : ""}</p></div><ChevronRight /></button><div className="week-periods">{segments.length ? segments.map((period) => { const number = periodNumber(period.title); return <div className={`week-period-item ${number ? "class-item" : "extra-item"}`} key={`${period.title}-${period.start.toISOString()}`}><span className={`period-dot ${number ? `p${number}` : "extra-dot"}`} /><strong>{namedPeriod(period.title, classes)}</strong><time>{formatTime(period.start, use24Hour)} <span>–</span> {formatTime(period.end, use24Hour)}</time></div>; }) : <div className="week-empty"><Sun />{day?.events[0]?.title ?? "No classes"}</div>}</div></article>; })}</section></TabsContent>
      <TabsContent value="calendar" className="wide-view"><div className="view-heading"><div><p>School calendar</p><h1>Browse every bell schedule</h1><span>Scroll from July through June to see the complete school year.</span></div><div className="view-actions"><DesktopNav /><Button variant="outline" onClick={() => setSelectedKey(todayKey)}>Jump to today</Button></div></div><div className="date-rail-shell"><Button variant="ghost" size="icon" aria-label="Previous date" onClick={() => setSelectedKey(hawaiiDateKey(addDays(dateFromKey(selectedKey), -1)))}><ChevronLeft /></Button><div className="date-rail" ref={dateRailRef}>{schoolYearDates.map((date) => { const key = hawaiiDateKey(date); const day = calendar.get(key); return <button key={key} data-date={key} onClick={() => setSelectedKey(key)} className={`${selectedKey === key ? "selected" : ""} ${dateTone(date, day)}`}><span>{shortDay(date)}</span><strong>{date.getUTCDate()}</strong><small>{shortMonth(date)}</small><i className={periodCount(day) ? "has-school" : ""} /></button>; })}</div><Button variant="ghost" size="icon" aria-label="Next date" onClick={() => setSelectedKey(hawaiiDateKey(addDays(dateFromKey(selectedKey), 1)))}><ChevronRight /></Button></div><section className={`day-detail ${dateTone(selected.date, selected)}`}><div className="day-detail-title"><div><span>{shortDay(selected.date).toUpperCase()}</span><strong>{selected.date.getUTCDate()}</strong><small>{shortMonth(selected.date)}</small></div><div><p>{longDate(selected.date)} · {scheduleCode(selected.label)} day</p><h2>{selected.label}</h2><span>{periodCount(selected)} numbered periods{selected.extras.length ? ` · ${selected.extras.length} school-day blocks` : ""}</span></div></div>{selectedChapelGrades.length > 0 && (!gradeLevel || selectedChapelGrades.includes(gradeLevel)) && <div className="event-banner chapel-alert"><BookOpen /><span>{gradeLevel ? `You have chapel on this day` : `Grades ${selectedChapelGrades.join(" & ")} have chapel on this day`}</span></div>}{selected.events.filter((event) => !/schedule|chapel/i.test(event.title)).map((event) => <div className="event-banner" key={event.title}><CalendarDays /><span>{event.title}</span></div>)}<div className="detail-periods"><PeriodRows day={selected} now={new Date(0)} classes={classes} use24Hour={use24Hour} detailed /></div></section></TabsContent>
      <TabsContent value="settings" className="settings-view"><div className="view-heading"><div><p>Preferences</p><h1>Make IoBot yours</h1><span>Personalize your schedule, reminders, appearance, and data.</span></div><DesktopNav /></div><section className="account-card"><span className="setting-icon"><UserRound /></span><div>{accountLoading ? <><strong>Checking your account…</strong><p>Your saved schedule will appear shortly.</p></> : user ? <><strong>{user.displayName}</strong><p>{user.email} · Classes sync automatically to this account.</p></> : <><strong>Class names stay on this device</strong><p>Personalize all eight periods below. Account sync is not configured in this local build.</p></>}</div>{user ? <a className="account-action" href="/signout-with-chatgpt?return_to=%2F"><LogOut />Log out</a> : <span className="account-action">Device storage</span>}</section><section className="grade-card"><span className="setting-icon"><GraduationCap /></span><div><strong>Your grade</strong><p>Used only to personalize chapel reminders on this device.</p></div><select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)} aria-label="Your grade level"><option value="">Not selected</option>{[7, 8, 9, 10, 11, 12].map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></section><section className="classes-card"><div className="classes-heading"><div><p>Your schedule</p><h2>Name all eight periods</h2><span>Class names appear everywhere in place of generic period numbers.</span></div><Button onClick={() => void saveClasses()} disabled={savingClasses}><Save />{savingClasses ? "Saving…" : classesSaved ? "Saved" : "Save classes"}</Button></div><div className="classes-grid">{classes.map((className, index) => <label key={index}><span><i className={`period-dot p${index + 1}`} />Period {index + 1}</span><Input value={className} maxLength={60} placeholder={`e.g. ${["English", "Algebra II", "Chemistry", "Hawaiian History", "Spanish", "Computer Science", "Art", "PE"][index]}`} onChange={(event) => { const next = [...classes]; next[index] = event.target.value; setClasses(next); setClassesSaved(false); }}  /></label>)}</div><p className="classes-note" role="status">{saveError || (classesSaved ? "Class names saved on this device." : "Save your class names to keep them on this device.")}</p></section><section className="settings-card"><div className="setting-row"><span className="setting-icon">{dark ? <Moon /> : <Sun />}</span><div><strong>Dark appearance</strong><p>Use the campus-at-night color theme.</p></div><Switch checked={dark} onCheckedChange={setDark} aria-label="Dark appearance" /></div><div className="setting-row"><span className="setting-icon"><Clock3 /></span><div><strong>24-hour time</strong><p>Show 13:05 instead of 1:05 PM.</p></div><Switch checked={use24Hour} onCheckedChange={setUse24Hour} aria-label="24-hour time" /></div><div className="setting-row"><span className="setting-icon"><RefreshCw /></span><div><strong>Automatic updates</strong><p>Refresh official schedules and dining every 15 minutes.</p></div><Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Automatic updates" /></div><div className="setting-row"><span className="setting-icon"><Bell /></span><div><strong>School data</strong><p><span className={`sync-state ${live ? "is-live" : ""}`}><span />{loading || foodLoading ? "Syncing now" : live ? "Official data cached" : "Using saved data"}</span></p>{calendarError && <p role="status">{calendarError}</p>}</div><Button variant="outline" onClick={refreshAll} disabled={loading || foodLoading}>Refresh</Button></div></section><section className="about-card"><span className="brand-mark">io</span><div><strong>IoBot · Your day at ʻIolani</strong><p>Official school calendar and bulletin data, cached for speed. Calendar data fetched {lastUpdated ? `${longDate(lastUpdated)} at ${formatTime(lastUpdated, use24Hour)}` : "not yet"}.</p></div><Button variant="outline" onClick={() => setActiveTab("today")}>Go to Today</Button></section></TabsContent>

    </Tabs></main>;
}
