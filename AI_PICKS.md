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

## Claude activation

The owner saved `ANTHROPIC_API_KEY` as a Vercel Secret for Production and
explicitly authorized activation with that account on 2026-10-20. The server
uses `@ai-sdk/anthropic` directly against Anthropic's official endpoint. The
key stays server-only; no AI Gateway or automatic fallback is used. API usage
draws from the organization's balance under its existing billing settings.
The application does not purchase credits or change automatic reloading.

`lib/ai-policy.js` has `enabled:true`; set false to disable generation.
Claude Haiku 5.5's exact model ID, `claude-haiku-5-5`, was checked against
Anthropic's current documentation and the installed SDK. Output is bounded
to 1,400 tokens, thinking disabled, with no tools, retries or fallback models.
GET /api/ai-picks reports provider/configured/enabled without disclosing the
key or calling Anthropic. Usage limits below bound attempts, not dollars.

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

The complete existing suite has three pre-existing season-badge failures. Live production activation and verification are performed after deployment.
