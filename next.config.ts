import type { NextConfig } from "next";
const config: NextConfig = {
 serverExternalPackages: ["pdf-parse"],
 outputFileTracingIncludes: {
  "/api/calendar": ["./data/calendar.json"],
  "/api/food": ["./data/food.json"],
 },
};
export default config;
