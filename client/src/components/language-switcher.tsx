import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();

  const option = (value: "en" | "zh") => (
    <DropdownMenuItem
      key={value}
      onClick={() => setLocale(value)}
      className="flex items-center justify-between p-2.5 rounded-lg cursor-pointer font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    >
      <span>{value === "zh" ? "简体中文" : "English"}</span>
      {locale === value && (
        <span className="w-2 h-2 rounded-full bg-blue-600" />
      )}
    </DropdownMenuItem>
  );

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 rounded-full border border-[#E5E7EB] bg-white text-[#64748B] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            title={t("Language")}
          >
            <Languages className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40 bg-white rounded-2xl shadow-2xl border-slate-200 p-1.5 mt-2">
          {option("en")}
          {option("zh")}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-xl border-slate-200 bg-white text-slate-700 font-semibold"
        >
          <Languages className="h-4 w-4 text-slate-400" />
          {locale === "zh" ? "简体中文" : "English"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 bg-white rounded-2xl shadow-2xl border-slate-200 p-1.5 mt-2">
        {option("en")}
        {option("zh")}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}