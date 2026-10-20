# Account and recommendation improvements

For You includes More like this / Less like this toggles. They record direct taste
feedback independently of ratings, watchlist membership and watched status. Both
the normal taste model and Claude use the feedback; a second click clears it.
Seen It remains the explicit watched action. Feedback and its title metadata sync
through owner-protected library entries, including queued offline edits.

My services is account-scoped when signed in. Guest selections remain in that
browser; signing into another account restores that account's choices. Other
browsing filters and theater ZIP stay device-local. Field-specific preference
updates do not replace ratings, history or unrelated title changes.

Successful AI generations save a compact title/reason/filter snapshot. Your AI
pick history reopens the last 20 batches without calling the model. History syncs
across devices, is private to its owner, and is included in account exports.
Availability is a snapshot; opening a title fetches current offers. Earlier
generations made before this feature are not reconstructed automatically.

Account > Delete account shows the account email, an export-backup option, the
exact data removed, and a required DELETE confirmation. The private database
function checks auth.uid(), the expected account ID and confirmation, revokes
refresh sessions, then deletes that user transactionally. Foreign keys cascade
library entries, preferences, history and that person's quota row. No admin key
is exposed to clients. The UI clears its account cache and signs out locally.
Guest copies and downloaded backups are separate. Copies on offline devices
cannot be remotely erased; revoked sessions prevent future cloud access and
deleted-user foreign keys prevent a stale JWT from recreating account data.

`20261020201752_account_preferences_history_feedback_deletion.sql` adds the
owner-only tables, preference state and RPCs. All public tables have RLS with
explicit owner predicates, and anonymous RPC execution is denied. Only the
private deletion function uses SECURITY DEFINER with an empty search path.
Production account deletion is never exercised against an actual user during QA;
isolated PostgreSQL tests verify ownership, confirmation, cascades and sessions.

## Email status

Google sign-in remains available. Email/password sign-in, reset-link handling and
resending signup confirmation are implemented through Supabase Auth. Errors for
unconfirmed email, restricted delivery, rate limits and expired links give clear
next steps without claiming an email was delivered after an error.

Production custom SMTP was OFF when inspected on 2026-10-20. Supabase's default
sender restricts recipients to project-team addresses and is not production email
delivery for friends. This is a configuration dependency, not fixed by a client
UI change. Email confirmation protections remain enabled.

For a small personal deployment, an owner-controlled Gmail SMTP sender can be
configured in Supabase Auth > Emails > SMTP Settings (smtp.gmail.com, port 587,
sender and username the owner's Gmail address, sender name StreamRadar). Its app
password must be created and entered privately by the owner; never put it in chat,
Git, client assets or a public Vercel variable. A dedicated sender/domain is the
alternative as the site grows. Verify signup confirmation and reset delivery to
an owner-approved external mailbox before calling email production-ready.

## Verification

Focused tests cover offline and concurrent preference sync, account switching,
feedback semantics and clearing, history validation/retention, per-owner access,
anonymous denial, self-deletion and stale-token writes. Claude endpoint and
transport tests cover private input and validated output. The full existing test
suite retains three pre-existing season-label failures unrelated to these changes.
