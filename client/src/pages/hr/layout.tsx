import { Layout } from "@/components/layout";

export function HRLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout>
      <div className="flex flex-col gap-6 min-h-[calc(100vh-8rem)]">
        {/* Main */}
        <main className="flex-1 min-w-0 bg-white/50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-xl">
          <div className="p-6 md:p-8">{children}</div>
        </main>
      </div>
    </Layout>
  );
}

