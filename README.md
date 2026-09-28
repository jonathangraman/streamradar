# StreamRadar

Streaming discovery at https://streamradarjg.vercel.app/.

## Run and test

Use Node 22 or newer. No npm dependencies are required.

1. Copy `.env.example` to `.env.local` and set `TMDB_READ_TOKEN` and `MDBLIST_API_KEY`.
2. Run `npm start` and open http://127.0.0.1:8765/.
3. Run `npm test` for identity, storage, dates, provider mapping, escaping, calendar, proxy and service-worker regressions.

Never commit `.env.local`. The public app calls same-origin Vercel functions; paid/quota-bearing provider credentials are not shipped to browsers. `legacy-config.js` contains the old **public anonymous** Supabase key for a narrowly scoped, read-only import of this browser's existing device records. It is not a user authentication credential.

## Deployment requirements — complete before merging

This update introduces `/api/tmdb` and `/api/ratings` Vercel Node functions. Add `TMDB_READ_TOKEN` and `MDBLIST_API_KEY` to the intended Vercel project's **Preview and Production** environments. Deploy with the Other/static framework preset, no custom build command, and repository root as the project root. Missing values intentionally return a helpful 503 instead of exposing a fallback credential.

Rotate previously public TMDB/MDBList credentials through their owner accounts, put the replacements into Vercel, and redeploy. Removing them from current source does not revoke credentials in Git history. The app does not use an Anthropic key or a paid model anymore; the obsolete browser-stored key is cleared on upgrade. If such a key was previously used, its owner should rotate it as well.

Preview checks: home, search `Ocean's Eleven`, save/rate/reload, actor/back navigation, `John Mulaney: Baby J` stand-up tag, Paramount+ movies and series, optional score failure, keyboard navigation, and mobile/desktop layouts. Then verify `/manifest.json`, `/sw.js`, both icon URLs, and an update from the previous worker. Physical iOS/Android installation and notification/calendar handling still need device checks.

## Intentional reliability changes

- Search stays in normal document layout beneath a visible input. Hidden views use `hidden` and `inert`.
- Detail backdrops have bounded responsive dimensions. Cards and ratings are real keyboard-operable buttons; external content is escaped, never inline JavaScript.
- A title is identified by both media type and TMDB ID. Ratings and recommendations never use array indexes or fabricated IDs.
- Library changes commit to `sr_library_v2` locally before success is shown. Export/import provides a portable backup. A device's old Supabase records are recovered on a best-effort, read-only basis; failed imports are visible and retryable. Old local keys and remote records are not deleted. Ambiguous legacy numeric ratings and invalid `0`/`rec_*` title IDs are not guessed into new records.
- **Cloud writes are disabled.** The old device-ID/anonymous-key scheme does not establish authenticated row ownership. This prevents new writes through that scheme; it does not change or certify existing deployed RLS policies. New saves remain on the current browser. Do not clear browser data without exporting a backup.
- For You uses canonical TMDB related-title results seeded by 4–5-star ratings. This replaces the retired Claude model and user-key flow, avoids paid requests, and does not claim to be AI or to know current streaming availability without checking offers.
- Calendar downloads replace unreliable tab timers. Importing the file into a calendar is required for a reminder; dates are original release or episode dates, not streaming arrival promises.

## Data integrations and limitations

Streaming providers are not called directly. Availability comes from TMDB's JustWatch data, with region and subscription/free/ads/rent/buy distinctions. Service IDs are resolved from the current regional provider catalog by service name rather than a stale hand-maintained numeric list. Apple TV Store and third-party add-on channels are not conflated with a direct base subscription.

On September 28, 2026, the old Paramount+ ID `531` returned only 4 movie and 2 TV results. The current US catalog lists Premium `2303` and Essential `2616`; the new mapping selects these automatically and returned 1,140 movie and 738 TV results in the follow-up check. Prime, Netflix, Disney/Hulu, Peacock, Apple TV and HBO Max queries also returned HTTP 200. HTTP success does not guarantee every offer is current or every title is covered.

IMDb, Rotten Tomatoes (critic/audience) and Metacritic scores are supplied by **MDBList**, not direct APIs to those sites. Representative movie and series requests returned these scores. Displayed retrieval times describe retrieval from the aggregator, not independent verification at the rating site. Null/invalid scores are omitted. A ratings/provider failure never blocks primary title details.

Stand-up is identified by TMDB keyword `9716` (stand-up comedy), matching keyword text, or explicit stand-up/comedy-special wording in a title. The Stand-up filter uses the keyword in discovery and supports pagination. Ordinary Comedy + TV Movie genres do not qualify. Labels may be absent when upstream metadata is incomplete. Title detail retrieves keywords, and those keywords persist with saved titles.

Local in-memory metadata is reused for five minutes. Vercel caches successful catalog requests for 15 minutes and scores for one hour, with short stale-while-revalidate windows. These are cache windows, not freshness guarantees for upstream sources. Personal data is not service-worker cached or sent to the rating services.

## Remaining backend work

Before restoring cloud sync, inspect Supabase table grants and RLS using the owner dashboard. Use authenticated user identities (including Supabase anonymous Auth if appropriate), policies tied to `auth.uid()`, and unique `(user_id, media_type, tmdb_id)` keys. Test every operation with two distinct users. Query filters and random browser IDs are not authorization. Back up existing tables before any migration; do not tighten legacy access until needed user data has a recovery path.

Set provider-appropriate Vercel rate limits and quota alerts. The proxies accept only allowlisted read endpoints and parameters, but public endpoints remain callable; server-side secret storage alone does not prevent quota abuse.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Availability is provided by JustWatch via TMDB. Critic scores are provided by MDBList. The in-app About page explains data origins and limitations.
