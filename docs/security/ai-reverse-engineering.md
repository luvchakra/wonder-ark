# Hardening against AI-assisted reverse engineering (2026-10-21)

Someone can point an AI model or browsing agent at the code, screens, API and help, and
rebuild the product. This records what was checked, what changed and what is left to
the owner.

| Control | Status | Evidence |
|---|---|---|
| Source repository private | **Owner action** | GitHub API reports `"private": false`; the plan, ADRs, security findings and all source are public |
| Production source maps | Already in place | Next's default (no `productionBrowserSourceMaps`); live `/_next/static/**.js.map` returns 403 |
| Server-only logic out of the client | Already in place | Prompts, AI calls, pricing and policy run in server actions/routes (CLAUDE.md "AI" rule; `lint:boundaries`) |
| Secrets in the client | Already in place | Only `NEXT_PUBLIC_SUPABASE_URL`, `..._PUBLISHABLE_KEY`, `..._SITE_URL`, `..._BRAND_NAME` are public, all meant to be |
| Public API docs | **Done** | `/api/v1/openapi.json` needs an API key or a signed-in session (`app/api/v1/openapi.json/route.test.ts`) |
| Public surface | Already in place | Every app route redirects to `/login` without a session; API and MCP refuse without a key |
| Errors and headers | Already in place | `poweredByHeader: false`; API errors are `{code, message}` without stack traces |
| Security headers | Already in place | `apps/web/lib/security-headers.ts` (CSP with `frame-ancestors 'none'`, `object-src 'none'`, HSTS, nosniff, Referrer-Policy, COOP) |
| Rate limits | Partly in place | API/MCP 120 req/min per business (`check_api_rate_limit`); AI has monthly usage caps. No per-user per-minute limit on in-app AI or exports yet |
| robots.txt | **Done** | AI crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended, ...) disallowed site-wide (`app/robots.test.ts`) |
| Signed-in pages noindex | **Done** | `robots: noindex, nofollow, nocache, noimageindex` on the dashboard and platform layouts |
| Scraping detection | Not done | Needs the owner's decision on what to do when it fires |
| Export controls | Already in place | Permission-checked, synchronous row limit with background hand-off, every export audited (`packages/core/src/exports/server.ts`); no watermark |
| AI assistant | **Done** | Prompt refuses to reveal its instructions or context, context is delimited as data (`chat_v6`, `prompts.test.ts`); history now comes from the server, not the client |
| Help content | **Done** | Deployment internals moved from the Getting Started and CRM guides to `docs/ops/deployment-setup.md`; a test keeps secrets and source paths out of the guides |
| Terms against reverse engineering | **Owner action** | Draft clauses in `docs/legal/TERMS-DRAFT.md`; acceptance with version and time already exists |
| LICENSE file | **Owner action** | None in the repo (all rights reserved by default); add a proprietary notice naming the legal owner |
| Canary data | Not done | Demo data is per-user and tracked row by row; marker records need the owner to choose them |
| Edge firewall | **Owner action** | Vercel Firewall rules are set in the dashboard, not `vercel.json` |
