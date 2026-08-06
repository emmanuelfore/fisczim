import { Resend } from 'resend';

interface EmailSettings {
    apiKey?: string;
    fromEmail?: string;
    fromName?: string;
}

export async function sendInvoiceEmail(to: string, invoiceNumber: string, pdfBuffer: Buffer, settings?: EmailSettings) {
    // Use DB settings or fallback to process.env
    const apiKey = settings?.apiKey || process.env.RESEND_API_KEY;
    const fromEmail = settings?.fromEmail || 'onboarding@resend.dev';
    const fromName = settings?.fromName || 'Invoicing App';

    if (!apiKey) {
        console.warn("Resend API Key is missing (neither in DB specific settings nor ENV). Email sending skipped.");
        // Simulate success for dev/demo if no key
        return true;
    }

    const resend = new Resend(apiKey);

    try {
        const fromAddress = fromEmail.includes('<') ? fromEmail : `${fromName} <${fromEmail}>`;

        const data = await resend.emails.send({
            from: fromAddress,
            to: [to],
            subject: `Invoice ${invoiceNumber}`,
            html: `
        <h1>Invoice ${invoiceNumber}</h1>
        <p>Please find attached your invoice.</p>
        <p>Thank you for your business!</p>
      `,
            attachments: [
                {
                    filename: `Invoice-${invoiceNumber}.pdf`,
                    content: pdfBuffer,
                },
            ],
        });

        return data;
    } catch (error: any) {
        console.error("Failed to send email with Resend:", error?.message || error);
        throw new Error("Failed to send email: " + (error?.message || "Unknown error"));
    }
}

export async function sendPayslipEmail(to: string, employeeName: string, periodLabel: string, pdfBuffer: Buffer, settings?: EmailSettings) {
    // Use DB settings or fallback to process.env
    const apiKey = settings?.apiKey || process.env.RESEND_API_KEY;
    const fromEmail = settings?.fromEmail || 'onboarding@resend.dev';
    const fromName = settings?.fromName || 'Payroll';

    if (!apiKey) {
        console.warn("Resend API Key is missing (neither in DB specific settings nor ENV). Email sending skipped.");
        // Simulate success for dev/demo if no key
        return true;
    }

    const resend = new Resend(apiKey);

    try {
        const fromAddress = fromEmail.includes('<') ? fromEmail : `${fromName} <${fromEmail}>`;

        const data = await resend.emails.send({
            from: fromAddress,
            to: [to],
            subject: `Your Payslip - ${periodLabel}`,
            html: `
        <h2>${employeeName}</h2>
        <p>Please find attached your payslip for the period <strong>${periodLabel}</strong>.</p>
        <p>This is a computer-generated payslip and does not require a signature.</p>
      `,
            attachments: [
                {
                    filename: `Payslip-${periodLabel.replace(/[^a-zA-Z0-9]+/g, '-')}-${employeeName.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`,
                    content: pdfBuffer,
                },
            ],
        });

        return data;
    } catch (error: any) {
        console.error("Failed to send payslip email with Resend:", error?.message || error);
        throw new Error("Failed to send payslip email: " + (error?.message || "Unknown error"));
    }
}

export async function sendApprovalRequestEmail(to: string, approverName: string, requestTitle: string, requesterName: string, companyName: string, settings?: EmailSettings) {
    const apiKey = settings?.apiKey || process.env.RESEND_API_KEY;
    const fromEmail = settings?.fromEmail || 'onboarding@resend.dev';
    const fromName = settings?.fromName || 'Approvals System';

    if (!apiKey) {
        console.warn("Resend API Key is missing. Email sending skipped.");
        return true;
    }

    const resend = new Resend(apiKey);

    try {
        const fromAddress = fromEmail.includes('<') ? fromEmail : `${fromName} <${fromEmail}>`;

        const data = await resend.emails.send({
            from: fromAddress,
            to: [to],
            subject: `Action Required: Pending Approval Request - ${requestTitle}`,
            html: `
        <h2>Hello ${approverName},</h2>
        <p>A new approval request requires your attention in <strong>${companyName}</strong>.</p>
        <p><strong>Title:</strong> ${requestTitle}</p>
        <p><strong>Requested By:</strong> ${requesterName}</p>
        <br />
        <p>Please log in to the system to review and approve or reject this request.</p>
      `,
        });

        return data;
    } catch (error: any) {
        console.error("Failed to send approval email with Resend:", error?.message || error);
        throw new Error("Failed to send approval email: " + (error?.message || "Unknown error"));
    }
}
