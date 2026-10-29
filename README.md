# IoBot

IoBot is a mobile-first campus companion for ʻIolani Upper School students. It combines the official bell schedule, class countdowns, dining menus, a five-day planner, a school-year calendar, and personal class names.

**Live website:** [iobot-five.vercel.app](https://iobot-five.vercel.app/)

## Features

- Official Google Calendar iCalendar data with numbered periods and special blocks.
- Honolulu date handling, current/next block countdowns, and grade-specific chapel reminders.
- Daily Bulletin PDF dining-menu extraction with the bulletin's actual date.
- Today, Week, Calendar, and Settings views with a single responsive navigation menu.
- Class names, grade, appearance, and time-format preferences saved on the device.
- CDN-cached public APIs, small dashboard requests, and a saved calendar response for network failures.

## Run locally

Use Node.js 24 and pnpm 11.25.0 (the version recorded in `package.json`). With Corepack available, run `corepack enable` and `corepack prepare pnpm@11.25.0 --activate`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:4173](http://localhost:4173). Before deployment:

```sh
pnpm lint
pnpm test
pnpm build
```

`lint` currently runs TypeScript checking rather than a separate style linter. `pnpm start` serves the production build on port 4173. No secret credentials are needed for the public school feeds or device storage.

## Official sources and parsing

The server reads the [official Bell Schedule with Periods iCalendar feed](https://calendar.google.com/calendar/ical/iolani.org_ds7482aj4fh4uortauf8vuquso%40group.calendar.google.com/public/basic.ics), the primary source listed in the contest packet. `lib/calendar.ts` uses `ical.js` to read events, timezones, recurrence rules, changed occurrences, cancellations, and multi-day breaks. It groups dates in `Pacific/Honolulu`, selects the July–June school year, removes duplicate entries, and preserves official start/end times.

Only exact titles `Period 1` through `Period 8` count as numbered classes. Timed entries such as Lunch, Break, and Homeroom/Chapel remain separate timeline blocks. The app does not infer bell times from a rotation letter or bulletin period order.

`lib/data.ts` fetches the [official Daily Bulletin PDF](https://www.iolani.org/uploaded/PDF/DAILY_BULLETIN.pdf). `pdf-parse` extracts its text, and `lib/food.ts` reads the date and the Weinberg Snack Bar, One Team Wagon, and ASC Dining Hall menus. Missing/unreadable content triggers fallback handling. The client compares the bulletin's date with today's Honolulu date, so a cached old menu is not labeled as today's menu.

## API endpoints

| Endpoint | Behavior |
| --- | --- |
| `GET /api/calendar?from=2026-10-26&to=2026-11-08` | Returns days in the inclusive date range. Dates must be valid `YYYY-MM-DD` values, ordered correctly, with at most 366 days. Invalid/duplicate bounds return an uncacheable 400. |
| `GET /api/calendar` | Returns the current July–June school year, cached separately from range URLs. |
| `GET /api/food` | Returns the latest parsed menu, date, source, and fetch timestamp. |
| `GET /api/classes` | Returns an uncacheable 401 because account synchronization is not configured. |

The parsed source currently covers the current school year; requesting dates outside it does not fetch a different year's calendar. An omitted date bound defaults to the corresponding school-year bound.

## Three layers of caching

### 1. Vercel CDN

Successful calendar and food responses set:

```http
Cache-Control: public, s-maxage=600, stale-while-revalidate=86400
```

The shared CDN may serve a response for 10 minutes without invoking the function again. Once stale, it may serve that old response while revalidating for up to 24 hours. That availability tradeoff means the newest upstream change is not guaranteed to appear immediately. Each distinct URL/range has its own cache entry, and cache hits depend on edge location. Invalid requests and 503 errors remain `no-store`; personal/account responses remain `private, no-store`.

The route handlers do not export `dynamic = 'force-dynamic'`. Their internal upstream fetches use `no-store` to retrieve the official source when needed; that is separate from caching the public API response at the CDN. The browser calendar request also avoids a `no-store` fetch override.

To check the deployment, run each identical GET twice without a cache-busting query or `Cache-Control: no-cache` request header:

```sh
curl -sS -D - -o /dev/null 'https://iobot-five.vercel.app/api/calendar?from=2026-10-26&to=2026-11-08'
curl -sS -D - -o /dev/null 'https://iobot-five.vercel.app/api/calendar?from=2026-10-26&to=2026-11-08'
curl -sS -D - -o /dev/null 'https://iobot-five.vercel.app/api/food'
curl -sS -D - -o /dev/null 'https://iobot-five.vercel.app/api/food'
```

Look for `x-vercel-cache: HIT`; the first request may be `MISS`, and a stale entry may report `STALE`. The `age` header can also show reuse. Vercel can consume/strip the shared-cache directives before sending the ordinary Cache-Control header to the browser, so the visible header need not reproduce the original server string. In browser developer tools, keep **Disable cache** unchecked and inspect the actual GET in Network. Avoid a hard refresh while testing CDN reuse. See [Vercel cache headers](https://vercel.com/docs/caching/cache-control-headers).

### 2. Server data cache and bundled fallback

The server shares successful source results and in-flight requests within a Node instance for 15 minutes. Separate Vercel instances have separate memory caches. This layer and the CDN have independent expiration times, so 10 minutes of CDN freshness is not a promise of 10-minute source freshness.

Official-source requests time out after 10 seconds. On a slow cold load, a bundled snapshot can be returned after a 700 ms fallback timer while `after()` keeps the live request registered. Successful work refreshes that instance's cache for subsequent requests; it does not push a new response into an already-open tab. On source failures the server uses a previous result or a timestamped bundled snapshot. Responses include their source and `fetchedAt`; Settings displays calendar fetch time and saved/cached status.

Refresh the bundled snapshots from official sources before a release when appropriate:

```sh
pnpm snapshot
```

Snapshots are fallback data, not a replacement for live fetching. They must be rebuilt/redeployed to update the bundled copies.

### 3. Browser calendar snapshot

Today and Week request a shared Monday-through-following-Sunday window of 14 days. Calendar fetches the full-year URL only when opened. Refreshes load the full year while Calendar is active and the smaller range otherwise. Responses merge by date so a short request cannot erase full-year data that arrived concurrently.

The client saves the last window and full-year responses under two versioned `localStorage` keys. It validates saved dates/events and coverage before restoring them, shows usable saved data while the network refresh runs, and keeps that data when a request fails. A full-year snapshot can satisfy a smaller request, but a short snapshot cannot claim full-year coverage. Corrupt, blocked, or full storage does not break successful network loading. Reconnecting triggers a refresh. Snapshots may be old; Settings retains the original calendar fetch timestamp and reports a failed refresh.

This improves calendar availability after the page has loaded or can be reopened from the browser cache. It is not a complete offline-installable app: there is no service worker to guarantee that the HTML/JavaScript loads without a network connection.

## Project structure

```text
app/page.tsx                 Views, countdowns, personalization, calendar loading
app/globals.css              Responsive layout, themes, animations
app/api/calendar/route.ts     Range filtering and public calendar cache policy
app/api/food/route.ts         Public menu response and cache policy
app/api/classes/route.ts      Unconfigured account endpoint, never shared-cached
lib/calendar.ts              iCalendar event parsing
lib/calendar-range.ts        Honolulu date windows and query validation
lib/calendar-client.ts       Response validation and browser snapshot helpers
lib/food.ts                  Bulletin text parsing
lib/data.ts                  Fetching, request sharing, memory cache, fallbacks
lib/public-cache.ts          Public success and error response headers
components/ui/               Reusable controls
scripts/snapshot.ts          Refresh bundled official fallback data
public/                      Icons, penguin artwork, web-app metadata
```

`tests/` covers exact numbered-period filtering, Hawaii and school-year boundaries, recurring-event changes/cancellations, multi-day holidays, bulletin extraction, range validation, cache coverage, and invalid/unavailable browser storage.

## Personal data and current limitations

Class names and preferences stay in the current browser. The app has no working ChatGPT sign-in, Google SSO, Firebase, D1, or cross-device account synchronization. Do not present those services as implemented. Do not publicly cache an account or personal-data response if authentication is added later.

## Production toolbar

In Vercel, open **Project → Settings → General → Vercel Toolbar → Production → Off**. Preview can keep its separate setting. This project does not import `@vercel/toolbar`; platform injection must be disabled in project settings. Verify production HTML contains no `vercel.live` feedback script. A browser extension can also inject toolbar UI, which is separate from scripts in server-returned HTML. See [Vercel's toolbar settings](https://vercel.com/docs/vercel-toolbar/managing-toolbar).

## Public source repository

A deployed website or a document containing source code does not satisfy a public-repository requirement. Publish this checkout to the intended GitHub account, include this README and the lockfile, and submit the public repository URL along with the live site. `.gitignore` excludes credentials, `.env` files, Vercel account/project state, installed packages, and build output. Do not upload `.vercel/` or personal credentials.

## AI-use disclosure

The initial interface and stylesheet were supplied by the project owner. OpenAI Codex helped restore the Next.js project structure, implement official-source parsers and server routes, add device personalization and caching, write tests and documentation, and prepare Vercel deployments. AI also helped draft architecture explanations and a presentation script. The team must review, test, and understand the submitted code and adapt this disclosure to accurately reflect its own work and use of AI.

## Open-source credits

The project uses Next.js, React, TypeScript, Tailwind CSS, Radix UI, Lucide, ical.js, pdf-parse, and the other dependencies recorded in `package.json` and `pnpm-lock.yaml`. Their source and license metadata are available through the packages' published metadata and installed LICENSE files. Official school calendar and bulletin content remains attributed to ʻIolani School.
