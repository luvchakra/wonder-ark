import Link from "next/link";
import { SITE_URL } from "@cofounderai/core/site";
import { getCareersKeyStatus } from "@cofounderai/core/careers/connection";
import { CareersKeyControls } from "./careers-key-controls";

/**
 * PLATFORM-P1-13.2 -- the WonderJobs career-site key behind the public /careers pages.
 * A singleton setting, not a list, so no table/mobile-card split applies. The key is shown
 * only as a mask; saves and clears are recorded in Audit Search.
 */
export default async function PlatformCareersPage() {
  const status = await getCareersKeyStatus();
  const careersAddress = `${SITE_URL.replace(/\/+$/, "")}/careers`;

  const source =
    status.source === "saved"
      ? `Saved here${status.updatedAt ? ` · updated ${new Date(status.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : ""}`
      : status.source === "environment"
        ? "From the WONDERJOBS_CAREERS_KEY environment variable"
        : "Not set -- the careers page says it isn't set up yet";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Careers</h1>
        <p className="text-sm text-zinc-400">
          WonderJobs runs the jobs and applications behind{" "}
          <Link href="/careers" className="underline hover:text-zinc-200">
            /careers
          </Link>
          . This page holds its career-site key.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Career-site key</span>
          <span className={`break-all font-mono text-sm ${status.masked ? "text-zinc-100" : "text-zinc-500"}`}>{status.masked ?? "Not set"}</span>
          <span className="text-xs text-zinc-500">{source}</span>
        </div>
        <CareersKeyControls saved={status.source === "saved"} configured={status.source !== "none"} />
      </div>

      <div className="flex flex-col gap-1 rounded-2xl border border-zinc-800 p-4 text-sm">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Careers page address</span>
        <code className="break-all text-zinc-100">{careersAddress}</code>
        <p className="text-xs text-zinc-500">
          In WonderJobs: Hiring → Jobs → Career sites → Add a career site → &quot;On our own website&quot;. Enter this address, then paste the key shown there (it starts with wjcs_ and is shown once).
        </p>
      </div>
    </div>
  );
}
