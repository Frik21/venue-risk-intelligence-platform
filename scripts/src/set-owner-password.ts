// One-off bootstrap: sets a password on the platform Owner account (or
// any account by email) so it can actually log in. Needed because
// there's no signup flow and no email infrastructure - the Owner
// account seeded by backfill-company-id.ts has no password, and
// creating a user normally requires already being logged in as the
// Owner. Run once per environment, or whenever an Owner/admin account
// is locked out with no other way back in:
//   pnpm --filter @workspace/scripts run set-owner-password [email]
// Defaults to owner@venueguard.internal if no email is given.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";

const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generatePassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)];
  return out;
}

async function main() {
  const email = process.argv[2] ?? "owner@venueguard.internal";

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    console.error(`No user found with email "${email}".`);
    process.exitCode = 1;
    return;
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: true }).where(eq(usersTable.id, user.id));

  console.log(`Password set for ${user.email} (role: ${user.role}).`);
  console.log(`Temporary password: ${password}`);
  console.log(`You'll be asked to set your own on first login.`);
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
