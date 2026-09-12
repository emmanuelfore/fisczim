import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface PayslipData {
  companyName: string;
  employeeName: string;
  employeeId: string;
  period: string;
  earnings: Array<{ name: string; amount: number }>;
  deductions: Array<{ name: string; amount: number }>;
  grossPay: number;
  netPay: number;
  auditRef: string;
}

export async function generatePayslipPdf(data: PayslipData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const margin = 50;

  let y = height - margin;

  // Title
  page.drawText(data.companyName, { x: margin, y, size: 20, font: boldFont });
  y -= 25;
  page.drawText('Payslip', { x: margin, y, size: 16, font });
  y -= 25;

  // Employee Info
  page.drawText(`Employee: ${data.employeeName} (${data.employeeId})`, { x: margin, y, size: 12, font });
  page.drawText(`Period: ${data.period}`, { x: width - margin - 150, y, size: 12, font });
  y -= 40;

  // Table Headers
  page.drawText('Earnings', { x: margin, y, size: 14, font: boldFont });
  page.drawText('Deductions', { x: width / 2, y, size: 14, font: boldFont });
  y -= 20;

  const startY = y;
  
  // Earnings
  let leftY = startY;
  for (const e of data.earnings) {
    page.drawText(e.name, { x: margin, y: leftY, size: 10, font });
    page.drawText(e.amount.toFixed(2), { x: width / 2 - 50, y: leftY, size: 10, font });
    leftY -= 15;
  }

  // Deductions
  let rightY = startY;
  for (const d of data.deductions) {
    page.drawText(d.name, { x: width / 2, y: rightY, size: 10, font });
    page.drawText(d.amount.toFixed(2), { x: width - margin - 50, y: rightY, size: 10, font });
    rightY -= 15;
  }

  y = Math.min(leftY, rightY) - 30;

  // Totals
  page.drawText(`Gross Pay: ${data.grossPay.toFixed(2)}`, { x: margin, y, size: 12, font: boldFont });
  page.drawText(`Net Pay: ${data.netPay.toFixed(2)}`, { x: width / 2, y, size: 12, font: boldFont });

  y -= 40;
  
  // Audit Reference
  page.drawText('Audit Reference:', { x: margin, y, size: 10, font: boldFont, color: rgb(0.5, 0.5, 0.5) });
  y -= 15;
  page.drawText(data.auditRef, { x: margin, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });

  return await pdfDoc.save();
}
