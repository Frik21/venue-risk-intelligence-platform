import PDFDocument from "pdfkit";

// Everything the Download Task PDF needs, already resolved to plain
// values (names instead of ids, ISO strings instead of Date objects) -
// keeps this file free of any DB/drizzle knowledge, same separation
// routes/task-pdf.ts keeps for every other feature's format*() helper.
export interface TaskPdfData {
  task: {
    title: string;
    venueName: string | null;
    assignedToName: string | null;
    assignedByName: string | null;
    status: string;
    dueDate: string | null;
  };
  plan: {
    checklist: { label: string; checked: boolean }[];
    submittedAt: string | null;
  } | null;
  assessments: {
    slotIndex: number;
    location: string;
    currentOperatingConditions: string;
    areaAdvisories: string;
    checkpoints: string;
    observedHazards: string;
    existingControls: string;
    recommendedActions: string;
    operatorNotes: string;
    attachments: string;
    status: string;
    submittedAt: string | null;
  }[];
  routes: {
    slotIndex: number;
    startLabel: string;
    endLabel: string;
    distanceMeters: number | null;
    staticTravelTimeSeconds: number | null;
    liveTravelTimeSeconds: number | null;
    trafficDelaySeconds: number | null;
    trafficCheckedAt: string | null;
    nearestHospitals: { name: string; distanceMeters: number }[];
    nearestPoliceStations: { name: string; distanceMeters: number }[];
  }[];
  expenses: {
    category: string;
    amount: number;
    currency: string;
    description: string;
    incurredOn: string;
    receiptFilename: string | null;
  }[];
  // Every entry logged by this task's assigned operator - not scoped
  // to this task specifically, since Timesheet is a per-operator log,
  // not a task-scoped feature (per direct product direction: show the
  // operator's full timesheet in the report, not just entries dated
  // near this task).
  timesheetEntries: {
    date: string;
    hoursWorked: number;
    notes: string;
  }[];
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  fuel: "Fuel",
  accommodation: "Accommodation",
  food: "Food",
  parking: "Parking",
  tolls: "Tolls",
  equipment: "Equipment",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  not_completed: "Not Completed",
  in_progress: "In Progress",
  completed: "Completed",
  draft: "Draft",
  submitted: "Submitted",
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "Not calculated";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDistance(meters: number | null): string {
  if (meters == null) return "Not calculated";
  return `${(meters / 1000).toFixed(1)} km`;
}

// Builds the PDF into an in-memory document the caller pipes to the
// HTTP response (see routes/task-pdf.ts) - pdfkit streams as it draws,
// so this doesn't need to buffer the whole file itself.
export function buildTaskPdf(data: TaskPdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const generatedAt = new Date();

  doc.fontSize(20).font("Helvetica-Bold").text("VenueGuard Task Report");
  doc.moveDown(0.3);
  doc.fontSize(14).font("Helvetica-Bold").text(data.task.title);
  doc.moveDown(0.6);

  doc.fontSize(10).font("Helvetica");
  const metaRows: [string, string][] = [
    ["Date", generatedAt.toLocaleDateString()],
    ["Time", generatedAt.toLocaleTimeString()],
    ["Operator", data.task.assignedToName ?? "Unassigned"],
    ["Venue", data.task.venueName ?? "Not linked to a venue"],
    ["Assigned By", data.task.assignedByName ?? "Unknown"],
    ["Status", STATUS_LABELS[data.task.status] ?? data.task.status],
  ];
  if (data.task.dueDate) metaRows.push(["Due Date", new Date(data.task.dueDate).toLocaleDateString()]);
  for (const [label, value] of metaRows) {
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value);
  }

  drawSectionRule(doc);
  doc.fontSize(14).font("Helvetica-Bold").text("Task Planning");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  if (!data.plan || data.plan.checklist.length === 0) {
    doc.text("No checklist yet.");
  } else {
    for (const item of data.plan.checklist) {
      doc.text(`${item.checked ? "[x]" : "[ ]"} ${item.label}`);
    }
    doc.moveDown(0.3);
    doc
      .font("Helvetica-Bold")
      .text("Submitted: ", { continued: true })
      .font("Helvetica")
      .text(data.plan.submittedAt ? new Date(data.plan.submittedAt).toLocaleString() : "Not submitted yet");
  }

  drawSectionRule(doc);
  doc.fontSize(14).font("Helvetica-Bold").text("Risk Assessments");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  if (data.assessments.length === 0) {
    doc.text("No risk assessments yet.");
  } else {
    for (const assessment of data.assessments) {
      doc.font("Helvetica-Bold").text(`Assessment ${assessment.slotIndex}${assessment.location ? ` — ${assessment.location}` : ""}`);
      doc.font("Helvetica-Bold").fontSize(9).text(`Status: ${STATUS_LABELS[assessment.status] ?? assessment.status}`);
      doc.fontSize(10);
      const fields: [string, string][] = [
        ["Current Operating Conditions", assessment.currentOperatingConditions],
        ["Area Advisories", assessment.areaAdvisories],
        ["Assessment Questions / Checkpoints", assessment.checkpoints],
        ["Observed Hazards / Concerns", assessment.observedHazards],
        ["Existing Controls", assessment.existingControls],
        ["Recommended Actions", assessment.recommendedActions],
        ["Operator Notes", assessment.operatorNotes],
        ["Photos / Video / Attachments", assessment.attachments],
      ];
      for (const [label, value] of fields) {
        doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value || "—");
      }
      doc.moveDown(0.5);
    }
  }

  drawSectionRule(doc);
  doc.fontSize(14).font("Helvetica-Bold").text("Route Planning");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  if (data.routes.length === 0) {
    doc.text("No routes yet.");
  } else {
    for (const route of data.routes) {
      doc.font("Helvetica-Bold").text(`Route ${route.slotIndex}`);
      doc.font("Helvetica-Bold").text("Start: ", { continued: true }).font("Helvetica").text(route.startLabel || "Not set");
      doc.font("Helvetica-Bold").text("End: ", { continued: true }).font("Helvetica").text(route.endLabel || "Not set");
      doc.font("Helvetica-Bold").text("Distance: ", { continued: true }).font("Helvetica").text(formatDistance(route.distanceMeters));
      doc
        .font("Helvetica-Bold")
        .text("Static Duration: ", { continued: true })
        .font("Helvetica")
        .text(formatDuration(route.staticTravelTimeSeconds));
      if (route.liveTravelTimeSeconds != null) {
        doc
          .font("Helvetica-Bold")
          .text("Live ETA (traffic): ", { continued: true })
          .font("Helvetica")
          .text(formatDuration(route.liveTravelTimeSeconds));
        doc
          .font("Helvetica-Bold")
          .text("Traffic Delay: ", { continued: true })
          .font("Helvetica")
          .text(route.trafficDelaySeconds ? `+${formatDuration(route.trafficDelaySeconds)}` : "None");
      }
      if (route.nearestHospitals.length > 0) {
        doc.font("Helvetica-Bold").text("Nearest Hospitals:");
        doc.font("Helvetica");
        for (const hospital of route.nearestHospitals) {
          doc.text(`  • ${hospital.name} (${formatDistance(hospital.distanceMeters)})`);
        }
      }
      if (route.nearestPoliceStations.length > 0) {
        doc.font("Helvetica-Bold").text("Nearest Police Stations:");
        doc.font("Helvetica");
        for (const station of route.nearestPoliceStations) {
          doc.text(`  • ${station.name} (${formatDistance(station.distanceMeters)})`);
        }
      }
      doc.moveDown(0.5);
    }
  }

  drawSectionRule(doc);
  doc.fontSize(14).font("Helvetica-Bold").text("Expenses");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  if (data.expenses.length === 0) {
    doc.text("No expenses logged for this task.");
  } else {
    const totalsByCurrency: Record<string, number> = {};
    for (const expense of data.expenses) {
      const label = EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category;
      doc
        .font("Helvetica-Bold")
        .text(`${label} — ${expense.currency} ${expense.amount.toFixed(2)}`, { continued: true })
        .font("Helvetica")
        .text(`  (${new Date(`${expense.incurredOn}T00:00:00`).toLocaleDateString()})`);
      if (expense.description) doc.text(expense.description);
      doc.text(expense.receiptFilename ? `Receipt: ${expense.receiptFilename}` : "No receipt attached");
      doc.moveDown(0.3);
      totalsByCurrency[expense.currency] = (totalsByCurrency[expense.currency] ?? 0) + expense.amount;
    }
    const totalLine = Object.entries(totalsByCurrency)
      .map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`)
      .join(", ");
    doc.font("Helvetica-Bold").text("Total: ", { continued: true }).font("Helvetica").text(totalLine);
  }

  drawSectionRule(doc);
  doc.fontSize(14).font("Helvetica-Bold").text("Timesheet");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  if (data.timesheetEntries.length === 0) {
    doc.text("No hours logged yet.");
  } else {
    let totalHours = 0;
    for (const entry of data.timesheetEntries) {
      doc
        .font("Helvetica-Bold")
        .text(`${new Date(`${entry.date}T00:00:00`).toLocaleDateString()}: `, { continued: true })
        .font("Helvetica")
        .text(`${entry.hoursWorked}h${entry.notes ? ` — ${entry.notes}` : ""}`);
      totalHours += entry.hoursWorked;
    }
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").text(`Total Hours: ${totalHours}`);
  }

  return doc;
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
