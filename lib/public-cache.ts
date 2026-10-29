// Only public school data uses shared caching. Account responses must never use this policy.
export const PUBLIC_DATA_HEADERS = {
  "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
};
export const ERROR_HEADERS = { "Cache-Control": "no-store" };
