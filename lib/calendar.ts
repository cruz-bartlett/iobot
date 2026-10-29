import ICAL from "ical.js";
export const CALENDAR_URL = "https://calendar.google.com/calendar/ical/iolani.org_ds7482aj4fh4uortauf8vuquso%40group.calendar.google.com/public/basic.ics";
export const HAWAII_TZ = "Pacific/Honolulu";
export function dateKey(date: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: HAWAII_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
export function periodNumber(title: string) { const match = title.trim().match(/^Period\s+([1-8])$/i); return match ? Number(match[1]) : null; }
export type CalendarEvent = { title: string; start: string; end: string };
export type CalendarDay = { key: string; label: string; events: CalendarEvent[]; periods: CalendarEvent[]; extras: CalendarEvent[] };
// Parse the actual event times; never infer bell times from the rotation label.
export function parseCalendar(text: string, from: string, to: string) {
 const component = new ICAL.Component(ICAL.parse(text));
 for (const zone of component.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(new ICAL.Timezone(zone));
 const grouped = new Map<string, CalendarDay>();
 const addOne = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
  if (event.component.getFirstPropertyValue("status") === "CANCELLED") return;
  const key = start.isDate ? start.toString() : dateKey(start.toJSDate());
  if (key < from || key > to) return;
  const title = event.summary?.trim() || "School event";
  const day = grouped.get(key) ?? { key, label: "School day", events: [], periods: [], extras: [] };
  const item = { title, start: start.isDate ? `${key}T00:00:00-10:00` : start.toJSDate().toISOString(), end: end.isDate ? `${end.toString()}T00:00:00-10:00` : end.toJSDate().toISOString() };
  if (start.isDate) { day.events.push(item); if (/schedule/i.test(title)) day.label = title; else if (day.label === "School day") day.label = title; }
  else if (end.compare(start) > 0) { if (periodNumber(title) !== null) day.periods.push(item); else day.extras.push(item); }
  grouped.set(key,day);
 };
 const add = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
  if (!start.isDate) { addOne(event,start,end); return; }
  // iCalendar all-day DTEND is exclusive. Include each day of a multi-day break.
  const day=start.clone(); let count=0;
  do { const next=day.clone();next.adjust(1,0,0,0);addOne(event,day,next);day.adjust(1,0,0,0); } while(day.compare(end)<0 && count++<3660);
 };
 const events = component.getAllSubcomponents("vevent").map(c => new ICAL.Event(c));
 const overrides = events.filter(e => e.isRecurrenceException());
 for (const event of events) {
  if (event.isRecurrenceException()) continue;
  if (!event.isRecurring()) { add(event,event.startDate,event.endDate); continue; }
  for (const override of overrides.filter(e => e.uid === event.uid)) event.relateException(override);
  const iterator = event.iterator(); let occurrence; let count = 0;
  while ((occurrence = iterator.next()) && count++ < 20000) {
   if (dateKey(occurrence.toJSDate()) > to) break;
   const detail = event.getOccurrenceDetails(occurrence);
   add(detail.item,detail.startDate,detail.endDate);
  }
 }
 for (const day of grouped.values()) {
  const unique = (items: CalendarEvent[]) => [...new Map(items.map(e => [`${e.title}|${e.start}|${e.end}`,e])).values()].sort((a,b) => a.start.localeCompare(b.start));
  day.periods=unique(day.periods); day.extras=unique(day.extras); day.events=unique(day.events);
 }
 return [...grouped.values()].sort((a,b) => a.key.localeCompare(b.key));
}
export function schoolYearRange(now = new Date()) { const key=dateKey(now); const year=Number(key.slice(0,4))-(Number(key.slice(5,7))<7?1:0); return { from: `${year}-07-01`, to: `${year+1}-06-30` }; }
