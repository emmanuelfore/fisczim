import { usePrinterContext } from "../contexts/PrinterContext";
export { PrinterConfig } from "../contexts/PrinterContext";

export function usePrinter() {
  return usePrinterContext();
}
