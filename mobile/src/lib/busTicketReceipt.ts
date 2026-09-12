import { IssuedTicket } from "../types/busTicketing";
import { TicketData } from "./printing";

function verificationCode(ticketId: string) {
  const digits = ticketId.replace(/\D/g, "");
  return digits.slice(-6).padStart(6, "0");
}

export function buildBusTicketPrintData(ticket: IssuedTicket, company?: any): TicketData {
  const amount = Number(ticket.totalAmount || ticket.price || 0);
  const routeParts = [
    ticket.routeName,
    ticket.boardingPoint ? `From: ${ticket.boardingPoint}` : null,
    ticket.dropOffPoint ? `To: ${ticket.dropOffPoint}` : null,
  ].filter(Boolean);

  return {
    invoice: {
      invoiceNumber: ticket.id,
      total: amount.toFixed(2),
      createdAt: ticket.issuedAt,
      issueDate: ticket.issuedAt,
      currency: ticket.currency || "USD",
      paymentMethod: ticket.paymentMethod || "Cash",
      receiptTitle: "BUS TICKET",
      verificationCode: verificationCode(ticket.id),
      notes: "Bus passenger ticket",
      _offline: !ticket.isSynced,
      customer: {
        name: ticket.passengerName,
        phone: ticket.phone,
      },
      items: [
        {
          name: "Bus Ticket",
          description: routeParts.join(" | "),
          quantity: ticket.quantity || 1,
          price: ticket.price || amount,
          unitPrice: ticket.price || amount,
          lineTotal: amount,
          taxRate: 0,
          taxCode: "NT",
        },
      ],
    },
    company: {
      name: company?.tradingName || company?.name || "Bus Ticketing",
      tin: "",
      vatNumber: "",
      vatRegistered: false,
      tradingName: company?.tradingName || company?.name || "Bus Ticketing",
      address: company?.address || "",
      city: company?.city || "",
      phone: company?.phone || "",
      posSettings: {
        ...(company?.posSettings || {}),
        receiptFooter: company?.posSettings?.receiptFooter || "Keep this ticket for inspection",
      },
    },
    items: [
      {
        name: "Bus Ticket",
        description: routeParts.join(" | "),
        quantity: ticket.quantity || 1,
        price: ticket.price || amount,
        unitPrice: ticket.price || amount,
        lineTotal: amount,
        taxRate: 0,
        taxCode: "NT",
      },
    ],
    cashierName: ticket.conductorName,
    paidAmount: amount,
    currencySymbol: ticket.currency === "ZWG" ? "ZWG" : "$",
    suppressTaxDetails: true,
  };
}
