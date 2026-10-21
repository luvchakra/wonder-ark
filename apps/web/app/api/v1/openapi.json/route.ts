import { createClient } from "@cofounderai/core/db/server";
import { resolveApiKey } from "@cofounderai/core/api-v1/auth.server";
import { ApiError, errorResponse } from "@cofounderai/core/api-v1/response";
import { serveOpenApiSpec } from "../dispatch";

/**
 * The API's own documentation, for people who can already use the API: a request with a
 * valid API key, or a signed-in user (the API keys panel links here from the browser).
 * Anyone else gets 401 -- the full map of resources, fields and permissions is not handed
 * to an anonymous crawler. Served at a literal path segment ("openapi.json"), which
 * Next.js resolves ahead of the sibling [resource] dynamic route.
 */
export async function GET(request: Request) {
  try {
    if (request.headers.has("authorization")) {
      await resolveApiKey(request);
    } else {
      const {
        data: { user },
      } = await (await createClient()).auth.getUser();
      if (!user) {
        throw new ApiError(401, "unauthorized", "Sign in, or send 'Authorization: Bearer sk_live_...'.");
      }
    }
  } catch (err) {
    return errorResponse(err instanceof ApiError ? err : new ApiError(500, "internal_error", "Unexpected error."));
  }
  return serveOpenApiSpec();
}
