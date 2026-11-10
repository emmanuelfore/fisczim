import { createContext, useContext } from "react";

export interface ReportExportColumn {
  /** Field name on the row object. */
  key: string;
  /** Header written to the CSV. Defaults to `key`. */
  header?: string;
}

export interface ReportExportDef {
  /** Filename stem; the hub appends the active date range. */
  label: string;
  columns: ReportExportColumn[];
  rows: any[];
}

type ExportBuilder = () => ReportExportDef;

export const ReportExportContext = createContext<{
  register: (build: ExportBuilder) => void;
}>({
  register: () => {},
});

/**
 * Call inside a report component to feed the Reports Hub header Export CSV
 * button. The builder is re-registered on every render, so the button always
 * downloads the rows currently on screen — post date range, search and
 * zero-activity filters — without lifting data fetching out of the report.
 */
export function useReportExport(build: ExportBuilder) {
  useContext(ReportExportContext).register(build);
}
