/**
 * PDF Export utility for MetsaData forest analysis reports.
 * Uses jspdf + html2canvas (dynamically imported to keep bundle small).
 */

export async function generatePdfReport({ title, forestType, forestAge, areaHectares, generatedDate, onProgress }) {
  onProgress('Loading PDF library...', 0);

  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  // Landscape A4: 297×210mm, 10mm margins → 277×190mm content area
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 277;
  const pageH = 190;
  const marginX = 10;
  const marginY = 10;

  // --- Cover Page ---
  onProgress('Creating cover page...', 5);

  doc.setFontSize(24);
  doc.setTextColor(26, 71, 42); // #1a472a
  doc.text('MetsaData Forest Analysis Report', marginX, 50);

  doc.setFontSize(14);
  doc.setTextColor(80, 80, 80);
  doc.text(`Forest Type: ${forestType}`, marginX, 70);
  doc.text(`Area: ${areaHectares} hectares`, marginX, 80);
  doc.text(`Forest Age: ${forestAge} years`, marginX, 90);
  doc.text(`Generated: ${generatedDate}`, marginX, 100);

  // Horizontal rule
  doc.setDrawColor(26, 71, 42);
  doc.setLineWidth(0.5);
  doc.line(marginX, 110, marginX + pageW, 110);

  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text('This report was generated from Sentinel-2 satellite data analysis.', marginX, 120);

  // --- Capture Sections ---
  const sections = document.querySelectorAll('[data-pdf-section]');
  const totalSections = sections.length;
  let cursorY = marginY; // Y position on current page

  for (let i = 0; i < totalSections; i++) {
    const section = sections[i];
    const sectionName = section.getAttribute('data-pdf-section') || `Section ${i + 1}`;
    const pct = 10 + (i / totalSections) * 80;
    onProgress(`Capturing ${sectionName}...`, pct);

    let canvas;
    try {
      canvas = await html2canvas(section, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        ignoreElements: (el) => el.hasAttribute('data-pdf-exclude'),
      });
    } catch (err) {
      console.warn(`Failed to capture section "${sectionName}":`, err);
      continue;
    }

    // Convert to JPEG to keep file size manageable
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgWidthPx = canvas.width;
    const imgHeightPx = canvas.height;

    // Fit to page width
    const imgW = pageW;
    const imgH = (imgHeightPx / imgWidthPx) * pageW;

    if (imgH <= pageH) {
      // Fits on one page (or remaining space)
      doc.addPage();
      cursorY = marginY;
      doc.addImage(imgData, 'JPEG', marginX, cursorY, imgW, imgH);
      cursorY += imgH + 5;
    } else {
      // Section taller than a page — slice into strips
      const stripHeightPx = Math.floor((pageH / imgH) * imgHeightPx);
      let offsetPx = 0;

      while (offsetPx < imgHeightPx) {
        doc.addPage();
        cursorY = marginY;

        const currentStripH = Math.min(stripHeightPx, imgHeightPx - offsetPx);
        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = imgWidthPx;
        stripCanvas.height = currentStripH;
        const ctx = stripCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, offsetPx, imgWidthPx, currentStripH, 0, 0, imgWidthPx, currentStripH);

        const stripData = stripCanvas.toDataURL('image/jpeg', 0.92);
        const stripMMH = (currentStripH / imgWidthPx) * pageW;
        doc.addImage(stripData, 'JPEG', marginX, cursorY, imgW, stripMMH);

        offsetPx += currentStripH;
      }
    }
  }

  // --- Page Footers ---
  onProgress('Adding footers...', 92);
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    const footerText = `MetsaData  |  Page ${p} of ${totalPages}  |  Generated ${generatedDate}`;
    const textWidth = doc.getTextWidth(footerText);
    doc.text(footerText, (297 - textWidth) / 2, 205);
  }

  // --- Save ---
  onProgress('Saving PDF...', 98);
  doc.save(`metsadata-report-${generatedDate}.pdf`);
}
