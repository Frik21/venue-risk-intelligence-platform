import PDFDocument from "pdfkit";

// Formal sales quote document for the standalone Quotes entity (see
// schema/quotes.ts) - covers all 8 sections of the quote structure
// (Details, Client, Operational Requirement, Resources, Cost Build-Up,
// Commercials, Assignment, and a closing summary). Manual line items,
// same "no rate lookups" approach as the per-task quotation-pdf.ts.
export interface QuotePdfData {
  quoteNumber: string;
  title: string;
  status: string;
  validUntil: string | null;
  createdAt: string;
  clientName: string;
  clientContact: string;
  billingDetails: string;
  venueName: string | null;
  clientRequirements: string;
  startDate: string | null;
  endDate: string | null;
  priority: string;
  operatorsRequired: number;
  armedRequired: boolean;
  vehiclesRequired: number;
  additionalEquipment: string;
  costLineItems: { category: string; description: string; amount: number }[];
  markupType: string;
  markupValue: number;
  taxRatePercent: number;
  currency: string;
  assignedByName: string | null;
  internalCost: number;
  markupAmount: number;
  clientPrice: number;
  taxAmount: number;
  totalQuoteValue: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  cpo_rate: "CPO Rate",
  overtime: "Overtime",
  vehicles: "Vehicle Costs",
  fuel_mileage: "Fuel / Mileage",
  accommodation: "Accommodation",
  flights_travel: "Flights / Travel",
  equipment: "Equipment",
  subcontractors: "Subcontractors",
  allowances: "Allowances / Per Diem",
  misc: "Miscellaneous",
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

export function buildQuotePdf(data: QuotePdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const generatedAt = new Date();

  // 1. Quote Details
  doc.fontSize(20).font("Helvetica-Bold").text("VenueGuard Quote");
  doc.moveDown(0.2);
  doc.fontSize(10).font("Helvetica").fillColor("#666666");
  doc.text(`Quote Number: ${data.quoteNumber}`);
  doc.text(`Status: ${data.status.toUpperCase()}`);
  doc.text(`Created: ${new Date(data.createdAt).toLocaleDateString()}`);
  doc.text(`Valid Until: ${data.validUntil ? new Date(data.validUntil).toLocaleDateString() : "—"}`);
  doc.text(`Generated: ${generatedAt.toLocaleString()}`);
  doc.fillColor("#000000");
  doc.moveDown(0.6);
  doc.fontSize(14).font("Helvetica-Bold").text(data.title || "Untitled Quote");

  // 2. Client
  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Client");
  doc.moveDown(0.3);
  drawMetaRows(doc, [
    ["Client", data.clientName || "—"],
    ["Contact", data.clientContact || "—"],
    ["Billing Details", data.billingDetails || "—"],
  ]);

  // 3. Operational Requirement
  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Operational Requirement");
  doc.moveDown(0.3);
  const opRows: [string, string][] = [
    ["Location", data.venueName ?? "Not linked to a venue"],
    ["Priority", data.priority.charAt(0).toUpperCase() + data.priority.slice(1)],
    ["Start", data.startDate ? new Date(data.startDate).toLocaleString() : "—"],
    ["End", data.endDate ? new Date(data.endDate).toLocaleString() : "—"],
  ];
  drawMetaRows(doc, opRows);
  if (data.clientRequirements) {
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").text("Client Requirements / Special Requests:");
    doc.font("Helvetica").text(data.clientRequirements);
  }

  // 4. Resources Required
  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Resources Required");
  doc.moveDown(0.3);
  const resourceRows: [string, string][] = [
    [
      "Operators",
      `${data.operatorsRequired} operator${data.operatorsRequired !== 1 ? "s" : ""} (${data.armedRequired ? "Armed" : "Unarmed"})`,
    ],
    ["Vehicles", `${data.vehiclesRequired} vehicle${data.vehiclesRequired !== 1 ? "s" : ""}`],
  ];
  drawMetaRows(doc, resourceRows);
  if (data.additionalEquipment) {
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").text("Additional Equipment / Services:");
    doc.font("Helvetica").text(data.additionalEquipment);
  }

  // 5. Cost Build-Up
  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Cost Build-Up");
  doc.moveDown(0.4);

  const tableLeft = doc.page.margins.left;
  const tableRight = doc.page.width - doc.page.margins.right;
  const amountColWidth = 90;
  const categoryColWidth = 130;
  const descColWidth = tableRight - tableLeft - amountColWidth - categoryColWidth;

  doc.fontSize(10).font("Helvetica-Bold");
  const headerY = doc.y;
  doc.text("Category", tableLeft, headerY, { width: categoryColWidth });
  doc.text("Description", tableLeft + categoryColWidth, headerY, { width: descColWidth });
  doc.text("Amount", tableLeft + categoryColWidth + descColWidth, headerY, { width: amountColWidth, align: "right" });
  doc.moveDown(0.3);
  doc.strokeColor("#000000").lineWidth(0.5).moveTo(tableLeft, doc.y).lineTo(tableRight, doc.y).stroke();
  doc.moveDown(0.4);

  doc.font("Helvetica");
  if (data.costLineItems.length === 0) {
    doc.fillColor("#999999").text("No cost line items yet.");
    doc.fillColor("#000000");
  } else {
    for (const item of data.costLineItems) {
      const rowY = doc.y;
      doc.text(CATEGORY_LABELS[item.category] ?? item.category, tableLeft, rowY, { width: categoryColWidth });
      doc.text(item.description || "—", tableLeft + categoryColWidth, rowY, { width: descColWidth });
      const afterY = doc.y;
      doc.text(formatMoney(item.amount, data.currency), tableLeft + categoryColWidth + descColWidth, rowY, {
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
  doc.fontSize(11).font("Helvetica-Bold");
  const internalRowY = doc.y;
  doc.text("Internal Cost", tableLeft, internalRowY, { width: categoryColWidth + descColWidth });
  doc.text(formatMoney(data.internalCost, data.currency), tableLeft + categoryColWidth + descColWidth, internalRowY, {
    width: amountColWidth,
    align: "right",
  });

  // 6. Commercials
  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Commercials");
  doc.moveDown(0.4);

  const commercialRows: [string, string][] = [
    ["Internal Estimated Cost", formatMoney(data.internalCost, data.currency)],
    [
      `Markup (${data.markupType === "percent" ? `${data.markupValue}%` : "Fixed"})`,
      formatMoney(data.markupAmount, data.currency),
    ],
    ["Client Price", formatMoney(data.clientPrice, data.currency)],
    [`Tax / VAT (${data.taxRatePercent}%)`, formatMoney(data.taxAmount, data.currency)],
  ];
  doc.fontSize(10).font("Helvetica");
  for (const [label, value] of commercialRows) {
    const rowY = doc.y;
    doc.font("Helvetica-Bold").text(label, tableLeft, rowY, { width: categoryColWidth + descColWidth });
    doc.font("Helvetica").text(value, tableLeft + categoryColWidth + descColWidth, rowY, { width: amountColWidth, align: "right" });
    doc.moveDown(0.3);
  }
  doc.moveDown(0.1);
  doc.strokeColor("#000000").lineWidth(0.5).moveTo(tableLeft, doc.y).lineTo(tableRight, doc.y).stroke();
  doc.moveDown(0.4);
  doc.fontSize(13).font("Helvetica-Bold");
  const totalRowY = doc.y;
  doc.text("Total Quote Value", tableLeft, totalRowY, { width: categoryColWidth + descColWidth });
  doc.text(formatMoney(data.totalQuoteValue, data.currency), tableLeft + categoryColWidth + descColWidth, totalRowY, {
    width: amountColWidth,
    align: "right",
  });

  // 7. Assignment / Ownership
  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Assignment / Ownership");
  doc.moveDown(0.3);
  drawMetaRows(doc, [["Responsible Manager", data.assignedByName ?? "—"]]);

  // 8. Quote Summary (closing recap - scope, dates, resources, cost, margin)
  drawSectionRule(doc);
  doc.fontSize(12).font("Helvetica-Bold").text("Quote Summary");
  doc.moveDown(0.3);
  const marginPercent = data.internalCost > 0 ? (data.markupAmount / data.internalCost) * 100 : 0;
  drawMetaRows(doc, [
    ["Scope", data.title || "Untitled Quote"],
    [
      "Dates",
      data.startDate && data.endDate
        ? `${new Date(data.startDate).toLocaleDateString()} — ${new Date(data.endDate).toLocaleDateString()}`
        : "—",
    ],
    [
      "Resources",
      `${data.operatorsRequired} operator${data.operatorsRequired !== 1 ? "s" : ""}, ${data.vehiclesRequired} vehicle${data.vehiclesRequired !== 1 ? "s" : ""}`,
    ],
    ["Internal Cost", formatMoney(data.internalCost, data.currency)],
    ["Client Total", formatMoney(data.totalQuoteValue, data.currency)],
    ["Expected Margin", `${marginPercent.toFixed(1)}%`],
  ]);

  drawSectionRule(doc);
  doc.fontSize(9).font("Helvetica").fillColor("#999999").text(
    "This quote is an estimate based on the requirements above and is subject to change. Generated by VenueGuard.",
  );
  doc.fillColor("#000000");

  return doc;
}
