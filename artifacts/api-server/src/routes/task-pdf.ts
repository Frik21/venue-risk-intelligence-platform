import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tasksTable, venuesTable, usersTable, plansTable, venueRiskAssessmentsTable, taskRoutesTable, expensesTable, timesheetEntriesTable } from "@workspace/db";
import { PLAN_CHECKLIST_ITEMS } from "../lib/plan-checklist";
import { buildTaskPdf } from "../lib/task-pdf";

const router: IRouter = Router();

// Pulls together a task's own details plus everything logged against
// it so far (Task Planning checklist, Risk Assessments, Route
// Planning) into a single downloadable PDF - the "Download Task"
// panel's one real action. Nothing here is generated/cached ahead of
// time; it's assembled fresh from the current DB state on every request.
router.get("/tasks/:taskId/download", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, task.venueId));
  const [assignedToUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedTo));
  const [assignedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedBy));

  const [plan] = await db.select().from(plansTable).where(eq(plansTable.taskId, taskId));
  const planChecklist = plan
    ? PLAN_CHECKLIST_ITEMS.map((item) => ({
        label: item.label,
        checked: ((plan.checklist as Record<string, boolean>) ?? {})[item.key] === true,
      }))
    : [];

  const assessmentRows = await db
    .select()
    .from(venueRiskAssessmentsTable)
    .where(eq(venueRiskAssessmentsTable.taskId, taskId))
    .orderBy(venueRiskAssessmentsTable.slotIndex);

  const routeRows = await db
    .select()
    .from(taskRoutesTable)
    .where(eq(taskRoutesTable.taskId, taskId))
    .orderBy(taskRoutesTable.slotIndex);

  const expenseRows = await db
    .select()
    .from(expensesTable)
    .where(eq(expensesTable.taskId, taskId))
    .orderBy(expensesTable.incurredOn);

  // Not scoped to this task - the operator's full timesheet, per
  // direct product direction (Timesheet is a per-operator log, not a
  // task-scoped feature).
  const timesheetRows = await db
    .select()
    .from(timesheetEntriesTable)
    .where(eq(timesheetEntriesTable.userId, task.assignedTo))
    .orderBy(timesheetEntriesTable.date);

  const doc = buildTaskPdf({
    task: {
      title: task.title,
      venueName: venue?.name ?? null,
      assignedToName: assignedToUser?.name ?? null,
      assignedByName: assignedByUser?.name ?? null,
      status: task.status,
      dueDate: task.dueDate?.toISOString() ?? null,
    },
    plan: plan ? { checklist: planChecklist, submittedAt: plan.submittedAt?.toISOString() ?? null } : null,
    assessments: assessmentRows.map((r) => ({
      slotIndex: r.slotIndex,
      location: r.location,
      currentOperatingConditions: r.currentOperatingConditions,
      areaAdvisories: r.areaAdvisories,
      checkpoints: r.checkpoints,
      observedHazards: r.observedHazards,
      existingControls: r.existingControls,
      recommendedActions: r.recommendedActions,
      operatorNotes: r.operatorNotes,
      attachments: r.attachments,
      status: r.status,
      submittedAt: r.submittedAt?.toISOString() ?? null,
    })),
    routes: routeRows.map((r) => ({
      slotIndex: r.slotIndex,
      startLabel: r.startLabel,
      endLabel: r.endLabel,
      distanceMeters: r.distanceMeters,
      staticTravelTimeSeconds: r.staticTravelTimeSeconds,
      liveTravelTimeSeconds: r.liveTravelTimeSeconds,
      trafficDelaySeconds: r.trafficDelaySeconds,
      trafficCheckedAt: r.trafficCheckedAt?.toISOString() ?? null,
      nearestHospitals: (r.nearestHospitalsJson as { name: string; distanceMeters: number }[] | null) ?? [],
      nearestPoliceStations: (r.nearestPoliceStationsJson as { name: string; distanceMeters: number }[] | null) ?? [],
    })),
    expenses: expenseRows.map((e) => ({
      category: e.category,
      amount: e.amount,
      currency: e.currency,
      description: e.description,
      incurredOn: e.incurredOn,
      receiptFilename: e.receiptFilename ?? null,
    })),
    timesheetEntries: timesheetRows.map((t) => ({
      date: t.date,
      hoursWorked: t.hoursWorked,
      notes: t.notes,
    })),
  });

  const filenameSafeTitle = task.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "task";
  // ?preview=1 renders inline in the browser's own PDF viewer (a new
  // tab) instead of forcing a save - lets the CPO review the document
  // before choosing to download it, using the exact same generated PDF
  // either way.
  const disposition = req.query.preview === "1" ? "inline" : "attachment";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${filenameSafeTitle}-${task.id}.pdf"`);

  doc.pipe(res);
  doc.end();
});

export default router;
