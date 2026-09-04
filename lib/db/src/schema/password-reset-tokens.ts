import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A single-use password reset link, keyed by an opaque random token
// (same shape as sessions.id - see lib/auth.ts's createSession) rather
// than a serial id, since this value is emailed to the user and must
// be unguessable. Deliberately its own table rather than reusing
// sessionsTable - a reset token authorizes exactly one action (setting
// a new password) and then must never work again, unlike a session
// which stays valid for repeated use until it expires or is revoked.
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Null until consumed - POST /auth/reset-password stamps this and
  // then refuses to honor the same token again, so a link that leaks
  // (forwarded email, browser history) can't be replayed after
  // whoever requested it has already used it once.
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (table) => [index("idx_password_reset_tokens_user_id").on(table.userId)]);

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
