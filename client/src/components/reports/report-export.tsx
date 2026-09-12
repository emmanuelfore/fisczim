import { createContext, useContext, useEffect } from "react";

export interface ReportExportDef {
  rows: any[];
  columns: string[];
  filename: string;
}

export const ReportExportContext = createContext<{
  register: (def: ReportExportDef | null) => void;
}>({
  register: () => {},
});

/**
 * Call inside any report component to feed the header Export CSV button.
 * The report passes its currently filtered rows + raw field columns; the
 * button stays disabled until a report registers (so export works for every
 * report without lifting each one's data fetching up).
 */
export function useReportExport(def: ReportExportDef | null) {
  const { register } = useContext(ReportExportContext);
  const key = def
    ? `${def.filename}:${def.columns.join(",")}:${def.rows.length}`
    : "none";
  useEffect(() => {
    register(def);
    return () => register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
