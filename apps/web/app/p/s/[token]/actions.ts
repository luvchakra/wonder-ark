"use server";

import { submitSurveyAnswers, type SurveyOutcome } from "@cofounderai/module-discovery/lib/audience/public";

/** DISC-CONS-P0-04.1: a person's answers to the questions a business sent them. The
 * private token from their email is the only authorisation. */
export async function answerSurveyAction(token: string, _prev: SurveyOutcome | null, formData: FormData): Promise<SurveyOutcome> {
  try {
    return await submitSurveyAnswers(token, (index) => formData.get(`answer_${index}`));
  } catch {
    return { status: "unavailable" };
  }
}
