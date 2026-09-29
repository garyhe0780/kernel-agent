# Password recovery

The login page offers a text-only show/hide password toggle and Forgot password.
Recovery uses Better Auth's one-use reset tokens, expiring after one hour. A successful
reset revokes existing sessions and returns the user to sign in.

Set these server variables to enable email delivery:

- `RESEND_API_KEY`: a Resend API key with email sending permission.
- `KERNEL_EMAIL_FROM`: a sender on a verified Resend domain, for example `Kernel <accounts@example.com>`.
- `BETTER_AUTH_URL`: the public application origin, using HTTPS in production.

For Cloudflare, set the API key using `pnpm exec wrangler secret put RESEND_API_KEY`
and the sender using `pnpm exec wrangler secret put KERNEL_EMAIL_FROM`, then deploy.
Locally, add the values to `.env` and restart the server. No database migration is needed.

Missing email configuration returns an actionable error for all email addresses.
Configured requests return the same confirmation for known and unknown addresses.
Provider delivery failures are logged without email addresses, reset links, or credentials;
check server logs and the provider dashboard when email does not arrive.

References: [Better Auth password recovery](https://better-auth.com/docs/authentication/email-password)
and [Resend email API](https://resend.com/docs/api-reference/emails/send-email).
