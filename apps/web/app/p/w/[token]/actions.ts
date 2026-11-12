"use server";

import { submitSignup } from "@cofounderai/module-discovery/lib/audience/signup";
import type { SignupState } from "@cofounderai/module-discovery/lib/audience/types";

/**
 * DISC-CONS-P0-03.2: the public sign-up. Takes the raw page token from the URL and the
 * referral and campaign parameters the page was opened with, never a workspace id: the
 * token, resolved on the server, decides which offering's list this joins.
 */
export async function signupAction(
  token: string,
  params: { ref: string | null; utm: Record<string, string> },
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  try {
    return await submitSignup(token, {
      email: formData.get("email"),
      name: formData.get("name"),
      answer: (index) => formData.get(`answer_${index}`),
      website: formData.get("website"),
      ref: params.ref,
      utm: (key) => params.utm[key],
    });
  } catch {
    return { status: "unavailable" };
  }
}
