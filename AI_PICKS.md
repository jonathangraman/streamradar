# Optional AI picks

For You has separate **Refresh picks** and **Get AI picks** actions. AI is opt-in
per refresh and requires a signed-in account with at least three rated/saved titles.
The regular recommendation algorithm remains available on failure or exhaustion.

The browser supplies up to 24 real candidate IDs after applying its existing
type/genre/year/subscription filters. The server verifies the Supabase access
token, reads that owner's library under RLS, and independently loads English,
released, US subscription titles from TMDB. Up to 64 recent saved titles/ratings
and bounded candidate descriptions go to the model; email, user ID, auth tokens
and API credentials do not. The model can only select candidate keys, with short
reasons. Both server and client reject duplicates or unknown selections. Reasons
are escaped as text; streaming information is retained from catalog verification.
Account changes discard in-flight results. Pending library edits must sync first.

## Free-credit rollout

The owner saved `ANTHROPIC_API_KEY` as a Vercel Secret for Production. The
server uses `@ai-sdk/anthropic` directly against Anthropic's official endpoint;
no AI Gateway account, key, credit balance or fallback is used. Add the same
secret to Preview privately if an authenticated preview generation is needed.
The key is read only on the server and is never returned by the status endpoint.

`lib/ai-policy.js` remains deliberately disabled (`verifiedFreeMonth: null`).
Before setting the current UTC month, verify the Anthropic organization's FREE
credit grant, expiry, no paid balance/fallback, and automatic reloading OFF. A
normal Anthropic API key does not provide a documented promotional-balance
check, and possession of a working key does not establish a free-only guarantee.
Do not activate an organization mixing paid and promotional balances. Renew
billing verification each month; the guard expires closed. Other applications
using the same organization can consume its credits, so an isolated organization
with only promotional credits and no paid fallback is the safe activation target.

No billing settings are changed by this feature. Claude Haiku 5.5's exact API ID,
`claude-haiku-5-5`, was verified in the official 2026-10-20 Anthropic model docs
and the installed SDK. Recheck pricing before activation. Output is bounded to
1,400 tokens, thinking disabled, with no tools, retries or paid fallback models.
GET /api/ai-picks exposes only provider/configured/enabled booleans for zero-cost
deployment checks; it never authenticates to Anthropic or spends credits.

Apply `20261020192014_private_ai_picks_limits.sql` before enabling AI. Atomic
PostgreSQL limits allow 5 attempts per user per UTC day, a 30-second cooldown,
and 200 attempts for the entire application per UTC month. Failed generation
attempts also count. Only quota counters are stored, in the unexposed
`streamradar_ai` schema with RLS and no direct user table grants. The public RPC
is an invoker wrapper around a private function that checks `auth.uid()`.

## Verification

`node --test test/ai-picks.test.js test/database.test.js test/library-sync.test.js`
checks authentication, per-owner history, no identity in model prompts, invalid
input/output, insufficient history/configuration, safe failures, real PostgreSQL quota
limits, owner isolation and sync behavior. No live model credits are spent by tests.
`npm run build` builds public assets without server code or AI credentials.
Mobile (390px) and desktop layouts were checked in the browser.

The complete existing suite has three pre-existing season-badge failures. A live
model recommendation is still pending free-credit activation and billing verification.
