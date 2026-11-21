# Deploying WonderArk (operator notes)

Internal: for whoever operates a WonderArk deployment. Moved out of the in-app Getting
Started guide on 2026-10-21, because every signed-in customer could read it there and it
described how the platform is configured (environment variables, secret handling,
provider setup) rather than anything a business user does. Keep operator detail here, not
in `docs/user-guides/`.

## 1. Environment variables

If you're standing up your own instance, `apps/web/.env.example` documents
every variable. Grouped by purpose:

| Purpose | Variables |
|---|---|
| Supabase connection | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose to the browser) |
| Branding | `NEXT_PUBLIC_BRAND_NAME` (defaults to "WonderArk") |
| Outbound email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` |
| Inbound email | `EMAIL_INBOUND_WEBHOOK_SECRET` |
| AI credit purchases | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — optional; leaving these unset just disables the "buy credits" flow |
| BYOK key encryption | `API_KEY_ENCRYPTION_SECRET` — a 32-byte base64 secret; **never rotate this once customers have connected keys**, it makes every stored key permanently undecryptable. It also signs the unsubscribe links in outreach email (outreach won't send without it, and rotating it invalidates links already sent) |
| Platform-wide AI fallback | `PLATFORM_AI_API_KEY` — optional; lets accounts without their own key still use AI features, against their normal usage caps. A key set on the superadmin portal's **AI Providers** page takes precedence over this variable, and needs no redeploy |
| Scheduled jobs | `CRON_SECRET` — checked on the background event-drain endpoint |
| Platform admins | `PLATFORM_ADMIN_EMAILS` — comma-separated emails that may open the `/platform` portal (WonderArk's own console) and see **Platform admin** in the avatar menu. Signing in on the main address lands them on the portal. They may also use the demo-data tool |
| Business admins | `BUSINESS_ADMIN_EMAILS` — optional; comma-separated emails that may use only the demo-data tool at `/dashboard/admin`, which acts on any business account. No portal access |
| CRM channel webhooks | `CRM_META_APP_SECRET`, `CRM_META_WEBHOOK_VERIFY_TOKEN`, `CRM_WHATSAPP_APP_SECRET`, `CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN` — see the [CRM guide](/help/crm#connecting-a-channel-whatsapp-instagram-facebook) |
| Organization addresses | `BASE_APP_HOST` — turns on `<prefix>.<host>` addresses (for example `ark.wonderapps.biz`); `ORG_ADDRESS_REQUIRED` — makes the main address the landing page only |
| Environment payments | `BILLING_TEST_PAYMENTS` — test-mode payments for **Add an environment** |
| SEO | `NEXT_PUBLIC_SITE_URL` — optional, falls back to the current deployment URL |
| Careers (WonderJobs) | `WONDERJOBS_CAREERS_KEY` — optional fallback for the career-site key (`wjcs_…`); a key saved on **Platform → Careers** takes precedence and needs no redeploy. `WONDERJOBS_BASE_URL` — tests/staging only; must be an https `*.wonderapps.biz` address, anything else is refused |

### Platform Admin → Keys (PLATFORM-P1-14.1)

Most of these no longer need to be deployment variables. A superadmin sets them on
**Platform Admin → Keys** (`/platform/keys`): the value is stored encrypted in
`platform.platform_keys`, is in use within a minute with no redeploy, and each change is
recorded in the audit log with a reason. A value saved there is used instead of the
deployment's variable of the same name; the variable stays the fallback until you remove it.

| Set on the Keys page | Stays in the deployment, and why |
|---|---|
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `EMAIL_INBOUND_WEBHOOK_SECRET` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: needed to reach the database the keys are stored in |
| `WORKSLAKE_GATEWAY_URL`, `WORKSLAKE_GATEWAY_API_KEY` | `API_KEY_ENCRYPTION_SECRET`: encrypts every stored key, so it is kept apart from them |
| `CRM_WHATSAPP_APP_SECRET`, `CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `CRM_META_APP_SECRET`, `CRM_META_WEBHOOK_VERIFY_TOKEN` | `CRON_SECRET`: the hosting provider's scheduler sends it itself and reads it only from the deployment |
| `PLATFORM_AI_API_KEY` → the **AI Providers** page (its own encrypted store, tested against the provider) | `BASE_APP_HOST`, `ORG_ADDRESS_REQUIRED`: read on every request before the database |
| | `PLATFORM_ADMIN_EMAILS`: who may open the portal, kept outside it |

**Moving an existing deployment over:** open the Keys page and press **Import from
deployment**. The server copies each value the deployment sets, and the platform does not
have yet, into the encrypted store (the AI key is tested and its provider switched on). No
value is shown or leaves the server. The page then lists which deployment variables hold
the same value as the platform and can be deleted from the hosting dashboard.

None of this is needed by an ordinary business user signing up on an
existing WonderArk deployment — it's only relevant to whoever operates the
deployment itself.

## 2. Enabling Google sign-in

The application code for Google sign-in is already in place — the
"Continue with Google" button, the OAuth redirect, and the
`/auth/callback` handler that turns Google's response into a session. What
it needs is credentials, and those are configured outside the codebase, in
two places. Until they exist the button is hidden rather than shown and
broken, so enabling Google is a configuration change only: nothing to
deploy, nothing to rebuild.

### Step 1 — Create OAuth credentials in Google Cloud

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and
   select (or create) a project for this deployment.
2. **APIs & Services → OAuth consent screen.** Choose **External** unless
   every user will have an account in your own Google Workspace, then fill
   in the app name, a support email, and your logo. Add the scopes
   `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `openid` —
   these are the defaults and are all WonderArk asks for.
   While the consent screen is in **Testing**, only the accounts you list
   as test users can sign in; **Publish** it before go-live.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   Application type: **Web application**.
4. Under **Authorised JavaScript origins**, add the origins people will
   actually load the app from — e.g. `https://your-domain.com` and, for
   local work, `http://localhost:3000`.
5. Under **Authorised redirect URIs**, add **one** URI, and it is Supabase's,
   not your app's:

   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

   This is the single most common thing to get wrong. Google redirects to
   Supabase, and Supabase then redirects to WonderArk's own
   `/auth/callback` — so your own domain does not belong in this field. A
   mismatch here shows up as `redirect_uri_mismatch` at sign-in time.
6. Copy the **Client ID** and **Client secret**.

### Step 2 — Turn the provider on in Supabase

1. Open the Supabase dashboard for this deployment's project →
   **Authentication → Providers → Google**.
2. Toggle it **Enabled**, paste the Client ID and Client secret, and save.
3. Still in Authentication, check **URL Configuration**:
   - **Site URL** — your production origin (e.g. `https://your-domain.com`).
   - **Redirect URLs** — add `https://your-domain.com/auth/callback`, plus
     `http://localhost:3000/auth/callback` for local development and a
     wildcard for preview deployments if you use them
     (e.g. `https://*-your-team.vercel.app/auth/callback`).

   WonderArk always asks Supabase to send people back to
   `{origin}/auth/callback`, taking the origin from the request itself, so
   the same build works in local dev, previews and production — but every
   origin you want that to work from has to be on this allowlist.

That is the whole of it. Within five minutes (the button's cached view of
the project's settings) — or immediately on the next cold start — the
Google button appears on both the login and signup pages.

### Checking it worked

```
curl -s -H "apikey: <your-publishable-key>" \
  https://<your-project-ref>.supabase.co/auth/v1/settings | grep google
```

`"google": true` means the provider is live. This is the same endpoint the
login page itself asks, so if it says `true`, the button is showing.

### What happens to someone who signs in with Google

They land on the same dashboard an email signup does, with their
Google display name and profile picture already filled in, and no password
on the account. If they later want to sign in with a password instead, they
can set one through **Forgot password?** on the login page — the reset email
goes to the same address Google verified.

## 3. Enabling Microsoft and LinkedIn sign-in

**Continue with Microsoft** and **Continue with LinkedIn** work exactly like
the Google button (§2): the code is already in place, each button is hidden
until its provider is switched on for the deployment, and turning one on is a
configuration change only — nothing to redeploy. Within about five minutes of
enabling a provider its button appears on both the login and the signup page.

For each provider you do the same two things as for Google:

1. **Register an app with the provider** (Microsoft's or LinkedIn's developer
   console) and copy its client ID and client secret. As with Google, the
   redirect URI you register is the *authentication service's* callback
   address for your project (the one described in §2), not your own domain.
2. **Turn the provider on** in the authentication service's Providers
   settings and paste in the ID and secret. Microsoft is listed there as
   **Azure (Microsoft)**; LinkedIn as **LinkedIn (OIDC)** — use the OIDC
   one. Check that your site's address and `/auth/callback` are on the
   service's redirect allowlist, exactly as in §2.

If someone clicks a button for a provider that isn't switched on (for example
while the setting is still propagating), they get a plain message saying that
sign-in isn't switched on for this deployment yet and to use email and
password or ask an administrator, rather than a technical error.

People who sign in with Microsoft or LinkedIn are treated like those who use
Google: a first sign-in creates the account and lands on the dashboard
(an invitee goes back to their invitation), and there is no password
on the account until they set one through **Forgot password?**.
