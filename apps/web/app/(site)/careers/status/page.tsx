import type { Metadata } from "next";
import Link from "next/link";
import { careerApplicationStatus, failureMessage } from "@cofounderai/core/careers/wonderjobs";
import { careersRateLimited } from "@/lib/careers-rate-limit";
import { CareersNotice, CareersShell } from "../careers-ui";
import { WithdrawForm } from "./withdraw-form";

// The address carries the applicant's status token: never indexed, never sent on as a
// referrer (next.config.ts also sends Referrer-Policy: no-referrer for this path).
export const metadata: Metadata = {
  title: "Your application",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ t?: string | string[] }> };

const NOT_FOUND_TITLE = "We couldn't find that application. Use the link in your email.";

/**
 * PLATFORM-P1-13.1 -- an applicant's own status, from the link in WonderJobs' email. The
 * token is read here, on this app's server, and sent to WonderJobs in a request body --
 * never in a URL this server requests.
 */
export default async function ApplicationStatusPage({ searchParams }: Props) {
  const raw = (await searchParams).t;
  const token = typeof raw === "string" ? raw : "";

  let content;
  if (!token) {
    content = <CareersNotice title={NOT_FOUND_TITLE} action={{ href: "/careers", label: "See open positions" }} />;
  } else if (await careersRateLimited("status", 30)) {
    content = <CareersNotice title="Too many requests">Please try again later.</CareersNotice>;
  } else {
    const result = await careerApplicationStatus(token, "view");
    if (result.ok) {
      content = <WithdrawForm token={token} application={result.data} />;
    } else if (result.kind === "not_found" || result.kind === "bad_request") {
      content = <CareersNotice title={NOT_FOUND_TITLE} action={{ href: "/careers", label: "See open positions" }} />;
    } else {
      content = (
        <CareersNotice title="Your application can't be shown right now">
          {result.kind === "busy" ? failureMessage(result) : "Please try again later."}
        </CareersNotice>
      );
    }
  }

  return (
    <CareersShell>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">Your application</h1>
      </header>
      {content}
      <Link href="/careers" className="self-start text-sm font-medium text-landing-accent hover:underline">
        All open positions
      </Link>
    </CareersShell>
  );
}
