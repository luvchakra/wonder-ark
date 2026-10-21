// Vitest stand-in for `server-only`. Next.js resolves that import itself (and fails a
// client build that reaches it); outside Next there is nothing to resolve, so the test
// configs alias it here. See packages/core/vitest.config.ts and apps/web/vitest.config.ts.
export {};
