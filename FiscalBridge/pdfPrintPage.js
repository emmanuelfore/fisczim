/**
 * Hidden-window renderer used by printPdfFile() in pdfPrintWindow.js.
 * Renders every PDF page to a canvas sized to A4 so the document can be sent
 * through webContents.print({ deviceName }) — Chromium cannot print a PDF
 * loaded directly (it renders a blank page), and the old Windows path relied
 * on a shell "Print" verb that ignored the configured printer.
 */
const fs = require('node:fs');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const PAGE_WIDTH_PX = 794; // 210mm at 96dpi
const PAGE_HEIGHT_PX = 1122;
const RENDER_SCALE = 2; // keeps text crisp on 600dpi printers

pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

async function render() {
  const filePath = new URLSearchParams(location.search).get('file');
  if (!filePath) throw new Error('No PDF file provided');

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  const host = document.getElementById('pages');

  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const fit = Math.min(PAGE_WIDTH_PX / base.width, PAGE_HEIGHT_PX / base.height);
      const viewport = page.getViewport({ scale: fit * RENDER_SCALE });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(base.width * fit)}px`;
      canvas.style.height = `${Math.floor(base.height * fit)}px`;

      const frame = document.createElement('div');
      frame.className = 'page';
      frame.appendChild(canvas);
      host.appendChild(frame);

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  document.documentElement.dataset.pdfPrintState = 'ready';
}

render().catch((err) => {
  document.documentElement.dataset.pdfPrintState = 'error';
  document.documentElement.dataset.pdfPrintError = String((err && err.message) || err);
});
