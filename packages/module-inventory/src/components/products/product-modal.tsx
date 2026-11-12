"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { GST_RATE_SLABS } from "@cofounderai/core/lib/gst";
import type { LookupOption, Product } from "../../lib/products/types";

export type ProductActionState = { error: string } | { success: true } | null;

/**
 * Create/edit product form -- ported from stockpilot-ai-ops's Products dialog into this
 * platform's own hand-rolled overlay pattern (see WarehouseModal/CreateBusinessModal).
 * Category is a free-text field (find-or-create by name, same as upstream) rather than a
 * select, since the original never built a category picker either.
 */
export function ProductModal({
  action,
  product,
  categoryName,
  suppliers,
  onToggleStatus,
  onClose,
}: {
  action: (prevState: ProductActionState, formData: FormData) => Promise<ProductActionState>;
  /** Present when editing an existing product; absent when creating one. */
  product?: Product;
  /** The product's resolved category name, looked up by the caller (category_id ->
   * name) since this form edits the name, not the id. */
  categoryName?: string;
  suppliers: LookupOption[];
  /** PLATFORM-NAV-P0-02.2: editing only. Activates an inactive product or deactivates an
   * active one -- the action that used to sit on every row of the list beside Edit. */
  onToggleStatus?: () => Promise<void>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<ProductActionState, FormData>(action, null);
  const [toggling, startToggle] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    inputRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (state && "success" in state) onClose();
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-100 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        className={`relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <h2 id="product-modal-title" className="text-lg font-semibold">
          {product ? "Edit product" : "New product"}
        </h2>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-sku">SKU</Label>
              <Input ref={inputRef} id="p-sku" name="sku" required defaultValue={product?.sku ?? ""} placeholder="SKU-1001" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" name="name" required defaultValue={product?.name} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-brand">Brand</Label>
              <Input id="p-brand" name="brand" defaultValue={product?.brand ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-barcode">Barcode</Label>
              <Input id="p-barcode" name="barcode" defaultValue={product?.barcode ?? ""} placeholder="EAN / UPC / Code128" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-category">Category</Label>
              <Input id="p-category" name="category" defaultValue={categoryName ?? ""} placeholder="Beauty" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-supplier">Preferred supplier</Label>
              <NativeSelect id="p-supplier" name="supplier_id" defaultValue={product?.supplier_id ?? ""}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-unit">Unit</Label>
              <Input id="p-unit" name="unit" defaultValue={product?.unit ?? "pcs"} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-hsn">HSN code</Label>
              <Input id="p-hsn" name="hsn_code" defaultValue={product?.hsn_code ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-tax">GST rate</Label>
              <NativeSelect id="p-tax" name="tax_rate" defaultValue={String(product?.tax_rate ?? 18)}>
                {GST_RATE_SLABS.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-cost">Cost price</Label>
              <Input id="p-cost" name="cost_price" type="number" min={0} step="0.01" defaultValue={product?.cost_price ?? 0} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-price">Selling price</Label>
              <Input id="p-price" name="selling_price" type="number" min={0} step="0.01" defaultValue={product?.selling_price ?? 0} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-reorder-point">Reorder point</Label>
              <Input id="p-reorder-point" name="reorder_point" type="number" min={0} defaultValue={product?.reorder_point ?? 0} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-reorder-qty">Reorder quantity</Label>
              <Input id="p-reorder-qty" name="reorder_quantity" type="number" min={0} defaultValue={product?.reorder_quantity ?? 0} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-description">Description</Label>
            <Textarea id="p-description" name="description" rows={3} defaultValue={product?.description ?? ""} />
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {toggleError ? <p className="text-sm text-destructive">{toggleError}</p> : null}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            {product && onToggleStatus ? (
              <Button
                type="button"
                variant="outline"
                disabled={toggling}
                onClick={() => {
                  setToggleError(null);
                  startToggle(async () => {
                    try {
                      await onToggleStatus();
                      onClose();
                    } catch (error) {
                      setToggleError(error instanceof Error ? error.message : "Could not change the product's status.");
                    }
                  });
                }}
              >
                {product.status === "active" ? "Deactivate" : "Activate"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <SubmitButton pendingText={product ? "Saving..." : "Creating..."}>
                {product ? "Save changes" : "Create product"}
              </SubmitButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
