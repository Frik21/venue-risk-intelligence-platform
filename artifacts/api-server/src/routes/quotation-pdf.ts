import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tasksTable, venuesTable } from "@workspace/db";
import { buildQuotationPdf } from "../lib/quotation-pdf";

const router: IRouter = Router();

// Client-facing quotation document, built fresh from the task's
// current state on every request - same "not cached ahead of time"
// approach as the Task PDF (routes/task-pdf.ts).
router.get("/tasks/:taskId/quotation-pdf", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const [venue] = task.venueId !== null
    ? await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, task.venueId))
    : [undefined];

  const doc = buildQuotationPdf({
    task: {
      taskNumber: `T-${String(task.id).padStart(4, "0")}`,
      title: task.title,
      venueName: venue?.name ?? null,
      clientName: task.clientName,
      clientContact: task.clientContact,
      clientRequirements: task.clientRequirements,
      dueDate: task.dueDate?.toISOString() ?? null,
      endDate: task.endDate?.toISOString() ?? null,
      operatorsRequired: task.operatorsRequired,
      armedRequired: task.armedRequired,
      vehiclesRequired: task.vehiclesRequired,
    },
    lineItems: task.quotationLineItems,
    currency: task.estimatedCostCurrency,
  });

  const filenameSafeTitle = task.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "task";
  const disposition = req.query.preview === "1" ? "inline" : "attachment";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="quote-${filenameSafeTitle}-${task.id}.pdf"`);

  doc.pipe(res);
  doc.end();
});

export default router;
