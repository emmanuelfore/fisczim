import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatMoney } from '../../shared/currency.js';

export interface PayslipData {
  companyName: string;
  employeeName: string;
  employeeId: string;
  period: string;
  periodStart?: string;
  periodEnd?: string;
  /** Display form carrying the sign: "$", "M" for loti, "ZiG". Never a hardcoded "$". */
  currency: string;
  currencyCode: string;
  nationalId?: string | null;
  taxNumber?: string | null;
  nssaNumber?: string | null;
  earnings: Array<{ name: string; amount: number }>;
  deductions: Array<{ name: string; amount: number }>;
  grossPay: number;
  netPay: number;
  /** What the employer pays on top of gross: its own levies. Employees ask. */
  employerCost?: number | null;
  taxYear?: number;
  ytd?: {
    gross: number;
    paye: number;
    nssa: number;
    aids: number;
    net: number;
    runs: number;
  };
  /** Which band table produced these figures, so a dispute can name it. */
  taxTableLabel?: string;
  auditRef: string;
}

const MARGIN = 50;
const GREY = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.8, 0.82, 0.86);

/** pdf-lib encodes text as WinAnsi, so anything outside Latin-1 has to be folded. */
function safeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/•/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7e\x80-\xff]/g, '');
}

function money(amount: unknown, currencyCode: string): string {
  return safeText(formatMoney(amount, currencyCode));
}

export async function generatePayslipPdf(data: PayslipData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const right = width - MARGIN;
  const mid = width / 2;
  const currency = data.currencyCode ?? data.currency;
  const show = (amount: unknown) => money(amount, currency);

  let y = height - MARGIN;

  page.drawText(safeText(data.companyName), { x: MARGIN, y, size: 20, font: boldFont });
  y -= 22;
  page.drawText('PAYSLIP', { x: MARGIN, y, size: 12, font, color: GREY });
  page.drawText(`${safeText(data.currency)}`, { x: right - 90, y, size: 12, font: boldFont, color: GREY });
  y -= 14;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: RULE });
  y -= 22;

  // Who is being paid, in the identifiers the revenue authority recognises.
  const periodLine = data.periodStart && data.periodEnd
    ? `${safeText(data.periodStart)} to ${safeText(data.periodEnd)}`
    : safeText(data.period);
  const infoLines = [
    [`Employee: ${safeText(data.employeeName)}`, `Period: ${periodLine}`],
    [`Staff no: ${safeText(data.employeeId)}`, `Tax year: ${safeText(data.taxYear ?? periodLine.slice(0, 4))}`],
    [`ID: ${safeText(data.nationalId ?? '-')}`, `PAYE no: ${safeText(data.taxNumber ?? '-')}`],
    [`NSSA no: ${safeText(data.nssaNumber ?? '-')}`, `Audit ref: ${safeText(data.auditRef)}`],
  ];
  for (const [leftText, rightText] of infoLines) {
    page.drawText(leftText, { x: MARGIN, y, size: 9, font });
    page.drawText(rightText, { x: mid + 20, y, size: 9, font });
    y -= 13;
  }
  y -= 12;

  // Earnings and deductions, side by side.
  page.drawText('Earnings', { x: MARGIN, y, size: 11, font: boldFont });
  page.drawText('Deductions', { x: mid + 20, y, size: 11, font: boldFont });
  y -= 16;

  const startY = y;
  let leftY = startY;
  for (const earning of data.earnings) {
    page.drawText(safeText(earning.name), { x: MARGIN, y: leftY, size: 9, font });
    page.drawText(show(earning.amount), { x: mid - 70, y: leftY, size: 9, font });
    leftY -= 14;
  }
  let rightY = startY;
  for (const deduction of data.deductions) {
    page.drawText(safeText(deduction.name), { x: mid + 20, y: rightY, size: 9, font });
    page.drawText(show(deduction.amount), { x: right, y: rightY, size: 9, font });
    rightY -= 14;
  }

  y = Math.min(leftY, rightY) - 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: RULE });
  y -= 20;

  page.drawText(`Gross Pay: ${show(data.grossPay)}`, { x: MARGIN, y, size: 11, font: boldFont });
  if (data.employerCost != null) {
    page.drawText(`Employer cost: ${show(data.employerCost)}`, { x: mid + 20, y, size: 9, font, color: GREY });
  }
  y -= 24;
  page.drawText(`NET PAY: ${show(data.netPay)}`, { x: MARGIN, y, size: 14, font: boldFont });
  y -= 30;

  // Year to date. Without it an employee cannot see why a marginal band moved their
  // month, and the cumulative PAYE is what the annual P6 certificate must agree with.
  if (data.ytd) {
    page.drawText(`YEAR TO DATE (${safeText(data.taxYear ?? '')} - ${data.ytd.runs} run${data.ytd.runs === 1 ? '' : 's'})`, {
      x: MARGIN, y, size: 9, font: boldFont, color: GREY,
    });
    y -= 14;
    const ytdColumns: Array<[string, number]> = [
      ['Gross', data.ytd.gross],
      ['PAYE', data.ytd.paye],
      ['NSSA', data.ytd.nssa],
      ['AIDS levy', data.ytd.aids],
      ['Net', data.ytd.net],
    ];
    const columnWidth = (right - MARGIN) / ytdColumns.length;
    ytdColumns.forEach(([label, amount], index) => {
      const x = MARGIN + index * columnWidth;
      page.drawText(safeText(label), { x, y, size: 8, font, color: GREY });
      page.drawText(show(amount), { x, y: y - 12, size: 9, font: boldFont });
    });
    y -= 30;
  }

  if (data.taxTableLabel) {
    page.drawText(`Tax table: ${safeText(data.taxTableLabel)}`, { x: MARGIN, y, size: 8, font, color: GREY });
    y -= 12;
    page.drawText('Rates applied by this table are shown on the earnings and deductions above.', {
      x: MARGIN, y, size: 8, font, color: GREY,
    });
    y -= 26;
  }

  // Signature block. A wage paid in cash or by a shared account is still a wage, and
  // the signed slip is what settles "I never received it" later.
  const ruleY = y;
  page.drawLine({ start: { x: MARGIN, y: ruleY }, end: { x: mid - 30, y: ruleY }, thickness: 0.8, color: GREY });
  page.drawLine({ start: { x: mid + 20, y: ruleY }, end: { x: right - 30, y: ruleY }, thickness: 0.8, color: GREY });
  page.drawText('Received by (employee)', { x: MARGIN, y: ruleY - 12, size: 8, font, color: GREY });
  page.drawText('Date', { x: mid + 20, y: ruleY - 12, size: 8, font, color: GREY });
  page.drawText('Prepared by', { x: MARGIN, y: ruleY - 46, size: 8, font, color: GREY });
  page.drawLine({ start: { x: MARGIN, y: ruleY - 34 }, end: { x: mid - 30, y: ruleY - 34 }, thickness: 0.8, color: GREY });
  page.drawLine({ start: { x: mid + 20, y: ruleY - 34 }, end: { x: right - 30, y: ruleY - 34 }, thickness: 0.8, color: GREY });
  page.drawText('Approved by', { x: mid + 20, y: ruleY - 46, size: 8, font, color: GREY });

  return await pdfDoc.save();
}
