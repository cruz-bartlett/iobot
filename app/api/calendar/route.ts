import { calendarData } from "@/lib/data";
import { calendarRange } from "@/lib/calendar-range";
import type { CalendarPayload } from "@/lib/calendar-client";
import { PUBLIC_DATA_HEADERS, ERROR_HEADERS } from "@/lib/public-cache";
export const runtime="nodejs";
export const maxDuration=30;
export async function GET(request: Request) {
  let range;
  try { range = calendarRange(new URL(request.url).searchParams); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400, headers: ERROR_HEADERS }); }
  try {
    const payload = await calendarData() as CalendarPayload;
    return Response.json({ ...payload, ...range, days: payload.days.filter(day => day.key >= range.from && day.key <= range.to) }, { headers: PUBLIC_DATA_HEADERS });
  } catch {
    return Response.json({ error: "Official schedule unavailable" }, { status: 503, headers: ERROR_HEADERS });
  }
}
