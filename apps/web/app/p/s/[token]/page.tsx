import type { Metadata } from "next";
import { getSurvey } from "@cofounderai/module-discovery/lib/audience/public";
import { SurveyForm } from "@cofounderai/module-discovery/components/audience/survey-form";
import { answerSurveyAction } from "./actions";

export const metadata: Metadata = { robots: { index: false } };

/** DISC-CONS-P0-04.1: where a person answers the questions a business emailed them. */
export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await getSurvey(token).catch(() => null);
  if (!survey) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Nothing to answer</h1>
        <p className="text-sm text-muted-foreground">There are no questions waiting here, or they were already answered.</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <main className="mx-auto flex max-w-md flex-col gap-6 rounded-xl border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{survey.offeringName}</h1>
          <p className="text-sm text-muted-foreground">{survey.businessName} would like to hear from you.</p>
        </div>
        <SurveyForm action={answerSurveyAction.bind(null, token)} questions={survey.questions} />
        <p className="text-center text-xs text-muted-foreground">Powered by WonderArk</p>
      </main>
    </div>
  );
}
