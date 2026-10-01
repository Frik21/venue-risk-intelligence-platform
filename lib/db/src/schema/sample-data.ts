import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

// Tracks exactly which rows (across several different tables) a
// "Load sample data" click created - Platform Maturity Roadmap, Tier
// 4, item 10. A dedicated tracking table rather than an `isSampleData`
// column bolted onto each of offices/clients/tasks/quotes - avoids
// touching four existing, already-widely-queried schema files with a
// column every other consumer would need to know to ignore, and gives
// "Remove sample data" an exact, reliable list of rows to delete
// without guessing from a naming convention alone. `tableName` is
// freeform (not an enum) since this is purely an internal bookkeeping
// label, not user-facing or schema-constrained data.
export const sampleDataRecordsTable = pgTable("sample_data_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  tableName: text("table_name").notNull(),
  recordId: integer("record_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("idx_sample_data_records_company_id").on(table.companyId)]);

export type SampleDataRecord = typeof sampleDataRecordsTable.$inferSelect;
