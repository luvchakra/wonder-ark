import type { MetadataRoute } from "next";
import { SITE_URL } from "@cofounderai/core/site";

/**
 * Crawlers may index the public site -- the landing page, pricing and the legal pages --
 * and nothing else. The help guides are signed-in only (and marked noindex). Everything behind a login is disallowed by prefix where
 * it has one; a business's own pages live under its slug (/acme-hvac/...), which no crawler
 * can reach anyway since every such route redirects an anonymous visitor to /login. The
 * one-off public token pages under /p/ (estimates, invoices, data-room links) are
 * disallowed too: they are meant for the one person who was sent the link, not a search
 * index.
 */
/**
 * AI training and answer-engine crawlers get nothing at all, the marketing pages
 * included: what they read is used to train or ground models, which is how a product
 * gets rebuilt from its own screens. Search engines (Googlebot, Bingbot) are unaffected;
 * Google-Extended and Applebot-Extended are those companies' AI-training tokens, not
 * their search crawlers.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "cohere-ai",
  "Diffbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/platform", "/api/", "/auth/", "/onboarding", "/p/", "/reset-password", "/help"],
      },
      { userAgent: AI_CRAWLERS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
