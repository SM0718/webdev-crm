import PDFDocument from 'pdfkit';
import { PDFParse } from 'pdf-parse';

import { paymentBreakdown } from './leadMoney.js';

const PAGE_MARGIN = 44;
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#4f46e5';

const rupees = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const safeFilePart = (value) =>
  String(value ?? 'lead')
    .replace(/[^a-z\d]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'lead';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const assignedName = (lead) => lead?.assignedTo?.name ?? lead?.assignedToName ?? 'Unassigned';

const fileNameFor = (lead) => `lead-${safeFilePart(lead.customerName)}-${String(lead._id).slice(-6)}.pdf`;

/**
 * One pass of the layout. `totalPages` is only known after a first pass has
 * been counted, so it may be `null` (that pass simply omits the footers).
 */
const render = (lead, totalPages) =>
  new Promise((resolve, reject) => {
    const money = paymentBreakdown(lead);
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      // Keep every page in memory: `addPage()` otherwise flushes the previous
      // page to the stream, which makes late footers impossible.
      bufferPages: true,
      info: { Title: `Lead - ${lead.customerName ?? 'Lead details'}` },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks) }));

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    let cursor = PAGE_MARGIN;

    const ensureRoom = (needed) => {
      if (cursor + needed > doc.page.height - PAGE_MARGIN - 24) {
        doc.addPage();
        cursor = PAGE_MARGIN;
      }
    };

    const heading = (text) => {
      ensureRoom(34);
      doc
        .fillColor(BRAND)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(text.toUpperCase(), PAGE_MARGIN, cursor, { characterSpacing: 0.6 });
      cursor += 15;
    };

    try {
      /* ---------------------------------------------------------- banner */
      doc.rect(0, 0, doc.page.width, 78).fill(BRAND);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19).text('Lead Details', PAGE_MARGIN, 26);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#c7d2fe')
        .text(`Generated ${formatDate(new Date())}  ·  Lead ID ${String(lead._id)}`, PAGE_MARGIN, 52);
      cursor = 104;

      /* -------------------------------------------------------- customer */
      heading('Customer');
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(15)
        .text(lead.customerName ?? '—', PAGE_MARGIN, cursor, { width: pageWidth });
      cursor += 22;
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(MUTED)
        .text(
          `Phone ${lead.phoneNumber || '—'}   ·   Niche ${lead.businessNiche || '—'}   ·   Rating ${lead.googleRating || '—'}`,
          PAGE_MARGIN,
          cursor,
          { width: pageWidth },
        );
      cursor += 16;

      if (lead.websiteStatus) {
        doc
          .fillColor(MUTED)
          .fontSize(9)
          .text(`Website status: ${lead.websiteStatus}`, PAGE_MARGIN, cursor, { width: pageWidth });
        cursor += 16;
      }

      if (lead.address) {
        ensureRoom(doc.heightOfString(lead.address, { width: pageWidth }) + 6);
        doc.fillColor(INK).fontSize(10).text(lead.address, PAGE_MARGIN, cursor, { width: pageWidth });
        cursor += doc.heightOfString(lead.address, { width: pageWidth }) + 6;
      }
      cursor += 10;

      /* -------------------------------------------------------- pipeline */
      heading('Pipeline');
      const pipelineRow = [
        ['Status', lead.status || '—'],
        ['Assigned to', assignedName(lead)],
        ['Created', formatDate(lead.createdAt)],
      ];
      const colWidth = pageWidth / 3;
      const rowTop = cursor;
      pipelineRow.forEach(([label, value], i) => {
        const x = PAGE_MARGIN + colWidth * i;
        doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x, rowTop, { width: colWidth - 8 });
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(value, x, rowTop + 11, { width: colWidth - 8 });
      });
      cursor = rowTop + 34;
      doc.moveTo(PAGE_MARGIN, cursor).lineTo(PAGE_MARGIN + pageWidth, cursor).lineWidth(1).strokeColor(LINE).stroke();
      cursor += 18;

      /* ----------------------------------------------------------- money */
      heading('Salesman payment');
      const cells = [
        ['Advance amount', rupees(money.advanceAmount)],
        ['Paid to salesman', rupees(money.amountPaidToSalesman)],
        ['Remaining', rupees(money.amountRemaining)],
        ['Paid', money.isPaid ? 'Yes' : money.advanceAmount > 0 ? 'No' : '—'],
      ];
      const boxGap = 8;
      const boxWidth = (pageWidth - boxGap * (cells.length - 1)) / cells.length;
      const boxTop = cursor;
      cells.forEach(([label, value], i) => {
        const x = PAGE_MARGIN + (boxWidth + boxGap) * i;
        doc.roundedRect(x, boxTop, boxWidth, 46, 6).fillAndStroke('#f8fafc', LINE);
        doc
          .fillColor(MUTED)
          .font('Helvetica')
          .fontSize(7.5)
          .text(label.toUpperCase(), x + 8, boxTop + 8, { width: boxWidth - 16 });
        doc
          .fillColor(i === 3 && money.isPaid ? '#047857' : INK)
          .font('Helvetica-Bold')
          .fontSize(11)
          .text(value, x + 8, boxTop + 22, { width: boxWidth - 16, ellipsis: true, lineBreak: false });
      });
      cursor = boxTop + 46 + 18;

      /* --------------------------------------------------------- remarks */
      const remarks = lead.remarks ?? [];
      heading(`Remarks (${remarks.length})`);

      if (remarks.length === 0) {
        doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9.5).text('No remarks recorded yet.', PAGE_MARGIN, cursor);
        cursor += 18;
      }

      for (const remark of remarks) {
        const text = `  ${remark.text}`;
        const height = doc.heightOfString(text, { width: pageWidth - 20 }) + 20;
        ensureRoom(height);
        doc.roundedRect(PAGE_MARGIN, cursor, pageWidth, height, 5).fill('#f8fafc');
        doc
          .fillColor(MUTED)
          .font('Helvetica')
          .fontSize(8.5)
          .text(
            `${remark.authorName ?? 'Unknown'}  ·  ${formatDate(remark.createdAt)}${remark.statusAtRemark ? `  ·  ${remark.statusAtRemark}` : ''}`,
            PAGE_MARGIN + 10,
            cursor + 6,
            { width: pageWidth - 20, lineBreak: false },
          );
        doc.fillColor(INK).fontSize(9.5).text(text, PAGE_MARGIN + 10, cursor + 19, { width: pageWidth - 20 });
        cursor += height + 7;
      }

      /* --------------------------------------------------------- footers */
      if (totalPages) {
        for (let i = 0; i < totalPages; i += 1) {
          doc.switchToPage(i);
          // The footer lives inside the bottom margin; without zeroing it
          // pdfkit treats the text as overflow and appends a blank page.
          const bottomMargin = doc.page.margins.bottom;
          doc.page.margins.bottom = 0;
          doc
            .fillColor(MUTED)
            .font('Helvetica')
            .fontSize(8)
            .text(
              `${lead.customerName}  ·  Confidential  ·  Page ${i + 1} of ${totalPages}`,
              PAGE_MARGIN,
              doc.page.height - 32,
              { width: pageWidth, align: 'center', lineBreak: false },
            );
          doc.page.margins.bottom = bottomMargin;
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });

const countPages = async (buffer) => {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const info = await parser.getInfo();
    return info?.total || info?.pages?.length || 1;
  } finally {
    await parser.destroy();
  }
};

/**
 * Renders a single lead to a PDF buffer: identity, pipeline state, the
 * salesman money trail, and the full remark history.
 *
 * Two passes: pdfkit cannot know how many pages it will produce up front, and
 * every footer has to read "Page X of Y", so the body is laid out once to
 * count pages and then re-rendered with the real total.
 */
export const buildLeadPdf = async (lead) => {
  const probe = await render(lead, null);
  const totalPages = Math.max(1, await countPages(probe.buffer));
  const { buffer } = await render(lead, totalPages);

  return { buffer, fileName: fileNameFor(lead), pageCount: totalPages };
};

export default buildLeadPdf;
