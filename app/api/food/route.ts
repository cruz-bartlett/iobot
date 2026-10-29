import { foodData } from "@/lib/data";
import { PUBLIC_DATA_HEADERS, ERROR_HEADERS } from "@/lib/public-cache";
export const runtime="nodejs";
export const maxDuration=30;
export async function GET() {try{return Response.json(await foodData(),{headers:PUBLIC_DATA_HEADERS});}catch{return Response.json({error:"Bulletin unavailable"},{status:503,headers:ERROR_HEADERS});}}
