# StreamRadar

Streaming discovery at https://streamradarjg.vercel.app/.

## Run and test

Use Node 22 or newer. No npm dependencies are required.

1. Copy `.env.example` to `.env.local` and set `TMDB_READ_TOKEN` and `MDBLIST_API_KEY`.
2. Run `npm start` and open http://127.0.0.1:8765/.
3. Run `npm ci`, `npm run build`, then `npm test` for identity, storage, dates, provider mapping, escaping, calendar, proxy and service-worker regressions.

Never commit `.env.local`. The public app calls same-origin Vercel functions; paid/quota-bearing provider credentials are not shipped to browsers. `legacy-config.js` contains the old **public anonymous** Supabase key for a narrowly scoped, read-only import of this browser's existing device records. It is not a user authentication credential.

## Deployment requirements — complete before merging

This update introduces `/api/tmdb` and `/api/ratings` Vercel Node functions. Add `TMDB_READ_TOKEN` and `MDBLIST_API_KEY` to the intended Vercel project's **Preview and Production** environments. Deploy with the Other/static framework preset, no custom build command, and repository root as the project root. Missing values intentionally return a helpful 503 instead of exposing a fallback credential.

Rotate previously public TMDB/MDBList credentials through their owner accounts, put the replacements into Vercel, and redeploy. Removing them from current source does not revoke credentials in Git history. The app does not use an Anthropic key or a paid model anymore; the obsolete browser-stored key is cleared on upgrade. If such a key was previously used, its owner should rotate it as well.

Preview checks: home, search `Ocean's Eleven`, save/rate/reload, actor/back navigation, `John Mulaney: Baby J` stand-up tag, Paramount+ movies and series, optional score failure, keyboard navigation, and mobile/desktop layouts. Then verify `/manifest.json`, `/sw.js`, both icon URLs, and an update from the previous worker. Physical iOS/Android installation and notification/calendar handling still need device checks.

## Intentional reliability changes

- Search stays in normal document layout beneath a visible input. Hidden views use `hidden` and `inert`.
- Detail backdrops have bounded responsive dimensions. Cards and ratings are real keyboard-operable buttons; external content is escaped, never inline JavaScript.
- A title is identified by both media type and TMDB ID. Ratings and recommendations never use array indexes or fabricated IDs.
- Guest library changes commit to `sr_library_v2` locally before success is shown; signed-in changes use an account-scoped snapshot and pending sync queue. Export/import provides a portable backup. A device's old Supabase records are recovered on a best-effort, read-only basis; failed imports are visible and retryable. Old local keys and remote records are not deleted. Ambiguous legacy numeric ratings and invalid `0`/`rec_*` title IDs are not guessed into new records.
- **Private account sync:** email/password accounts sync watchlist, Seen It, ratings, and dismissed title keys to `library_entries`, with owner-only RLS. Guest saves stay in `sr_library_v2`; account snapshots and pending field patches use `sr_account_v1_<user-id>`. Browser data is imported explicitly from Account; backup import also works while signed in. The old device tables are used only for read-only guest recovery.
- For You combines canonical TMDB related-title results seeded by weighted 4–5-star ratings and unrated watchlist interest with US streaming discoveries matching the selected type/genre. Refresh prefers candidates not in the previous batch. Add to watchlist saves directly; Not interested stores canonical title keys in the local library and backup, excludes them after reload/import/refresh, and preserves movie/TV identity. Old backups without this field remain compatible. Indie films use keyword 281237; TV horror/thriller/romance use verified keywords because those are not native TMDB TV genres. Metadata coverage is incomplete. This replaces the retired Claude model and user-key flow and avoids paid AI requests.
- Calendar downloads replace unreliable tab timers. Importing the file into a calendar is required for a reminder; dates are original release or episode dates, not streaming arrival promises.

## Data integrations and limitations

Home's Show → Movies means narrative movies: exclude Documentary genre 99 and Stand-up Comedy keyword 9716 in discovery, then check title details for documentary genres and stand-up keywords/titles before display. All titles retains all categories; Documentary and Stand-up retain their dedicated filters. This applies to every service, Watch Now, Coming Soon and Theaters. For You's independent type/genre selectors retain their existing meaning (for example, Movies + Documentary).

Discovery, Coming Soon, Theaters, search, actor filmographies and For You display only titles whose TMDB original language is English (`en`). Translated titles, English subtitles or dubs do not qualify. Unknown-language results are excluded. Existing saved library records are retained. Discovery filters at the source, and other lists filter their returned results; search pages may therefore contain fewer matches.

Watch Now discovery uses US availability. Show includes All titles, Movies, Series, Documentaries and Stand-up. It combines recent-airing series candidates with premiere-sorted discovery results, hydrates episode/season metadata and ranks loaded titles by latest aired episode/season or original movie release. Loading more expands the candidate set and re-sorts it; this is not an exhaustive global sort by service arrival date. Search retains relevance ranking; watchlists and actor credits are newest first.

Coming Soon combines movies and series (or the selected Show category) over the next 90 days. Service-specific TV results use verified original-network affiliations; Apple movies use Apple Studios (194232). Other service movie results require provider metadata, which is sparse before release. All titles is a general upcoming-premiere list. These are original premiere dates, not a comprehensive schedule of streaming arrivals or a promise of future US availability. Dates can change.

HBO Max collections combine Food Network (143) or Discovery (64) original-network metadata with current HBO Max US subscription offers. NEW EPISODE identifies an aired episode within seven days and includes its weekday; NEXT EPISODE identifies a future episode within seven days. SEASON PREMIERE uses returning-season premieres in the past 90 days. Episode/season availability may differ from the series-level subscription offer.

Theaters separates recent US wide theatrical releases (previous 42 days, popular first) from upcoming English theatrical releases (next 90 days; popular candidates sorted by verified US date, excluding originals more than 180 days old). It is not a location-specific cinema inventory. Movie details and the theater header link to the verified official Cinemark Legacy and XD schedule, 7201 Central Expy, Suite 100, Plano TX 75025. Showtimes open externally; no stale times, unverified movie deep links or seat inventory are stored in the app.

MGM+ and Starz resolve their direct US subscriptions from the live provider catalog. Paramount+ / Showtime is one filter covering Paramount's Premium and Essential tiers; individual title offers determine the required plan. DOC labels accept both discovery and detail genre formats. SEASON PREMIERE means a returning season premiered within the previous 90 days, excluding specials, first seasons and future dates; it does not guarantee that season is included in the service's current offer. Catalog badges load progressively from title metadata.

Streaming providers are not called directly. Availability comes from TMDB's JustWatch data, with region and subscription/free/ads/rent/buy distinctions. Service IDs are resolved from the current regional provider catalog by service name rather than a stale hand-maintained numeric list. Apple TV Store and third-party add-on channels are not conflated with a direct base subscription.

On September 28, 2026, the old Paramount+ ID `531` returned only 4 movie and 2 TV results. The current US catalog lists Premium `2303` and Essential `2616`; the new mapping selects these automatically and returned 1,140 movie and 738 TV results in the follow-up check. Prime, Netflix, Disney/Hulu, Peacock, Apple TV and HBO Max queries also returned HTTP 200. HTTP success does not guarantee every offer is current or every title is covered.

IMDb, Rotten Tomatoes (critic/audience) and Metacritic scores are supplied by **MDBList**, not direct APIs to those sites. Representative movie and series requests returned these scores. Displayed retrieval times describe retrieval from the aggregator, not independent verification at the rating site. Null/invalid scores are omitted. A ratings/provider failure never blocks primary title details.

Stand-up is identified by TMDB keyword `9716` (stand-up comedy), matching keyword text, or explicit stand-up/comedy-special wording in a title. The Stand-up filter uses the keyword in discovery and supports pagination. Ordinary Comedy + TV Movie genres do not qualify. Labels may be absent when upstream metadata is incomplete. Title detail retrieves keywords, and those keywords persist with saved titles.

Local in-memory metadata is reused for five minutes. Vercel caches successful catalog requests for 15 minutes and scores for one hour, with short stale-while-revalidate windows. These are cache windows, not freshness guarantees for upstream sources. Personal data is not service-worker cached or sent to the rating services.

## Remaining backend work

Private account data uses authenticated user identities, policies tied to `auth.uid()`, and unique `(user_id, media_type, tmdb_id)` keys. Query filters and random browser IDs are not authorization. Existing legacy table policies have not been changed or certified by this release; preserve their recovery path before any separate tightening or migration.

Set provider-appropriate Vercel rate limits and quota alerts. The proxies accept only allowlisted read endpoints and parameters, but public endpoints remain callable; server-side secret storage alone does not prevent quota abuse.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Availability is provided by JustWatch via TMDB. Critic scores are provided by MDBList. The in-app About page explains data origins and limitations.

Cards place NEW SEASON on the poster. Only one episode pill appears: the next scheduled episode within seven days (including today), otherwise a recently aired episode within seven days. Both include a weekday and calendar date to distinguish successive weeks.


### October 9 accuracy fixes
Service catalogs suppress broadcast season/episode labels and latest-airing ranking for series not affiliated with that service's original networks. Labels describe premiere/air dates, never season-level streaming availability. Series-level TMDB offers cannot verify individual seasons. Netflix's Below (285322) is injected through a dated, temporary official-title correction (Netflix Tudum and netflix.com/title/81652677); review after November 8. Upcoming discovery retains successful categories when another category fails and reports incomplete results. Current Netflix network discovery returned 15 dated upcoming series during verification. Upcoming movie provider metadata remains sparse; this is not a complete streaming-arrival calendar.

Netflix Coming Soon movies discover future movie candidates without current subscription-offer requirements, then retain only titles with an official Netflix title homepage. Animals (1236045) has a confirmed October 9, 2026 Netflix release from the official Netflix Media Center; the dated schedule injects it before release and a temporary offer correction applies from release through November 8. Other candidates use original movie dates, which may differ from Netflix arrival dates. This bounded candidate discovery is not exhaustive.


### Originals, reality and larger catalog batches
All supported streaming services, including All, default to Originals only for movies and series. The Catalog dropdown offers Full catalog. Series use network affiliations (Prime excludes pre-2013 series later syndicated on the network); movies require original first-digital-release evidence, with official service title pages accepted for unreleased candidates. Originals classification is conservative and incomplete; availability alone never proves originality. HBO Food Network/Discovery collections retain their explicit network scope. Theaters keeps its theatrical filters.

Reality and talk shows are hidden by default; Reality & talk in the Show dropdown browses those series. Originals/Full catalog remains a separate choice. TMDB TV genres Reality (10764, including competitions) and Talk (10767) drive this filter; documentaries and stand-up are unaffected unless also classified in those genres. Both preferences persist on the browser. The Show selector remains unchanged when switching Watch now/Coming soon.

Each initial load and Load more action scans up to six discovery pages to find at least 36 new visible, unique matching titles, stopping at the upstream end or a partial failure. Some filters may yield fewer. Hidden watched titles and already-loaded titles do not count toward the target. Pagination resumes after the last consumed page; it never skips unconsumed matches to enforce a strict display limit. `test/catalog.test.js` exercises the application loading function with sparse-page, watched-title, exhausted-page and full-catalog fixtures.

## Private accounts and deployment

- `npm run build` bundles the pinned Supabase SDK and copies only client assets to `public/`. Vercel serves that directory and keeps the existing `/api` functions. No server-side credential is bundled. `auth-client.js` contains only the public project URL and publishable key.
- Apply tracked `supabase/migrations/` in order to the intended project before enabling the account UI. These additive migrations have been applied to StreamRadar (`gdfuisnznbzwhskhxlcp`). Existing device tables/data are untouched.
- In Supabase Authentication, configure the Site URL to the actual production origin and allow that origin as an email redirect. Add exact preview/local origins only when needed for testing. Keep email confirmation enabled. Configure custom SMTP with a verified sender domain; the default Supabase sender is not suitable for friends/public signup. Confirm signup and reset emails on the production domain before merging/releasing.
- Auth callbacks are consumed by the SDK before hash routing. Recovery links open the password-update form. The SDK refreshes sessions automatically; no service-role key or admin-auth credential is used in the browser.
- Cloud sync queues only changed fields per canonical `(media_type, tmdb_id)` record, retries on connection/focus and every 30 seconds while visible, and paginates reads. Independent title/field changes from separate devices merge; the last successful sync wins when the same field is edited on multiple devices. Removals remain false-valued tombstones. Do not report a cloud failure as a successful sync. Pending edits remain account-scoped after sign-out and retry on the next sign-in. Synced offline caches remain on the device; use trusted devices and export backups before clearing browser storage.
- Account switching restores a separate guest library and guards in-flight recommendation responses and sync batches against writing to a different account. Browser imports add missing titles, keep existing account ratings, and retain the original guest copy. Streaming-service choices and the last 20 AI batches now sync privately; other browsing filters and ZIP codes stay device-local. See ACCOUNT_FEATURES.md.
- Personal suggestions give 5-star ratings more weight than 4-star ratings, reserve seeds for unrated watchlist items, lower matches to poorly rated genres, and explain rating/watchlist sources. Watched, saved, and dismissed titles are excluded from new personal picks; US streaming offers and selected filters are still verified.
- `test/library-sync.test.js` checks queued/offline saves, removals, import precedence, account changes, storage failures and taste weighting. `test/database.test.js` applies the exact migrations in isolated PostgreSQL (PGlite), switches between two user roles, and verifies RLS, grants, ownership changes, invalid ratings, and anonymous denial. It creates no production auth users.

### Roam Together authentication comparison

Roam Together uses Supabase email/password signup and Google OAuth with `openid email profile`; email confirmation is enabled, and custom SMTP is disabled. Its existing confirmed email account has no recorded confirmation send, so do not infer that arbitrary public email signup is working. StreamRadar now has the matching Google flow, shown only when its public provider settings report Google enabled. Email addresses are normalized to lowercase. StreamRadar’s Site URL was corrected from localhost to https://streamradarjg.vercel.app with explicit owner approval.

To finish Google setup, configure a Google OAuth web client with https://gdfuisnznbzwhskhxlcp.supabase.co/auth/v1/callback as an authorized redirect and enter its credentials directly in StreamRadar Supabase Authentication > Providers > Google. Never copy the secret into chat, source, or logs. Google provider configuration and live Google login have been verified. Existing confirmed email accounts can log in; new Yahoo/other email signup and reset delivery still need verification. No confirmation or ownership protections were disabled.

### Account controls and recommendation history

See [ACCOUNT_FEATURES.md](ACCOUNT_FEATURES.md) for synced services, explicit taste feedback, private AI history, self-deletion and the remaining custom-SMTP dependency.
