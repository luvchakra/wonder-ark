import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { StatCard } from "@cofounderai/core/ui/stat-card";
import { Badge } from "@cofounderai/core/ui/badge";
import { BreakdownBars } from "@cofounderai/core/ui/breakdown-bars";
import { inr } from "@cofounderai/core/lib/format";
import type { ComplianceDashboard } from "../../lib/dashboard/types";

/** `/gst`'s new dashboard -- KPIs + a collected-tax breakdown for the current month.
 * Same KPI-card + BreakdownBars visual language the discovery/inventory/fsm
 * dashboards already use. */
export function ComplianceDashboardView({ businessId, data }: { businessId: string; data: ComplianceDashboard }) {
  const base = `/dashboard/businesses/${businessId}/gst`;
  const collectedBreakdown = [
    { key: "cgst", label: "CGST", value: data.cgstCollected },
    { key: "sgst", label: "SGST", value: data.sgstCollected },
    { key: "igst", label: "IGST", value: data.igstCollected },
  ];

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {/* PLATFORM-NAV-P0-02.4: the four buttons that sat here (GST Profile, e-Way Bill,
          e-Invoicing, GST Filing) only repeated the menu. What is left is the one link
          that matters when it matters: a missing GST profile opens the page that fixes it. */}
      {data.gstin ? (
        <Badge variant="outline" className="w-fit gap-1.5">
          <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
          GSTIN {data.gstin}
        </Badge>
      ) : (
        <Link href={`${base}/profile`} className="w-fit rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <Badge variant="destructive" className="gap-1.5">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            GST profile not set up
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Badge>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Payable (month)" value={inr.format(data.payableThisMonth)} detail="input tax credit" />
        <StatCard label="Collected (month)" value={inr.format(data.collectedThisMonth)} detail="output tax" />
        <StatCard label="e-Invoices (month)" value={data.einvoicesThisMonth} />
        <StatCard
          label="GSTIN risk"
          value={data.riskCount}
          detail={data.riskCount > 0 ? "missing/invalid this month" : "none this month"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Collected tax, this month</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars items={collectedBreakdown} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">e-Invoicing &amp; e-Way Bill setup</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">e-Invoice GSP credentials</span>
              <Badge variant={data.einvoiceConfigured ? "outline" : "secondary"}>
                {data.einvoiceConfigured ? "Configured" : "Not set up"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">e-Way Bill GSP credentials</span>
              <Badge variant={data.ewayBillConfigured ? "outline" : "secondary"}>
                {data.ewayBillConfigured ? "Configured" : "Not set up"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
