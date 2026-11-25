import { Link, useLocation } from "wouter";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

export function VehicleModuleNav() {
  const [location] = useLocation();
  const { can } = usePermissions();
  const links = [
    { href: "/vehicles", label: "Vehicles" },
    { href: "/vehicles/agreements", label: "Agreements" },
    { href: "/vehicles/statements", label: "Statements" },
    ...(can("vehicles.costs") ? [
      { href: "/vehicles/costing", label: "Costing" },
      { href: "/vehicles/profitability", label: "Profitability" },
    ] : []),
  ];
  return <nav aria-label="Vehicle imports" className="flex flex-wrap gap-1 border-b border-slate-200">
    {links.map(({ href, label }) => <Link
      key={href}
      href={href}
      aria-current={location === href ? "page" : undefined}
      className={cn("border-b-2 px-3 py-2 text-sm font-medium", location === href
        ? "border-blue-600 text-blue-700"
        : "border-transparent text-slate-600 hover:text-slate-900")}
    >{label}</Link>)}
  </nav>;
}
