import { cn } from "@/lib/utils";

function getDocumentLabel(document: any) {
  const rawType = String(
    document.transactionType || document.documentType || document.type || "",
  ).toLowerCase();
  if (rawType.includes("credit")) return "CN";
  if (rawType.includes("debit")) return "DN";
  return "Ref";
}

export function LinkedDocumentChips({
  invoice,
  compact = false,
  onNavigate,
}: {
  invoice: any;
  compact?: boolean;
  onNavigate: (id: number) => void;
}) {
  const links = Array.isArray(invoice.linkedDocuments)
    ? invoice.linkedDocuments
    : [];
  const hasOriginal = Boolean(
    invoice.relatedInvoiceId && invoice.relatedInvoiceNumber,
  );

  if (!hasOriginal && links.length === 0) return null;

  const chipClass = compact
    ? "inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-600 hover:border-slate-300 hover:text-primary"
    : "inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:border-slate-300 hover:text-primary";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1",
        compact ? "mt-1" : "mt-1.5",
      )}
    >
      {hasOriginal && (
        <button
          type="button"
          className={chipClass}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(invoice.relatedInvoiceId);
          }}
          title={`Original document ${invoice.relatedInvoiceNumber}`}
        >
          <span className="shrink-0 text-slate-400">Ref</span>
          <span className="truncate font-mono">
            {invoice.relatedInvoiceNumber}
          </span>
        </button>
      )}
      {links.map((document: any) => (
        <button
          key={document.id}
          type="button"
          className={chipClass}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(document.id);
          }}
          title={`Linked document ${document.invoiceNumber}`}
        >
          <span className="shrink-0 text-slate-400">
            {getDocumentLabel(document)}
          </span>
          <span className="truncate font-mono">{document.invoiceNumber}</span>
        </button>
      ))}
    </div>
  );
}
