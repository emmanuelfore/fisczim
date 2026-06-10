import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { findHsCodeSuggestions } from "@/lib/hs-code-suggestions";

interface HsCodeAssistantProps {
  initialQuery?: string;
  onSelect: (code: string) => void;
}

export function HsCodeAssistant({
  initialQuery = "",
  onSelect,
}: HsCodeAssistantProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const suggestions = useMemo(() => findHsCodeSuggestions(query), [query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-start gap-2 rounded-xl border-blue-200 bg-blue-50  font-semibold text-blue-700 hover:bg-blue-100 hover:text-blue-800"
        >
          <Sparkles className="h-4 w-4" />
          Find HS code
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle>HS code assistant</DialogTitle>
          <DialogDescription>
            Search by product or category to suggest an 8-digit HS code.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. maize meal, phone, cement, medicine"
            className="h-11 rounded-xl border-blue-100 bg-blue-50/40 pl-8 "
          />
        </div>

        <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
          {suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <div
                key={`${suggestion.code}-${suggestion.title}`}
                className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-white px-2 py-1 font-mono  font-bold text-[#0F172A] ring-1 ring-slate-200">
                        {suggestion.code}
                      </span>
                      <span className="truncate text-[11px] font-semibold text-[#64748B]">
                        {suggestion.chapter}
                      </span>
                    </div>
                    <p className="mt-1  font-semibold text-[#0F172A]">
                      {suggestion.title}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 rounded-xl border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    onClick={() => {
                      onSelect(suggestion.code);
                      setOpen(false);
                    }}
                  >
                    Use
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3  text-[#64748B]">
              No local match found. Try a broader term like "clothing",
              "furniture", "oil", "phone", or enter the 8-digit HS code
              manually.
            </div>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-[#64748B]">
          Suggestions are decision support for Zimbabwe HS classification.
          Confirm the final tariff line with the official ZIMRA/customs tariff
          for regulated or ambiguous goods.
        </p>
      </DialogContent>
    </Dialog>
  );
}
