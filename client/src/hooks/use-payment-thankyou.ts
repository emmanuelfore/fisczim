import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/**
 * WhatsApp "thank you for your payment" helper.
 *
 * The message (and the vehicle ref inside it) is resolved server-side because
 * the link from an invoice to its vehicle lives in the `vehicles` table. The
 * client only opens the returned wa.me link, and it must do that synchronously
 * in the click handler — opening it after an await is swallowed by popup
 * blockers, which is why the context is prefetched and cached here.
 */

export type PaymentThankYouContext = {
  message: string;
  phone: string | null;
  waLink: string | null;
  vehicleRef: string | null;
  stockNumber: string | null;
  vehicleId: number | null;
  customerName: string | null;
  hasPhone: boolean;
};

const key = (companyId: number, invoiceId: number, amount: number, currency: string) => [
  "/api/invoices",
  invoiceId,
  "payment-thankyou",
  companyId,
  amount,
  currency,
];

export function usePaymentThankYou(
  companyId: number,
  invoiceId: number | null,
  amount: number,
  currency: string,
  enabled = true,
) {
  return useQuery({
    queryKey: key(companyId, invoiceId ?? 0, amount, currency),
    enabled: !!companyId && !!invoiceId && enabled,
    queryFn: async () => {
      const url = `/api/companies/${companyId}/invoices/${invoiceId}/payment-thankyou?amount=${encodeURIComponent(
        amount,
      )}&currency=${encodeURIComponent(currency)}`;
      const res = await apiFetch(url);
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = typeof body?.error === "string" ? body.error : "";
        } catch {
          detail = "";
        }
        throw new Error(detail || "Failed to load WhatsApp thank-you");
      }
      return (await res.json()) as PaymentThankYouContext;
    },
  });
}

export function useLogPaymentThankYou(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      invoiceId: number;
      amount?: number;
      currency?: string;
      message?: string;
    }) => {
      const res = await apiFetch(
        `/api/companies/${companyId}/invoices/${input.invoiceId}/payment-thankyou`,
        { method: "POST", body: JSON.stringify(input) },
      );
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = typeof body?.error === "string" ? body.error : "";
        } catch {
          detail = "";
        }
        throw new Error(detail || "Failed to log thank-you");
      }
      return res.json();
    },
    onSuccess: (_data, { invoiceId, amount, currency }) => {
      // The vehicle reminder history changed; refresh the prefetched context
      // so a second send shows the latest message.
      queryClient.invalidateQueries({ queryKey: key(companyId, invoiceId, amount ?? 0, currency ?? "") });
    },
  });
}
