"use client";

import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";

const EXTENSIONS_PAGE = "chrome://extensions";

/**
 * DISC-IG-P0-01.3: installing the Instagram helper, on one page. Chrome only installs an
 * extension in one click from its Web Store; until the helper is listed there, this is the
 * shortest honest path: download, unzip, load it in Chrome. The page watches for the mark
 * the helper leaves on WonderArk pages (`data-wonderark-helper`, its version) and says
 * "Installed" by itself once it is there, or that a newer version is ready to download.
 * It never claims an install it cannot see.
 */
export function InstallSteps({ downloadHref, version }: { downloadHref: string; version: string }) {
  const [installed, setInstalled] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const read = () => setInstalled(document.documentElement.dataset.wonderarkHelper ?? null);
    read();
    // The helper marks the page shortly after it loads, and after it is installed and the page reloaded.
    const timer = window.setInterval(read, 1500);
    return () => window.clearInterval(timer);
  }, []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(EXTENSIONS_PAGE);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const upToDate = installed === version;

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-medium">
        {installed ? (
          <>
            <Check className="size-4 shrink-0 text-emerald-600" strokeWidth={3} aria-hidden="true" />
            {upToDate ? `Installed (version ${installed}).` : `Installed (version ${installed}). Version ${version} is ready: download it and replace the folder.`}
          </>
        ) : (
          "Not installed in this browser yet."
        )}
      </p>

      {upToDate ? (
        <a
          href="https://www.instagram.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open Instagram
        </a>
      ) : (
        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            <span className="font-medium">1. Download the helper</span>
            <a
              href={downloadHref}
              download
              className="inline-flex h-9 items-center gap-2 self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="size-4" aria-hidden="true" />
              Download (version {version})
            </a>
            <span className="text-muted-foreground">Then unzip it: double-click the downloaded file. Keep the folder; Chrome runs the helper from it.</span>
          </li>
          <li className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            <span className="font-medium">2. Open Chrome&apos;s extensions page</span>
            <span className="text-muted-foreground">
              Chrome doesn&apos;t let a website open it for you. Copy the address, paste it into a new tab and press Enter.
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-xs">{EXTENSIONS_PAGE}</code>
              <button type="button" onClick={copyAddress} className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent">
                {copied ? "Copied" : "Copy address"}
              </button>
            </span>
          </li>
          <li className="flex flex-col gap-1 rounded-lg border bg-card p-4">
            <span className="font-medium">3. Load the folder</span>
            <span className="text-muted-foreground">
              Turn on <b>Developer mode</b> (top right), press <b>Load unpacked</b> and choose the unzipped folder. Then reload this page: it will say Installed.
            </span>
          </li>
        </ol>
      )}
    </div>
  );
}
