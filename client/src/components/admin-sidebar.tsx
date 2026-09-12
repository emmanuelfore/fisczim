import { Link, useLocation } from "wouter";
import { Building2, ChevronRight, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/hooks/use-branding";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCompanies } from "@/hooks/use-companies";
import { useAuth } from "@/hooks/use-auth";
import { useState, useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// LEKAKU Admin Sidebar — structure + theme per spec, but keeps original menu items
const SIDEBAR_BG = "#FAF8F2";
const SIDEBAR_BORDER = "#EDE9DD";
const SIDEBAR_TEXT = "#10231A";
const SIDEBAR_MUTED = "#5A6660";
const SIDEBAR_ACTIVE = "#0E7A4F";

type NavItem = {
  label: string;
  icon: any;
  href?: string;
  children?: NavItem[];
};

function isActive(href: string | undefined, current: string) {
  if (!href) return false;
  if (href === "/dashboard") return current === "/dashboard" || current === "/";
  return current === href || current.startsWith(href + "/");
}

function isGroupActive(item: NavItem, current: string): boolean {
  if (isActive(item.href, current)) return true;
  if (item.children) return item.children.some((c) => isGroupActive(c, current));
  return false;
}

function CompanyAvatarCollapsed() {
  const { user } = useAuth();
  const { activeCompany, setCompany } = useActiveCompany(!!user, (user as any)?.id ?? null) as any;
  const { data: list = [] } = useCompanies(!!user, (user as any)?.id ?? null) as any;
  const [, setLocation] = useLocation();
  if (!activeCompany) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="w-10 h-10 mx-auto rounded-[10px] flex items-center justify-center cursor-pointer overflow-hidden relative" style={{ background: "#fff", border: `1px solid ${SIDEBAR_BORDER}` }} title={activeCompany.name}>
          {activeCompany.logoUrl ? <img src={activeCompany.logoUrl} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-4 h-4" style={{ color: SIDEBAR_ACTIVE }} />}
          <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-white" style={{ background: activeCompany.zimraEnvironment === "production" ? "#10b981" : "#f59e0b" }} />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-60 max-h-[400px] overflow-y-auto bg-white rounded-xl shadow-2xl p-1 z-[70]" style={{ border: `1px solid ${SIDEBAR_BORDER}` }}>
        <div className="px-1 py-1">
          {(list || []).map((company: any) => (
            <DropdownMenuItem
              key={company.id}
              onClick={() => setCompany(company.id)}
              className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer mb-0.5"
              style={activeCompany.id === company.id ? { background: "#ECFDF5", color: SIDEBAR_ACTIVE } : { color: "#475569" }}
            >
              <span className="text-xs font-medium truncate">{company.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => setLocation("/onboarding")} className="flex items-center justify-center gap-2 p-2.5 text-white font-bold cursor-pointer rounded-[10px] text-xs mt-1" style={{ background: SIDEBAR_ACTIVE }}>
            <Plus className="w-3.5 h-3.5" />
            <span>Register Enterprise</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CompanySelectorMini() {
  const { user } = useAuth();
  const { activeCompany, setCompany } = useActiveCompany(!!user, (user as any)?.id ?? null) as any;
  const { data: list = [] } = useCompanies(!!user, (user as any)?.id ?? null) as any;
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const arr = (list || []).filter((c: any) => !q || c.name.toLowerCase().includes(q));
    return [...arr].sort((a: any, b: any) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return da - db;
    });
  }, [list, query]);
  if (!activeCompany) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="rounded-[10px] p-2.5 flex items-center gap-3 cursor-pointer hover:bg-white transition-colors" style={{ background: "#fff", border: `1px solid ${SIDEBAR_BORDER}` }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden" style={{ background: SIDEBAR_BG, border: `1px solid ${SIDEBAR_BORDER}` }}>
            {activeCompany.logoUrl ? <img src={activeCompany.logoUrl} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-4 h-4" style={{ color: SIDEBAR_ACTIVE }} />}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-[13px] font-semibold truncate leading-none" style={{ color: SIDEBAR_TEXT }}>{activeCompany.name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: activeCompany.zimraEnvironment === "production" ? "#10b981" : "#f59e0b" }} />
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: activeCompany.zimraEnvironment === "production" ? "#059669" : "#d97706" }}>{activeCompany.zimraEnvironment === "production" ? "Production" : "Test Environment"}</span>
            </div>
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60 max-h-[400px] overflow-y-auto bg-white rounded-xl shadow-2xl p-1 z-[70]" style={{ border: `1px solid ${SIDEBAR_BORDER}` }}>
        <div className="px-2 py-2 sticky top-0 bg-white z-10 border-b mb-1" style={{ borderColor: SIDEBAR_BORDER }}>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search companies..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 border-none rounded-lg focus:outline-none text-slate-700 placeholder:text-slate-400"
              style={{ ["--tw-ring-color" as any]: SIDEBAR_ACTIVE } as any}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <div className="px-1 py-1">
          {filtered.map((company: any) => (
            <DropdownMenuItem
              key={company.id}
              onClick={() => setCompany(company.id)}
              className={cn(
                "flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all duration-200 mb-0.5",
                activeCompany.id === company.id ? "" : "text-slate-600",
              )}
              style={activeCompany.id === company.id ? { background: "#ECFDF5", color: SIDEBAR_ACTIVE } : undefined}
            >
              <div
                className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold relative"
                style={activeCompany.id === company.id ? { background: "#A7F3D0", color: "#065F46" } : { background: "#F1F5F9", color: "#94A3B8" }}
              >
                {company.logoUrl ? <img src={company.logoUrl} className="w-full h-full object-contain rounded" /> : company.name.substring(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-medium truncate">{company.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => setLocation("/onboarding")}
            className="flex items-center justify-center gap-2 p-2.5 text-white font-bold cursor-pointer rounded-[10px] shadow-sm active:scale-95 transition-all text-xs mt-1"
            style={{ background: SIDEBAR_ACTIVE }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Enterprise</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminSidebar({
  collapsed = false,
  navItems,
  onToggleCollapse,
  onNavigate,
  forceVisible = false,
}: {
  collapsed?: boolean;
  navItems: NavItem[];
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  /** Render visible below lg too (used inside the mobile drawer). */
  forceVisible?: boolean;
}) {
  const [location] = useLocation();
  const { brand } = useBranding();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) =>
    setOpenGroups((s) => ({ ...s, [label]: !s[label] }));

  if (collapsed && !forceVisible) {
    return (
      <aside
        className="fixed left-0 bottom-0 z-10 hidden lg:flex flex-col"
        style={{ width: 72, top: 10, height: "calc(100vh - 10px)", background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BORDER}` }}
      >
        <div className="h-[80px] flex items-center justify-center shrink-0 relative overflow-hidden" style={{ borderBottom: `1px solid rgba(255,255,255,0.12)`, background: "linear-gradient(135deg, #0E7A4F 0%, #0A5C3C 100%)" }}>
          <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: "#064E3B" }} />
          <div className="w-10 h-10 rounded-[10px] bg-white flex items-center justify-center shadow-sm">
            <img src={brand.logo} alt={brand.name} className="h-6 w-6 object-contain rounded" />
          </div>
          {onToggleCollapse && (
            <button onClick={onToggleCollapse} title="Expand menu" className="absolute bottom-1 right-1 w-5 h-5 rounded-md bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
              <PanelLeftOpen className="w-3 h-3" />
            </button>
          )}
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isGroupActive(item, location);
            const href = item.href || item.children?.[0]?.href || "#";
            return (
              <Link key={item.label} href={href}>
                <div
                  className="w-10 h-10 mx-auto rounded-[8px] flex items-center justify-center transition-colors"
                  style={{ background: active ? SIDEBAR_ACTIVE : "transparent", color: active ? "#fff" : SIDEBAR_TEXT }}
                  title={item.label}
                >
                  <item.icon className="w-5 h-5" />
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-2">
          <CompanyAvatarCollapsed />
        </div>
      </aside>
    );
  }

  return (
    <>
      {/* Extended header — 300px wide, below page content */}
      <div
        className={`${forceVisible ? "flex" : "hidden lg:flex"} fixed left-0 z-20 items-center overflow-hidden`}
        style={{
          top: 10,
          width: 300,
          height: 80,
          background: "linear-gradient(135deg, #0E7A4F 0%, #0A5C3C 100%)",
          borderBottom: `1px solid rgba(255,255,255,0.12)`,
          borderRadius: "0 0 14px 0",
          boxShadow: "0 8px 24px rgba(10,92,60,0.28), 0 2px 6px rgba(16,35,26,0.12)",
          padding: "0 20px 0 20px",
        }}
      >
        <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: "#064E3B" }} />
        <div aria-hidden className="absolute -right-10 -top-16 w-44 h-44 rounded-full" style={{ background: "radial-gradient(circle, rgba(123,227,168,0.22) 0%, transparent 70%)" }} />
        <div aria-hidden className="absolute right-16 bottom-0 w-24 h-10 rounded-full" style={{ background: "rgba(255,255,255,0.06)", filter: "blur(12px)" }} />
        <div className="relative flex items-center w-full">
          <img src={brand.logo} alt={brand.name} className="h-9 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
          {onToggleCollapse && !forceVisible && (
            <button onClick={onToggleCollapse} title="Collapse menu" className="ml-auto shrink-0 w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white">
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
          {forceVisible && onNavigate && (
            <button onClick={onNavigate} title="Close menu" className="ml-auto shrink-0 w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <aside
        className={`${forceVisible ? "flex" : "hidden lg:flex"} fixed left-0 z-10 flex-col`}
        style={{ width: 236, top: 90, bottom: 0, background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BORDER}` }}
      >

      <nav className="flex-1 overflow-y-auto py-4" style={{ paddingLeft: 16, paddingRight: 16 }}>
        <div className="space-y-1">
          {navItems.map((item) => {
            const hasChildren = !!item.children?.length;
            const active = isActive(item.href, location);
            const groupActive = isGroupActive(item, location);
            const isOpen = openGroups[item.label] ?? groupActive;

            if (hasChildren) {
              return (
                <div key={item.label} className="space-y-1">
                  <button
                    onClick={() => toggleGroup(item.label)}
                    className={cn("w-full flex items-center justify-between rounded-[8px] transition-colors text-left")}
                    style={{
                      height: 44,
                      padding: "0 12px",
                      background: groupActive ? SIDEBAR_ACTIVE : "transparent",
                      color: groupActive ? "#fff" : SIDEBAR_TEXT,
                    }}
                  >
                    <span className="flex items-center gap-3 text-[14px] font-medium" style={{ gap: 12 }}>
                      <item.icon className="w-[20px] h-[20px] shrink-0" style={{ color: groupActive ? "#fff" : SIDEBAR_TEXT }} />
                      {item.label}
                    </span>
                    <ChevronRight className={cn("w-4 h-4 transition-transform", isOpen && "rotate-90")} style={{ color: groupActive ? "#fff" : SIDEBAR_MUTED }} />
                  </button>
                  {isOpen && (
                    <div className="space-y-0.5" style={{ paddingLeft: 32 }}>
                      {item.children!.map((child) => {
                        const childHasChildren = !!child.children?.length;
                        if (childHasChildren) {
                          const childGroupActive = isGroupActive(child, location);
                          const childOpen = openGroups[child.label] ?? childGroupActive;
                          return (
                            <div key={child.label} className="space-y-0.5">
                              <button
                                onClick={() => toggleGroup(child.label)}
                                className="w-full flex items-center justify-between rounded-[8px] px-3 h-8 text-[13px] transition-colors text-left"
                                style={{ color: childGroupActive ? SIDEBAR_ACTIVE : SIDEBAR_MUTED, fontWeight: childGroupActive ? 600 : 400, background: childGroupActive ? "#EDE9DD" : "transparent" }}
                              >
                                <span className="flex items-center">
                                  {child.label}
                                </span>
                                <ChevronRight className={cn("w-3 h-3 transition-transform", childOpen && "rotate-90")} />
                              </button>
                              {childOpen && (
                                <div className="space-y-0.5" style={{ paddingLeft: 16 }}>
                                  {child.children!.map((grand) => {
                                    const ca = isActive(grand.href, location);
                                    return (
                                      <Link key={grand.label} href={grand.href!}>
                                        <div
                                          className="h-7 flex items-center rounded-[8px] px-3 text-[12px] transition-colors"
                                          style={{ color: ca ? SIDEBAR_ACTIVE : SIDEBAR_MUTED, fontWeight: ca ? 600 : 400, background: ca ? "#EDE9DD" : "transparent" }}
                                        >
                                          {grand.label}
                                        </div>
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }
                        const ca = isActive(child.href, location);
                        return (
                          <Link key={child.label} href={child.href!}>
                            <div
                              className="h-8 flex items-center rounded-[8px] px-3 text-[13px] transition-colors"
                              style={{ color: ca ? SIDEBAR_ACTIVE : SIDEBAR_MUTED, fontWeight: ca ? 600 : 400, background: ca ? "#EDE9DD" : "transparent" }}
                            >
                              {child.label}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link key={item.label} href={item.href!}>
                <div
                  className="w-full flex items-center rounded-[8px] transition-colors"
                  style={{ height: 44, padding: "0 12px", gap: 12, background: active ? SIDEBAR_ACTIVE : "transparent", color: active ? "#fff" : SIDEBAR_TEXT, fontSize: 14, fontWeight: 500 }}
                >
                  <item.icon className="w-[20px] h-[20px] shrink-0" style={{ color: active ? "#fff" : SIDEBAR_TEXT }} />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 p-3" style={{ marginTop: "auto" }}>
        <CompanySelectorMini />
      </div>
    </aside>
    </>
  );
}
