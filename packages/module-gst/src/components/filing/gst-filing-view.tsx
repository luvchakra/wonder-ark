"use client";

import { AlertTriangle, Download, FileWarning, Receipt } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { StatCard } from "@cofounderai/core/ui/stat-card";
import { Label } from "@cofounderai/core/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cofounderai/core/ui/tabs";
import type { PurchaseRegister, SalesRegister } from "../../lib/filing/types";
import { formatDate, inr } from "@cofounderai/core/lib/format";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Ported from stockpilot-ai-ops's gst-filing.tsx -- purchase register (inward, for
 * GSTR-2B reconciliation / GSTR-3B) and sales register (outward, for GSTR-1), with the
 * same missing-GST-profile / composition-scheme banners and CSV exports. Period
 * selection is a plain GET form (`?period=YYYY-MM`, full page reload) rather than
 * client-side react-query, matching this codebase's own established filter convention
 * (native-select.tsx's own docstring) for what's otherwise the same read-only report. */
export function GstFilingView({
  businessName,
  period,
  gstin,
  gstRegistrationType,
  purchaseRegister,
  salesRegister,
}: {
  businessName: string;
  period: string;
  gstin: string | null;
  gstRegistrationType: string;
  purchaseRegister: PurchaseRegister;
  salesRegister: SalesRegister;
}) {
  const missingGstProfile = !gstin && gstRegistrationType !== "unregistered";
  const isComposition = gstRegistrationType === "composition";

  const exportPurchaseRegister = () => {
    const rows: (string | number)[][] = [
      ["Purchase register / ITC summary", businessName, period],
      [],
      ["PO number", "Order date", "Supplier", "Supplier GSTIN", "Taxable value", "CGST", "SGST", "IGST", "Total tax", "GSTIN status"],
      ...purchaseRegister.csvRows.map((r) => [
        r.po_number,
        r.order_date,
        r.supplier_name,
        r.supplier_gstin ?? "",
        r.subtotal,
        r.cgst,
        r.sgst,
        r.igst,
        r.cgst + r.sgst + r.igst,
        r.gstinStatus,
      ]),
      [],
      ["HSN-wise summary"],
      ["HSN code", "Taxable value", "Tax"],
      ...purchaseRegister.byHsn.map((h) => [h.hsn, h.taxableValue, h.tax]),
    ];
    downloadCsv(`gst-purchase-register-${period}.csv`, rows);
  };

  const exportSalesRegister = () => {
    const rows: (string | number)[][] = [
      ["Sales register / GSTR-1 outward supply", businessName, period],
      [],
      ["B2B invoices"],
      ["Invoice number", "Invoice date", "Customer", "Customer GSTIN", "Taxable value", "CGST", "SGST", "IGST", "Total tax"],
      ...salesRegister.b2b.map((r) => [r.invoiceNumber, r.invoiceDate, r.customerName, r.gstin, r.taxableValue, r.cgst, r.sgst, r.igst, r.cgst + r.sgst + r.igst]),
      [],
      ["B2C summary (by place of supply)"],
      ["State", "Taxable value", "Tax"],
      ...salesRegister.b2c.map((r) => [r.state, r.taxableValue, r.tax]),
      [],
      ["HSN-wise summary"],
      ["HSN code", "Taxable value", "Tax"],
      ...salesRegister.byHsn.map((h) => [h.hsn, h.taxableValue, h.tax]),
      [],
      ["Credit notes issued"],
      ["Credit note number", "Date", "Against invoice", "Taxable value", "CGST", "SGST", "IGST", "Total"],
      ...salesRegister.creditNotes.map((cn) => [
        cn.credit_note_number,
        cn.credit_note_date,
        cn.against_invoice_number,
        cn.subtotal,
        cn.cgst,
        cn.sgst,
        cn.igst,
        cn.subtotal + cn.cgst + cn.sgst + cn.igst,
      ]),
    ];
    downloadCsv(`gstr1-outward-supply-${period}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <form method="GET" className="space-y-2">
        <Label htmlFor="gst-period">Period</Label>
        <input
          id="gst-period"
          name="period"
          type="month"
          defaultValue={period}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="border-input flex h-9 w-48 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
        />
      </form>

      <Tabs defaultValue="inward">
        <TabsList>
          <TabsTrigger value="inward">Inward (Purchases)</TabsTrigger>
          <TabsTrigger value="outward">Outward (Sales)</TabsTrigger>
        </TabsList>

        <TabsContent value="inward" className="space-y-6">
          {/* PLATFORM-NAV-P0-02.4: one line of help per tab, where a boxed paragraph was. */}
          <p className="text-sm text-muted-foreground">
            Tax paid on your purchase orders: reconcile it against GSTR-2B and enter it in GSTR-3B.
          </p>

          {missingGstProfile ? (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Your business has no GSTIN on file, so purchase orders can&apos;t reliably split CGST/SGST vs. IGST. Set
                it in Tax &amp; GST → GST Profile first.
              </span>
            </div>
          ) : null}

          {isComposition ? (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Your business is registered under the <span className="font-medium">Composition Scheme</span> —
                composition dealers can&apos;t claim input tax credit on purchases. The tax below is a real cost to
                you, not a reclaimable credit; this register is for your own records, not for an ITC claim.
              </span>
            </div>
          ) : null}

          {/* A period with nothing in it has nothing to download, so the button is left
              out, not shown disabled; the cards below say the period is empty. */}
          {purchaseRegister.csvRows.length > 0 ? (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={exportPurchaseRegister}>
                <Download className="size-4" aria-hidden="true" />
                Export purchase register (CSV)
              </Button>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Taxable value" value={inr.format(purchaseRegister.taxableValue)} />
            <StatCard label="CGST" value={inr.format(purchaseRegister.cgst)} />
            <StatCard label="SGST" value={inr.format(purchaseRegister.sgst)} />
            <StatCard label="IGST" value={inr.format(purchaseRegister.igst)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Supplier-wise ITC summary</CardTitle>
            </CardHeader>
            <CardContent>
              {purchaseRegister.bySupplier.length === 0 ? (
                <p className="text-sm text-muted-foreground">No purchase orders in this period yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier</TableHead>
                        <TableHead>GSTIN</TableHead>
                        <TableHead className="text-right">Taxable value</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead>GSTIN status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseRegister.bySupplier.map((s) => (
                        <TableRow key={`${s.name}${s.gstin}`}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="font-mono text-xs">{s.gstin ?? "—"}</TableCell>
                          <TableCell className="text-right">{inr.format(s.taxableValue)}</TableCell>
                          <TableCell className="text-right">{inr.format(s.tax)}</TableCell>
                          <TableCell>
                            {s.risk === "missing" ? (
                              <Badge variant="destructive">
                                <FileWarning className="size-3" aria-hidden="true" />
                                No GSTIN — reverse charge?
                              </Badge>
                            ) : s.risk === "invalid" ? (
                              <Badge variant="destructive">
                                <FileWarning className="size-3" aria-hidden="true" />
                                Invalid GSTIN
                              </Badge>
                            ) : (
                              <Badge variant="outline">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">HSN-wise summary</CardTitle>
            </CardHeader>
            <CardContent>
              {purchaseRegister.byHsn.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to summarize yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>HSN code</TableHead>
                        <TableHead className="text-right">Taxable value</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseRegister.byHsn.map((h) => (
                        <TableRow key={h.hsn}>
                          <TableCell className="font-mono text-xs">{h.hsn}</TableCell>
                          <TableCell className="text-right">{inr.format(h.taxableValue)}</TableCell>
                          <TableCell className="text-right">{inr.format(h.tax)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outward" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Sales invoices by customer and HSN, split B2B and B2C, ready for GSTR-1.
          </p>

          {salesRegister.missingGstinCount > 0 || salesRegister.invalidGstinCount > 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {salesRegister.missingGstinCount > 0
                  ? `${salesRegister.missingGstinCount} invoice${salesRegister.missingGstinCount === 1 ? "" : "s"} this period ${salesRegister.missingGstinCount === 1 ? "has" : "have"} a customer with no GSTIN on file`
                  : null}
                {salesRegister.missingGstinCount > 0 && salesRegister.invalidGstinCount > 0 ? "; " : null}
                {salesRegister.invalidGstinCount > 0
                  ? `${salesRegister.invalidGstinCount} invoice${salesRegister.invalidGstinCount === 1 ? "" : "s"} ${salesRegister.invalidGstinCount === 1 ? "has" : "have"} an invalid customer GSTIN`
                  : null}{" "}
                — treated as B2C below.
              </span>
            </div>
          ) : null}

          {salesRegister.invoiceCount > 0 ? (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={exportSalesRegister}>
                <Download className="size-4" aria-hidden="true" />
                Export GSTR-1 outward supply (CSV)
              </Button>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Taxable value" value={inr.format(salesRegister.taxableValue)} />
            <StatCard label="CGST" value={inr.format(salesRegister.cgst)} />
            <StatCard label="SGST" value={inr.format(salesRegister.sgst)} />
            <StatCard label="IGST" value={inr.format(salesRegister.igst)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">B2B invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {salesRegister.b2b.length === 0 ? (
                <p className="text-sm text-muted-foreground">No B2B (GSTIN-registered customer) invoices this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>GSTIN</TableHead>
                        <TableHead className="text-right">Taxable value</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesRegister.b2b.map((r) => (
                        <TableRow key={r.invoiceNumber}>
                          <TableCell className="font-mono text-xs">
                            {r.invoiceNumber}
                            <div className="text-muted-foreground">{formatDate(r.invoiceDate)}</div>
                          </TableCell>
                          <TableCell className="font-medium">{r.customerName}</TableCell>
                          <TableCell className="font-mono text-xs">{r.gstin}</TableCell>
                          <TableCell className="text-right">{inr.format(r.taxableValue)}</TableCell>
                          <TableCell className="text-right">{inr.format(r.cgst + r.sgst + r.igst)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">B2C summary (by place of supply)</CardTitle>
            </CardHeader>
            <CardContent>
              {salesRegister.b2c.length === 0 ? (
                <p className="text-sm text-muted-foreground">No B2C (unregistered customer) invoices this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>State</TableHead>
                        <TableHead className="text-right">Taxable value</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesRegister.b2c.map((r) => (
                        <TableRow key={r.state}>
                          <TableCell className="font-medium">{r.state}</TableCell>
                          <TableCell className="text-right">{inr.format(r.taxableValue)}</TableCell>
                          <TableCell className="text-right">{inr.format(r.tax)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">HSN-wise summary</CardTitle>
            </CardHeader>
            <CardContent>
              {salesRegister.byHsn.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to summarize yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>HSN code</TableHead>
                        <TableHead className="text-right">Taxable value</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesRegister.byHsn.map((h) => (
                        <TableRow key={h.hsn}>
                          <TableCell className="font-mono text-xs">{h.hsn}</TableCell>
                          <TableCell className="text-right">{inr.format(h.taxableValue)}</TableCell>
                          <TableCell className="text-right">{inr.format(h.tax)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {salesRegister.creditNotes.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Credit notes issued</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Credit note</TableHead>
                        <TableHead>Against invoice</TableHead>
                        <TableHead className="text-right">Taxable value</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesRegister.creditNotes.map((cn) => (
                        <TableRow key={cn.id}>
                          <TableCell className="font-mono text-xs">
                            {cn.credit_note_number}
                            <div className="text-muted-foreground">{formatDate(cn.credit_note_date)}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{cn.against_invoice_number}</TableCell>
                          <TableCell className="text-right">{inr.format(cn.subtotal)}</TableCell>
                          <TableCell className="text-right">{inr.format(cn.cgst + cn.sgst + cn.igst)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm font-medium">
                  <span>Net outward taxable value / tax after credit notes</span>
                  <span>
                    {inr.format(salesRegister.netTaxableValue)} / {inr.format(salesRegister.netTax)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
