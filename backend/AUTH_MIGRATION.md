# Notiva ID and recovery authentication

Existing accounts retain their legacy `email`, password, contact details and organization code. Email login remains supported. Successful legacy login, or sending a recovery-email verification code, copies a missing recovery email from the legacy email with `recoveryEmailVerified: false`. Profile responses also expose the fallback address for existing sessions. No bulk user deletion or automatic email verification occurs.

New registrations require full name, a selected Notiva ID, recovery email, canonical `mobileNumber`, password and confirmation. `POST /api/auth/notiva-id/suggestion` returns a name-based suggestion with a cryptographic six-hex-character suffix, without creating or reserving an account. The form displays this editable suggestion; manual edits survive subsequent name changes. Public `GET /api/auth/registration/notiva-id/availability?value=...` returns only availability. Both routes use the existing process-local rate limiter. Registration validates and saves the selected display ID exactly, relying on case-insensitive uniqueness; conflicts, including concurrent insert races, return 409 without substituting another ID. New users do not receive a fabricated legacy email. Recovery email is not a login lookup key. Recovery email addresses may be shared; Notiva IDs remain unique.

## Deployment

- Install backend dependencies with the updated manifest/lockfile.
- Use MongoDB 5.0 or later, which supports [coexisting sparse and non-sparse unique indexes](https://www.mongodb.com/docs/manual/core/index-sparse/#sparse-and-non-sparse-unique-indexes). Before listening, server startup creates a unique sparse legacy-email index, then removes the old non-sparse email index. This allows multiple new accounts without a legacy email while retaining uniqueness of existing email values. The unique sparse case-insensitive Notiva ID index is also ensured. Index failure prevents this server from accepting requests; account documents are never deleted by index preparation.
- Stop older backend versions before rollout. The deployed database user needs create/drop-index privileges. Existing malformed/duplicate identity data may require investigation if index creation fails. Test this startup migration against a database backup or staging copy before production rollout.
- Restart the backend. The application does not need a native rebuild for these changes.
- Configure `JWT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` through the existing environment. SMTP credentials and OTPs are never logged by the new mail/recovery implementation. No environment file is included in this change.

## Recovery behavior

Legacy users can sign in using their existing email and create their Notiva ID in Personal Information. Existing access tokens and session storage remain compatible. Recovery-email verification controls remain available but are optional and are not a prerequisite for Forgot Password. New users can recover their password immediately using their Notiva ID and stored recovery/contact email.

Forgot Password accepts a Notiva ID, not a recovery email. After ID lookup, it uses the stored recovery/contact email regardless of verification status; a missing recovery email is safely copied from the legacy email when available. Public initiation always returns the same generic response and no destination, including unknown accounts, missing/invalid destinations, cooldowns and delivery failures. A masked address is returned only for authenticated recovery-email verification. This avoids leaking account existence through a destination field. Phone remains contact information only; no SMS OTP is used.

Both OTP purposes use cryptographically generated six-digit values, purpose/account/email-bound HMAC hashes, ten-minute expiry, five attempts and a persisted sixty-second resend cooldown. Password reset OTPs are additionally bound to the current password hash. New reset OTP requests invalidate outstanding reset authorization. SMTP delivery for public password reset is asynchronous; delivery failures invalidate that code without changing the public response. No durable mail queue is included.

Reset authorization is a random, hashed, single-use value valid for ten minutes. It is not an access JWT. The frontend keeps it only in screen memory, never route parameters or persistent storage. Reset checks that password and recovery email still match the OTP-authorized context before updating only password-related fields. Recovery does not automatically mark the email verified. Access tokens retain their seven-day expiry and HS256 algorithm, but every successful password reset or authenticated password change atomically increments the user tokenVersion and invalidates earlier access tokens. Authenticated password change returns a replacement token and complete public user; the frontend persists that replacement only for the still-active original session. Forgot Password reset does not issue an access token.

Per-IP limits are process-local and supplement durable account OTP limits. Multiple backend instances should share an infrastructure rate limiter. Phone remains contact information; Google Sign-In and SMS are not implemented.

## Validation

Run `node --test backend/tests/profile.test.js backend/tests/recovery.test.js`, `npx tsc --noEmit`, and the frontend scripts `test-login.cjs`, `test-recovery-auth.cjs`, `test-profile-session.cjs`, and `test-leave-organization.cjs` under `scripts/`.

Automated tests use model doubles and mocked SMTP. They do not establish live database migration success, real email delivery, or physical-device UI behavior.

## Access-token invalidation

User tokenVersion defaults to zero. Missing database values and legacy JWTs without a version are treated as zero, preserving existing sessions until the first successful password change/reset. No bulk migration or session collection is needed. New login and password-change tokens include the current version through the shared access-token helper. Public user responses omit it. Authentication verifies signature/expiry, loads the current user, and rejects mismatched or malformed JWT versions.

Deploy the updated frontend and backend together for seamless authenticated password changes. If the response is lost or device session persistence fails after a successful change, sign in again with the new password. All backend instances must enforce the version check; older instances must be stopped. Requests already authenticated before a password update may finish; revocation applies to subsequent authentication checks.

## Display IDs and case-insensitive uniqueness

The existing notivaId field now preserves display case. A separate normalized field is unnecessary: all identity lookups use the shared lowercase normalization and MongoDB collation `{ locale: "en", strength: 2 }`. The `notivaId_case_insensitive` unique sparse index enforces case-insensitive uniqueness on that same field, covering existing users without a document backfill. Formats allow 4–30 ASCII letters, numbers, hyphens, underscores and periods; reserved names remain case-insensitive.

Startup creates the replacement identity index before dropping existing binary/simple-collation single-field identity indexes. It does not overwrite documents or automatically resolve conflicting IDs. Existing case-variant duplicates or duplicate explicit null/empty values may prevent index creation; startup then fails safely and the old identity index remains. Inspect production/staging indexes and identity data before rollout, stop older backend versions, and ensure create/drop-index permissions. These operations have not been run against a live database during implementation.

The authenticated `/set-notiva-id` endpoint now permits repeated customization and case-only changes. It returns the complete public user and preserves the JWT/tokenVersion, password, recovery email and organization. `GET /api/auth/notiva-id/availability?value=...` is authenticated and returns only availability, excluding the current user's own identity. The final update always relies on the unique index even after its availability check.

Registration returns an access token and complete public user. The frontend awaits the existing AuthContext signIn persistence before opening authenticated tabs. If account creation succeeds but local session storage fails, the form directs the user to Login and prevents duplicate creation attempts. Existing ID and legacy email logins, Notiva-ID-only recovery, optional email verification, password-reset token invalidation, organization behavior and onboarding storage remain unchanged. This registration update introduces no schema or index migration. Manual deployment validation must include concurrent ID updates/registration against actual MongoDB, case-insensitive login/recovery and physical-device registration/profile screens.
