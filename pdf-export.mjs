const fonts = [
  ["Montserrat-Medium.ttf", "Montserrat", "normal"],
  ["OpenSans-Regular.ttf", "Open Sans", "normal"],
  ["OpenSans-Bold.ttf", "Open Sans", "bold"],
  ["OpenSans-Italic.ttf", "Open Sans", "italic"],
];

const ink = 20;
const tableLeft = 60;
const tableRight = 553;
const columnWidths = [70, 201, 88, 90];
const columnX = [89, 163, 444, 553];
const columnAlign = ["center", "left", "right", "right"];
let resources;

async function loadResources() {
  const [, ...files] = await Promise.all([
    import("./vendor/jspdf/jspdf.umd.min.js"),
    ...fonts.map(async ([filename]) => {
      const response = await fetch(new URL("./assets/fonts/" + filename, import.meta.url));
      if (!response.ok) throw new Error("Could not load an invoice font.");
      return response.arrayBuffer();
    }),
  ]);
  return { jsPDF: globalThis.jspdf.jsPDF, files };
}

function binaryString(bytes) {
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return parts.join("");
}

async function loadLogo(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

export async function createInvoicePdf(invoice) {
  resources ??= loadResources().catch((error) => {
    resources = null;
    throw error;
  });
  const [{ jsPDF, files }, logo] = await Promise.all([
    resources,
    invoice.logo ? loadLogo(invoice.logo) : null,
  ]);
  const doc = new jsPDF({ format: "a4", unit: "pt", compress: true, putOnlyUsedFonts: true });
  fonts.forEach(([filename, family, style], index) => {
    doc.addFileToVFS(filename, binaryString(new Uint8Array(files[index])));
    doc.addFont(filename, family, style);
  });
  doc.setProperties({ title: "Invoice " + invoice.number });
  doc.setTextColor(ink);

  function lines(text, width, size = 11, style = "normal", family = "Open Sans") {
    doc.setFont(family, style);
    doc.setFontSize(size);
    return text.split("\n").flatMap((line) => line ? doc.splitTextToSize(line, width) : [""]);
  }

  function write(content, x, y, { size = 11, style = "normal", family = "Open Sans", align = "left", leading = size * 1.25 } = {}) {
    doc.setFont(family, style);
    doc.setFontSize(size);
    content.forEach((line, index) => {
      if (line) doc.text(line, x, y + index * leading, { align, baseline: "top" });
    });
    return content.length * leading;
  }

  function paragraph(text, x, y, width, options = {}) {
    return write(lines(text, width, options.size, options.style, options.family), x, y, options);
  }

  function rule(x1, x2, y, dotted = false) {
    doc.setDrawColor(dotted ? 88 : ink);
    doc.setLineWidth(.55);
    doc.setLineDashPattern(dotted ? [.6, .9] : [], 0);
    doc.line(x1, y, x2, y);
    doc.setLineDashPattern([], 0);
  }

  if (logo) {
    const scale = Math.min(110 / logo.naturalWidth, 76 / logo.naturalHeight);
    const width = logo.naturalWidth * scale;
    const height = logo.naturalHeight * scale;
    doc.addImage(logo, "PNG", 491 - width / 2, 29, width, height);
  } else if (invoice.initials) {
    doc.setFillColor(ink);
    doc.roundedRect(465, 32, 52, 52, 8, 8, "F");
    doc.setTextColor(255);
    paragraph(invoice.initials, 491, 48, 48, { align: "center", style: "bold", size: 20 });
    doc.setTextColor(ink);
  }

  const issuerEnd = 116 + paragraph(invoice.business, 467, 116, 231, { size: 12, style: "bold", align: "center", leading: 16 });
  const addressEnd = issuerEnd + paragraph(invoice.address, 467, issuerEnd, 231, {
    size: 10, style: "italic", align: "center", leading: 13.5,
  });

  const titleY = Math.max(210, addressEnd + 28);
  const titleLines = lines(invoice.labels.title, 480, 48.5, "normal", "Montserrat");
  const titleHeight = write(titleLines, 70, titleY, { family: "Montserrat", size: 48.5, leading: 55 });

  const metaY = Math.max(288, titleY + titleHeight + 23);
  const numberLabelHeight = paragraph(invoice.labels.number, 72, metaY, 236, { style: "bold", size: 12, leading: 16 });
  const numberHeight = paragraph(invoice.number, 72, metaY + numberLabelHeight, 236, { size: 12, leading: 16 });
  const dateLabelHeight = paragraph(invoice.labels.date, 345, metaY, 112, { style: "bold", size: 12, leading: 16 });
  const dateHeight = paragraph(invoice.date, 470, metaY, 80, { size: 12, leading: 16 });

  const clientY = Math.max(324, metaY + Math.max(numberLabelHeight + numberHeight, dateLabelHeight, dateHeight) + 4);
  const clientLabelHeight = paragraph(invoice.labels.client, 72, clientY + 13, 67, { style: "bold", size: 12, leading: 14 });
  const clientHeight = paragraph(invoice.client, 147, clientY, 378, { style: "bold", size: 12, leading: 16 });
  const clientAddressHeight = paragraph(invoice.clientAddress, 147, clientY + clientHeight, 378, { style: "italic", size: 10, leading: 13 });

  let page = 1;
  const bodyLimit = 771;
  const continuationTop = 74;
  const rowGap = invoice.rows.length >= 4 ? 5 : 10;
  const headings = ["quantity", "description", "price", "amount"];
  const headerLines = headings.map((key, i) => lines(invoice.labels[key], columnWidths[i], 12, "bold"));

  function tableHeader(y) {
    rule(tableLeft, tableRight, y, true);
    const heights = headerLines.map((content, i) => write(content, columnX[i], y + 7, {
      style: "bold", size: 12, align: columnAlign[i], leading: 16,
    }));
    const bottom = y + Math.max(32, ...heights) + 10;
    rule(tableLeft, tableRight, bottom, true);
    return bottom + 10;
  }

  function nextPage() {
    page++;
    doc.addPage();
    paragraph(invoice.number, 72, 43, 470, { style: "bold", size: 11 });
  }

  const tableTop = Math.max(384, clientY + Math.max(13 + clientLabelHeight, clientHeight + clientAddressHeight) + 14);
  if (tableTop > bodyLimit - 100) nextPage();
  let firstRowY = tableHeader(page === 1 ? tableTop : continuationTop);
  let y = firstRowY;
  for (const [quantity, description, price, total] of invoice.rows) {
    const descriptionLines = lines(description, columnWidths[1], 10);
    let offset = 0;
    const lineHeight = 13.5;
    while (offset < descriptionLines.length) {
      const remaining = descriptionLines.length - offset;
      const available = Math.floor((bodyLimit - y - rowGap - 2) / lineHeight);
      if (available < 1 || (offset === 0 && y > firstRowY && available < remaining)) {
        nextPage();
        firstRowY = tableHeader(continuationTop);
        y = firstRowY;
        continue;
      }
      const count = Math.min(remaining, available);
      let valuesHeight = 0;
      if (!offset) {
        [quantity, price, total].forEach((value, index) => {
          const column = [0, 2, 3][index];
          const height = paragraph(value, columnX[column], y, columnWidths[column], { align: columnAlign[column], size: 11 });
          valuesHeight = Math.max(valuesHeight, height);
        });
      }
      write(descriptionLines.slice(offset, offset + count), columnX[1], y, { size: 10, leading: lineHeight });
      y += Math.max(count * lineHeight, valuesHeight) + rowGap;
      offset += count;
    }
  }

  const tableBottom = page === 1 ? Math.max(510, y + 3) : y + 3;
  rule(tableLeft, tableRight, tableBottom, true);

  const bankFields = [["bank", invoice.bank], ["account", invoice.account]].filter(([, value]) => value);
  const amountFields = [["subtotal", invoice.subtotal], ["vat", invoice.vat], ["total", invoice.total]];
  const bankHeight = bankFields.reduce((height, [key, value]) => (
    height + (lines(invoice.labels[key], 181, 12, "bold").length + lines(value, 181, 12).length) * 15 + 5
  ), 0);
  const totalHeight = amountFields.reduce((height, [key, value]) => {
    const size = key === "total" ? 14 : 10;
    const labelRows = lines(invoice.labels[key], 191, size, "bold").length;
    const valueRows = lines(value, 96, size, "bold").length;
    return height + Math.max(labelRows, valueRows) * (size + 3) + (key === "total" ? 0 : 7);
  }, 0);
  const summaryHeight = Math.max(bankHeight, totalHeight);
  const signatureStyle = { size: 12, style: "bold", align: "center", leading: 15 };
  const signatureHeight = Math.max(2, lines(invoice.labels.recipient, 180, 12, "bold").length,
    lines(invoice.labels.signatory, 180, 12, "bold").length) * 15;
  const contactHeight = lines(invoice.contact, 485, 10).length * 13;
  const footerY = Math.min(725, 813 - signatureHeight - contactHeight - 20);
  let summaryY = tableBottom + 20;
  if (summaryY + summaryHeight + 18 > footerY) {
    nextPage();
    summaryY = continuationTop;
  }
  let bankY = summaryY;
  for (const [key, value] of bankFields) {
    bankY += paragraph(invoice.labels[key], tableLeft, bankY, 181, { style: "bold", size: 12, leading: 15 });
    bankY += paragraph(value, tableLeft, bankY, 181, { size: 12, leading: 15 }) + 5;
  }
  if (bankFields.length) {
    doc.setDrawColor(155);
    doc.setLineWidth(2);
    doc.line(255, summaryY, 255, summaryY + summaryHeight);
  }
  let totalsY = summaryY + 2;
  for (const [key, value] of amountFields) {
    const size = key === "total" ? 14 : 10;
    const options = { style: "bold", size, leading: size + 3 };
    const labelHeight = paragraph(invoice.labels[key], 275, totalsY, 191, options);
    const valueHeight = paragraph(value, 565, totalsY, 96, { ...options, align: "right" });
    totalsY += Math.max(labelHeight, valueHeight) + 7;
  }

  rule(50, 233, footerY);
  rule(362, 545, footerY);
  paragraph(invoice.labels.recipient, 141.5, footerY + 5, 180, signatureStyle);
  paragraph(invoice.labels.signatory, 453.5, footerY + 5, 180, signatureStyle);
  if (invoice.contact) {
    const contactRule = footerY + signatureHeight + 9;
    rule(tableLeft, tableRight, contactRule, true);
    paragraph(invoice.contact, doc.internal.pageSize.getWidth() / 2, contactRule + 13, 485, {
      align: "center", size: 10, leading: 13,
    });
  }
  return doc.output("blob");
}
