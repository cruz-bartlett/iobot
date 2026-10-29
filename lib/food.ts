export const BULLETIN_URL = "https://www.iolani.org/uploaded/PDF/DAILY_BULLETIN.pdf";
export function parseFood(text: string, today: string) {
 const normalized = text.replace(/\r/g, "");
 const match = normalized.match(/DAILY BULLETIN:\s*(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
 if (!match) throw new Error("Bulletin date could not be read");
 const month = new Date(`${match[1]} 1, 2000 UTC`).getUTCMonth()+1;
 const dateKey = `${match[3]}-${String(month).padStart(2,"0")}-${match[2].padStart(2,"0")}`;
 const header = normalized.split(/TODAY.?S SCHEDULE/i)[0];
 const stations = ["Weinberg Snack Bar", "One Team Wagon", "ASC Dining Hall"];
 const items = stations.flatMap(station => { const start = header.indexOf(station+":"); if(start<0) return []; const rest = header.slice(start+station.length+1); const next = rest.search(/(?:Weinberg Snack Bar|One Team Wagon|ASC Dining Hall):|--{3,}/); const meal=(next<0?rest:rest.slice(0,next)).replace(/\s+/g," ").trim(); return meal ? [{station,meal}] : []; });
 if (!items.length) throw new Error("Dining menu could not be read");
 const order = header.match(/Periods:\s*([1-8](?:\s*,\s*[1-8])*)/i)?.[1] ?? "";
 return { date: `${match[1]} ${match[2]}, ${match[3]}`, dateKey, current: dateKey===today, items, scheduleLabel: header.match(/US SCHEDULE:\s*([^\n]+?)(?:\s+Periods:|\n)/i)?.[1]?.trim() ?? null, periodOrder: order.split(",").map(Number).filter(n=>n>=1&&n<=8), sourceUrl: BULLETIN_URL };
}
