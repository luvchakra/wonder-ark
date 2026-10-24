# Deployment budget: staying under a hosting plan's daily cap

Hosting platforms count every deployment they **create**, including ones an "ignored build
step" then cancels. Vercel's Hobby plan, for example, allows 100 deployments a day, shared
by every project on the team, and one build runs at a time. Running out blocks production.
Treat deployments as a scarce budget, and spend it on production first. These rules apply
to any app.

## 1. Create no deployment you don't need

- **Turn automatic deployments off for working branches at the platform level.** On Vercel
  that is `vercel.json` → `"git": {"deploymentEnabled": {"claude/**": false, "feature/**": false}}`.
  The keys are minimatch globs; any branch you don't list still deploys. An ignore script that
  cancels the build still uses a slot.
- **Keep previews off** unless someone will actually open them.
- **Disconnect any second project** linked to the same repository. It deploys every push
  again.

## 2. One merge to main = one production deployment, so merge in bigger pieces

- **Squash-merge.** Put the docs, changelog, tracker and test updates in the same pull
  request as the code they describe.
- **Don't open docs-only pull requests** while a code pull request is open or about to open.
  Fold them into it.

## 3. Tests that run on the hosting platform cost a slot per run

- **Run end-to-end tests locally or on the CI runner** (e.g. GitHub Actions, with
  `next build && next start`), not against a fresh hosted deployment.
- **Run them before a merge only for security-sensitive changes:** auth, permissions,
  database rules, integrations. Everything else waits for the scheduled suite.
- **Keep scheduled suites few.** Use fewer shards, and skip a run when main hasn't changed
  since the last green one. Stagger schedules across apps.
- **Never re-run a failed run hoping it passes.** Find the cause first.

## 4. Verify before pushing, so there are no fix-up pushes

- Run typecheck, lint, the unit tests for what you touched, and a local production build.
- Push a branch once, when it's ready.

## 5. Watch the budget

- Before deployment-heavy work, count the team's deployments in the last 24 hours (all
  projects, all states).
- Above about 70% of the cap, stop test runs and docs-only merges. Keep what's left for
  production and hotfixes.

## 6. When the cap is hit

- **Stop pushing to branches that deploy.** Refused deployments are not queued.
- **Wait** until the oldest counted deployment is 24 hours old.
- **Redeploy only the latest main, once.**
- **Treat "rate limited" statuses as infrastructure**, not test failures.

## Also: hold the single build slot for less time

- Leave the build cache on. Don't repeat CI's lint or test work inside the hosted build.
- Turn on **Prioritize Production Builds** in the team settings.
- When a production deploy sits in `QUEUED`, list the team's `BUILDING` deployments. Usually
  another project holds the slot.

## This repo's deployment rules

Moved here from `CLAUDE.md` (2026-10-10; "merge automatically" 2026-10-15).

- **Working branches don't deploy.** `apps/web/vercel.json` `git.deploymentEnabled` turns deployments off for `claude/**`, `feat/**`, `feature/**`, `fix/**` and similar prefixes. Only `main` deploys. `apps/web/vercel-ignore-build.sh` skips `main` commits whose app inputs didn't change. When the app starts building from a new directory, add it to the script's `git diff` paths.
- **Count before deployment-heavy work.** Count the team's deployments in the last 24 hours. Above about 70% of the cap, auto-merge only production fixes and hotfixes; leave the rest open and say why.
- **At the cap:** stop. Wait until the oldest counted deployment is 24 hours old, then redeploy the latest `main` once.
- **Manual deployments** (redeploys included) need the owner's "build now".
- **Stuck in `QUEUED`:** list the team's `BUILDING` deployments first. Usually another project holds the slot.
