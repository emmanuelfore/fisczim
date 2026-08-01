import { Link, useLocation } from "wouter";
import {
  Users,
  CalendarCheck,
  Banknote,
  FileSpreadsheet,
  Settings,
  PieChart,
  Briefcase,
  FileBarChart2,
  Landmark,
  UserRound,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { cn } from "@/lib/utils";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from "@/components/ui/select";

const hrNavigation = [
  { name: "Home", href: "/hr", icon: PieChart },
  { name: "Employees", href: "/hr/employees", icon: Users },
  { name: "Processing", href: "/hr/payroll", icon: FileSpreadsheet },
  { name: "Leave", href: "/hr/leave", icon: CalendarCheck },
  { name: "Loans & Advances", href: "/hr/loans", icon: Banknote },
  { name: "Self-Service", href: "/hr/self-service", icon: UserRound },
];

const hrSetupNav = [
  { name: "Settings", href: "/hr/setup", icon: Settings },
];

const hrReportsNav = [
  { name: "ZIMRA Compliance", href: "/hr/reports/zimra", icon: FileBarChart2 },
  { name: "Statutory Remittances", href: "/hr/reports/remittances", icon: Landmark },
];

export function HRLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  function NavItem({ item }: { item: { name: string; href: string; icon: any } }) {
    const isActive = location === item.href || (item.href !== "/hr" && location.startsWith(item.href + "/"));
    return (
      <Link href={item.href}>
        <a className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-base font-medium transition-all duration-200 group relative",
          isActive
            ? "bg-blue-50/60 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/10"
            : "text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800"
        )}>
          {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full" />}
          <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")} />
          {item.name}
        </a>
      </Link>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col md:flex-row gap-6 min-h-[calc(100vh-8rem)]">
        {/* Sidebar */}
        <aside className="w-full md:w-56 shrink-0">
          {/* Mobile Navigation */}
          <div className="md:hidden sticky top-4 z-10 mb-4 bg-white/80 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 py-1 mb-2">HR Menu</h4>
            <Select 
              value={[...hrNavigation, ...hrSetupNav, ...hrReportsNav].find(item => location === item.href || (item.href !== "/hr" && location.startsWith(item.href + "/")))?.href || "/hr"} 
              onValueChange={(href) => {
                window.location.href = href;
              }}
            >
              <SelectTrigger className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Main</SelectLabel>
                  {hrNavigation.map(item => <SelectItem key={item.name} value={item.href}>{item.name}</SelectItem>)}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Setup</SelectLabel>
                  {hrSetupNav.map(item => <SelectItem key={item.name} value={item.href}>{item.name}</SelectItem>)}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Reports</SelectLabel>
                  {hrReportsNav.map(item => <SelectItem key={item.name} value={item.href}>{item.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex sticky top-6 flex-col gap-1">
            <div className="mb-3 px-3 py-2">
              <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                HR &amp; Payroll
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Enterprise Management</p>
            </div>

            <nav className="flex flex-col gap-0.5 px-1">
              {hrNavigation.map(item => <NavItem key={item.name} item={item} />)}
            </nav>

            <div className="mt-3 px-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-2">Setup</p>
              <nav className="flex flex-col gap-0.5">
                {hrSetupNav.map(item => <NavItem key={item.name} item={item} />)}
              </nav>
            </div>

            <div className="mt-3 px-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-2">Reports</p>
              <nav className="flex flex-col gap-0.5">
                {hrReportsNav.map(item => <NavItem key={item.name} item={item} />)}
              </nav>
            </div>

            <div className="mt-6 mx-3 px-4 py-5 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl" />
              <Briefcase className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mb-2" />
              <h3 className="font-semibold text-indigo-900 dark:text-indigo-300 text-xs">Need help?</h3>
              <p className="text-xs text-indigo-700/70 dark:text-indigo-400/70 mt-1 leading-relaxed">
                Zimbabwe statutory defaults (PAYE tables, NSSA, NEC) are pre-loaded. Review them in Settings before the first payroll run.
              </p>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 bg-white/50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-xl">
          <div className="p-6 md:p-8">{children}</div>
        </main>
      </div>
    </Layout>
  );
}

