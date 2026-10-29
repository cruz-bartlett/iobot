import { after } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CALENDAR_URL, dateKey, parseCalendar, schoolYearRange } from "./calendar";
import { BULLETIN_URL, parseFood } from "./food";
// One shared promise coalesces concurrent requests; failed refreshes preserve the last good data.
type Entry = { at: number; value: unknown; pending?: Promise<unknown> };
const globalCache = globalThis as typeof globalThis & { iobotCache?: Map<string,Entry> };
const cache = globalCache.iobotCache ??= new Map();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
 const previous=cache.get(key);
 if(previous && Date.now()-previous.at < 900000) return previous.value as T;
 if(previous?.pending) return previous.pending as Promise<T>;
 const entry=previous ?? {at:0,value:null};
 const pending=load().then(value=>{cache.set(key,{at:Date.now(),value});return value;}).finally(()=>{entry.pending=undefined;});
 entry.pending=pending;cache.set(key,entry);return pending;
}
async function getText(url: string) { const response=await fetch(url,{signal:AbortSignal.timeout(10000),cache:"no-store"});if(!response.ok)throw new Error(`Source returned ${response.status}`);return response.text(); }
async function fastFallback<T>(work: Promise<T>, name: string): Promise<T> {
 // Keep refreshes alive after returning a snapshot in Vercel serverless functions.
 after(() => work.then(() => undefined, () => undefined));
 let timer: ReturnType<typeof setTimeout> | undefined;
 const fallback = new Promise<T>((resolve,reject)=>{ timer=setTimeout(()=>{ snapshot(name).then(value=>resolve({...value, ...(name === "food" ? {current: value.dateKey === dateKey(new Date())} : {}), source:"saved"})).catch(reject); },700); });
 try { return await Promise.race([work,fallback]); } finally { clearTimeout(timer); }
}
async function snapshot(name: string) { return JSON.parse(await readFile(join(process.cwd(),"data",`${name}.json`),"utf8")); }
export async function calendarData() {
 const range=schoolYearRange(); const key=`calendar-${range.from}`;
 try { return await fastFallback(cached(key,async()=>{const days=parseCalendar(await getText(CALENDAR_URL),range.from,range.to);if(!days.length)throw new Error("No events in this school year");return {days,source:"live",fetchedAt:new Date().toISOString(),sourceUrl:CALENDAR_URL};}),"calendar"); }
 catch { const saved=cache.get(key)?.value ?? await snapshot("calendar"); return {...saved as object,source:"saved"}; }
}
export async function foodData() {
 const today=dateKey(new Date());
 try { return await fastFallback(cached(`food-${today}`,async()=>{
  const response=await fetch(BULLETIN_URL,{signal:AbortSignal.timeout(10000),cache:"no-store"});if(!response.ok)throw new Error("Bulletin unavailable");
  const {default:parse}=await import("pdf-parse/lib/pdf-parse.js");
  const {text}=await parse(Buffer.from(await response.arrayBuffer()));
  return {...parseFood(text,today),source:"live",fetchedAt:new Date().toISOString()};
 }),"food"); } catch {const saved=(cache.get(`food-${today}`)?.value ?? await snapshot("food")) as Record<string,unknown>;return {...saved,current:saved.dateKey===today,source:"saved"};}
}
