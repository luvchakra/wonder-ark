"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { toast } from "@cofounderai/core/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cofounderai/core/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { DiscoveredProduct } from "../../lib/ai/schemas";
import type { ProductImportRow } from "../../lib/tenancy/parse-products-import";

/**
 * "Let AI Auto-populate Products from website" -- same two-step preview-then-confirm
 * shape as ProductImportWizard (that component's own doc comment explains why: nothing
 * is created until the founder reviews and confirms), just sourced from AI research
 * against the business's own website instead of an uploaded file. `discoverAction`
 * (step 1) only researches and returns a list, it never writes; `importAction` (step
 * 2, the same one the file-import wizard already uses) is what actually creates the
 * rows, called directly with the list already in state.
 */
/** One line of the newline-delimited stream `/[businessSlug]/discover-products` sends
 * back -- see that Route Handler's own doc comment for why this needs to be a plain
 * streamed `Response` rather than a Server Action. */
type DiscoverProductsEvent =
  | { type: "progress"; products: Partial<DiscoveredProduct>[] }
  | { type: "done"; products: DiscoveredProduct[] }
  | { type: "error"; error: string };

export function AutoPopulateProductsButton({
  businessSlug,
  disabled,
  disabledReason,
  importAction,
  quiet = false,
}: {
  businessSlug: string;
  /** True when the business has no website configured yet -- there's nothing to
   * research against. */
  disabled: boolean;
  disabledReason?: string;
  /** PLATFORM-NAV-P0-03.3: a small outline button, once the business has offerings and
   * this is no longer the page's main action. */
  quiet?: boolean;
  importAction: (rows: ProductImportRow[]) => Promise<{ inserted: number; duplicates: number }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [discovering, startDiscovering] = useTransition();
  const [importing, startImporting] = useTransition();
  const [products, setProducts] = useState<DiscoveredProduct[] | null>(null);
  // Grows live while the AI's structuring call streams in, so the founder sees names
  // appear one at a time instead of one opaque wait for the whole call to finish.
  const [progressProducts, setProgressProducts] = useState<Partial<DiscoveredProduct>[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Every discovered row starts checked -- founders review and uncheck the ones they
  // don't want, rather than having to opt every row in individually.
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function launch() {
    setOpen(true);
    setProducts(null);
    setProgressProducts([]);
    setError(null);
    startDiscovering(async () => {
      let response: Response;
      try {
        response = await fetch(`/${businessSlug}/discover-products`, { method: "POST" });
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
        return;
      }
      if (!response.body) {
        setError("Something went wrong.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as DiscoverProductsEvent;
          if (event.type === "progress") {
            setProgressProducts(event.products);
          } else if (event.type === "done") {
            setProducts(event.products);
            setSelected(new Set(event.products.map((_, i) => i)));
          } else {
            setError(event.error);
          }
        }
      }
    });
  }

  function close() {
    setOpen(false);
  }

  function toggleRow(i: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(i);
      else next.delete(i);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(products?.map((_, i) => i) ?? []) : new Set());
  }

  function confirmImport() {
    if (!products || selected.size === 0) return;
    const rows: ProductImportRow[] = products
      .filter((_, i) => selected.has(i))
      .map((p) => ({ name: p.name, description: p.description ?? undefined, website: p.website ?? undefined }));
    startImporting(async () => {
      const result = await importAction(rows);
      close();
      router.refresh();
      if (result.inserted === 0) {
        toast.error("No new offerings were added -- every one matched an existing offering.");
        return;
      }
      toast.success(
        `Added ${result.inserted} offering${result.inserted === 1 ? "" : "s"}.` +
          (result.duplicates > 0 ? ` Skipped ${result.duplicates} already in this business.` : ""),
      );
    });
  }

  return (
    <>
      <Button
        onClick={launch}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        variant={quiet ? "outline" : "default"}
        size={quiet ? "sm" : "default"}
        className={quiet ? undefined : "shadow-sm"}
      >
        <Sparkles className="size-4" aria-hidden="true" />
        {quiet ? "Auto-populate from website (AI)" : "Let AI Auto-populate Offerings from website"}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="flex max-h-[80dvh] max-w-xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>AI-populated offerings</DialogTitle>
          </DialogHeader>

          {discovering ? (
            progressProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Reading your website...</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{progressProducts.length}</span> offering
                  {progressProducts.length === 1 ? "" : "s"} so far...
                </p>
                <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
                  {progressProducts.map((p, i) => (
                    <li key={i} className="px-3 py-2 text-sm">
                      {p.name || <span className="text-muted-foreground">...</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )
          ) : error ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-destructive">{error}</p>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={close}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : products ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{products.length}</span> offering
                  {products.length === 1 ? "" : "s"}. Review and choose which to add.
                </p>
                <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={products.length > 0 && selected.size === products.length}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    aria-label="Select all offerings"
                  />
                  Select all
                </label>
              </div>
              {/* Compact cards below md, per this platform's own rule that a table of rows
                  never scrolls horizontally or gets cramped on a small screen -- three
                  columns (checkbox/name/website) in a <Table> was unreadable on a phone. */}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                <div className="divide-y md:hidden">
                  {products.map((p, i) => (
                    <label key={i} className="flex items-start gap-3 p-3">
                      <Checkbox
                        checked={selected.has(i)}
                        onCheckedChange={(checked) => toggleRow(i, checked === true)}
                        aria-label={`Select ${p.name}`}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{p.name}</p>
                        {p.description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                        ) : null}
                        {p.website ? (
                          <a
                            href={p.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="break-all text-xs text-primary underline-offset-2 hover:underline"
                          >
                            {p.website}
                          </a>
                        ) : (
                          <p className="text-xs text-muted-foreground">No offering page found</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Name</TableHead>
                      <TableHead>Website</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(i)}
                            onCheckedChange={(checked) => toggleRow(i, checked === true)}
                            aria-label={`Select ${p.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {p.name}
                          {p.description ? (
                            <p className="mt-0.5 text-xs font-normal text-muted-foreground">{p.description}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.website ? (
                            <a
                              href={p.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              {p.website}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={close} disabled={importing}>
                  Cancel
                </Button>
                <Button onClick={confirmImport} disabled={importing || selected.size === 0}>
                  {importing
                    ? "Adding..."
                    : `Add ${selected.size} offering${selected.size === 1 ? "" : "s"}`}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
