import PDFDocument from "pdfkit";

// Client-facing billing document for the Invoices entity (see
// schema/invoices.ts) - deliberately simpler than quote-pdf.ts: no
// markup or derived internal-cost build-up, just billing line items,
// tax, and a total, since an invoice bills an already-agreed amount
// rather than working one out. Line items can optionally carry a cost
// category (same vocabulary as Quotes, see CATEGORY_LABELS below) for
// costs added beyond that agreed amount - rendered as a "[Category] "
// prefix rather than its own column, to keep this simpler layout.
export interface InvoicePdfData {
  invoiceNumber: string;
  title: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  clientName: string;
  clientContact: string;
  billingDetails: string;
  lineItems: { category: string | null; description: string; amount: number }[];
  taxRatePercent: number;
  currency: string;
  assignedByName: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  cpo_rate: "CPO Rate", overtime: "Overtime", vehicles: "Vehicle Costs", fuel_mileage: "Fuel / Mileage",
  accommodation: "Accommodation", flights_travel: "Flights / Travel", equipment: "Equipment",
  subcontractors: "Subcontractors", allowances: "Allowances / Per Diem", misc: "Miscellaneous",
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function drawSectionRule(doc: PDFKit.PDFDocument) {
  doc.moveDown(0.6);
  const y = doc.y;
  doc
    .strokeColor("#cccccc")
    .lineWidth(1)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke();
  doc.moveDown(0.6);
}

function drawMetaRows(doc: PDFKit.PDFDocument, rows: [string, string][]) {
  doc.fontSize(10).font("Helvetica");
  for (const [label, value] of rows) {
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value);
  }
}

export function buildInvoicePdf(data: InvoicePdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const generatedAt = new Date();

  doc.fontSize(20).font("Helvetica-Bold").text("VenueGuard Invoice");
  doc.moveDown(0.2);
  doc.fontSize(10).font("Helvetica").fillColor("#666666");
  doc.text(`Invoice Number: ${data.invoiceNumber}`);
  doc.text(`Status: ${data.status.toUpperCase()}`);
  doc.text(`Issued: ${new Date(data.createdAt).toLocaleDateString()}`);
  doc.text(`Due: ${data.dueDate ? new Date(data.dueDate).toLocaleDateString() : "—"}`);
  doc.text(`Generated: ${generatedAt.toLocaleString()}`);
  doc.fillColor("#000000");
  doc.moveDown(0.6);
  doc.fontSize(14).font("Helvetica-Bold").text(data.title || "Untitled Invoice");

  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Bill To");
  doc.moveDown(0.3);
  drawMetaRows(doc, [
    ["Client", data.clientName || "—"],
    ["Contact", data.clientContact || "—"],
    ["Billing Details", data.billingDetails || "—"],
  ]);

  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Line Items");
  doc.moveDown(0.4);

  const tableLeft = doc.page.margins.left;
  const tableRight = doc.page.width - doc.page.margins.right;
  const amountColWidth = 110;
  const descColWidth = tableRight - tableLeft - amountColWidth;

  doc.fontSize(10).font("Helvetica-Bold");
  const headerY = doc.y;
  doc.text("Description", tableLeft, headerY, { width: descColWidth });
  doc.text("Amount", tableLeft + descColWidth, headerY, { width: amountColWidth, align: "right" });
  doc.moveDown(0.3);
  doc.strokeColor("#000000").lineWidth(0.5).moveTo(tableLeft, doc.y).lineTo(tableRight, doc.y).stroke();
  doc.moveDown(0.4);

  doc.font("Helvetica");
  if (data.lineItems.length === 0) {
    doc.fillColor("#999999").text("No line items yet.");
    doc.fillColor("#000000");
  } else {
    for (const item of data.lineItems) {
      const rowY = doc.y;
      const label = item.category ? `[${CATEGORY_LABELS[item.category] ?? item.category}] ` : "";
      doc.text(`${label}${item.description || "—"}`, tableLeft, rowY, { width: descColWidth });
      const afterY = doc.y;
      doc.text(formatMoney(item.amount, data.currency), tableLeft + descColWidth, rowY, {
        width: amountColWidth,
        align: "right",
      });
      doc.y = Math.max(doc.y, afterY);
      doc.moveDown(0.3);
    }
  }
  doc.moveDown(0.2);
  doc.strokeColor("#000000").lineWidth(0.5).moveTo(tableLeft, doc.y).lineTo(tableRight, doc.y).stroke();
  doc.moveDown(0.4);

  const totalsRows: [string, string][] = [
    ["Subtotal", formatMoney(data.subtotal, data.currency)],
    [`Tax / VAT (${data.taxRatePercent}%)`, formatMoney(data.taxAmount, data.currency)],
  ];
  doc.fontSize(10).font("Helvetica");
  for (const [label, value] of totalsRows) {
    const rowY = doc.y;
    doc.font("Helvetica-Bold").text(label, tableLeft, rowY, { width: descColWidth });
    doc.font("Helvetica").text(value, tableLeft + descColWidth, rowY, { width: amountColWidth, align: "right" });
    doc.moveDown(0.3);
  }
  doc.moveDown(0.1);
  doc.strokeColor("#000000").lineWidth(0.5).moveTo(tableLeft, doc.y).lineTo(tableRight, doc.y).stroke();
  doc.moveDown(0.4);
  doc.fontSize(13).font("Helvetica-Bold");
  const totalRowY = doc.y;
  doc.text("Total Due", tableLeft, totalRowY, { width: descColWidth });
  doc.text(formatMoney(data.totalAmount, data.currency), tableLeft + descColWidth, totalRowY, {
    width: amountColWidth,
    align: "right",
  });

  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Issued By");
  doc.moveDown(0.3);
  drawMetaRows(doc, [["Responsible Manager", data.assignedByName ?? "—"]]);

  drawSectionRule(doc);
  doc.fontSize(9).font("Helvetica").fillColor("#999999").text(
    "Please remit payment by the due date above. Generated by VenueGuard.",
  );
  doc.fillColor("#000000");

  return doc;
}
