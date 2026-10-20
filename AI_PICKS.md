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

`lib/ai-policy.js` is deliberately disabled (`verifiedFreeMonth: null`). Before
setting the current UTC month, verify the team's FREE credit grant is active,
no paid balance or BYOK credentials are present, and auto top-up is OFF. Renew
that verification each month. The gateway balance endpoint reports a combined
balance, so code cannot independently distinguish promotional and paid dollars.
Never enable this policy against an account that mixes them. Adding an Anthropic
API key alone does not establish a free-credit guarantee; that path is not enabled.

No keys or billing settings are created/changed by this feature. Deployed Vercel
functions use project OIDC with AI Gateway. The model was selected from the live
2026-10-20 gateway catalog for structured output and low cost. Recheck pricing and
free-tier eligibility before activation. No tools, paid fallback models, automatic
retries, or credit purchases are configured. A balance check reserves $0.05;
requests fail closed if verification, credit lookup or provider calls fail.

Apply `20261020192014_private_ai_picks_limits.sql` before enabling AI. Atomic
PostgreSQL limits allow 5 attempts per user per UTC day, a 30-second cooldown,
and 200 attempts for the entire application per UTC month. Failed generation
attempts also count. Only quota counters are stored, in the unexposed
`streamradar_ai` schema with RLS and no direct user table grants. The public RPC
is an invoker wrapper around a private function that checks `auth.uid()`.

## Verification

`node --test test/ai-picks.test.js test/database.test.js test/library-sync.test.js`
checks authentication, per-owner history, no identity in model prompts, invalid
input/output, insufficient history/credits, safe failures, real PostgreSQL quota
limits, owner isolation and sync behavior. No live model credits are spent by tests.
`npm run build` builds public assets without server code or AI credentials.
Mobile (390px) and desktop layouts were checked in the browser.

The complete existing suite has three pre-existing season-badge failures. A live
model recommendation is still pending free-credit activation and billing verification.
