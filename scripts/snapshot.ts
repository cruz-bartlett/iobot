import { writeFile, mkdir } from "node:fs/promises";
import { CALENDAR_URL, parseCalendar, schoolYearRange, dateKey } from "../lib/calendar";
import { parseFood, BULLETIN_URL } from "../lib/food";
import parse from "pdf-parse/lib/pdf-parse.js";
async function main() {
 const [calendar,bulletin]=await Promise.all([fetch(CALENDAR_URL),fetch(BULLETIN_URL)]);
 if(!calendar.ok || !bulletin.ok) throw new Error("Official sources unavailable; snapshots were not changed.");
 const range=schoolYearRange();
 const days=parseCalendar(await calendar.text(),range.from,range.to);
 if(!days.length) throw new Error("No calendar days parsed; snapshots were not changed.");
 const {text}=await parse(Buffer.from(await bulletin.arrayBuffer()));
 const food=parseFood(text,dateKey(new Date()));
 await mkdir("data",{recursive:true});
 await writeFile("data/calendar.json",JSON.stringify({days,source:"saved",fetchedAt:new Date().toISOString(),sourceUrl:CALENDAR_URL}));
 await writeFile("data/food.json",JSON.stringify({...food,source:"saved",fetchedAt:new Date().toISOString()}));
 console.log(`Saved ${days.length} official calendar days and bulletin menu.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
