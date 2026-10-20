"use client";

import {
  AlertTriangle,
  Wallet,
  BookOpen,
  BookText,
  HandCoins,
  CalendarRange,
  ListChecks,
  ListTodo,
  Repeat,
  MessageCircle,
  Target,
  Package,
  Wrench,
  Inbox,
  Receipt,
  LayoutDashboard,
  Shield,
  Bell,
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderOpen,
  History,
  KeyRound,
  Landmark,
  LayoutGrid,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  Settings,
  ShoppingCart,
  Smartphone,
  Star,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";

const ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  Wallet,
  Repeat,
  BookOpen,
  BookText,
  HandCoins,
  CalendarRange,
  ListChecks,
  ListTodo,
  MessageCircle,
  Target,
  Package,
  Wrench,
  Inbox,
  Receipt,
  LayoutDashboard,
  Shield,
  Bell,
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderOpen,
  History,
  KeyRound,
  Landmark,
  LayoutGrid,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  Settings,
  ShoppingCart,
  Smartphone,
  Star,
  Truck,
  Users,
  Warehouse,
};

/** Resolves a module manifest's lucide-react icon name to its component, falling back
 * to a generic dashboard icon for a name this shell doesn't recognize yet. */
export function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className={className} />;
}

/** Each module's tile color, drawn from the existing palette (brand blue, the status
 * hues, the chart violet and brand cyan) -- no new colors. Static strings so Tailwind
 * sees them. Amber and cyan are light fills, so they carry dark glyphs. */
const APP_TILE: Record<string, string> = {
  discovery: "bg-brand-blue-action text-white",
  inventory: "bg-warning text-warning-foreground",
  fsm: "bg-success text-white",
  crm: "bg-chart-4 text-white",
  gst: "bg-brand-cyan text-brand-navy",
};

/**
 * A module's app tile: its icon on a rounded, colored square, the way an app launcher
 * shows apps (docs/DESIGN.md, "Approachable look"). One color per module, constant
 * across the rail, settings and billing, so a module is recognisable at a glance before
 * its name is read. Decorative -- the module name always sits beside it.
 */
export function ModuleAppIcon({
  moduleKey,
  name,
  className,
}: {
  moduleKey: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg shadow-xs",
        APP_TILE[moduleKey] ?? "bg-brand-blue-action text-white",
        className,
      )}
    >
      <ModuleIcon name={name} className="size-4" />
    </span>
  );
}
