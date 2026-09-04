import nodemailer, { type Transporter } from "nodemailer";

// Real email sending, built now and connected later - same pattern as
// Stripe (lib/stripe.ts), the currency engine, and error tracking
// (lib/error-tracking.ts): the wiring is real and complete, but no SMTP
// credentials are set anywhere in this environment yet. Deliberately
// NOT a fail-fast startup check like DATABASE_URL/SESSION_SECRET (lib/
// db/src/index.ts) - going live with real transactional email is a
// separate, later decision. Generic SMTP (not a specific provider's
// SDK) so switching providers later (SES, SendGrid's SMTP relay,
// Postmark, a real mail server) is just changing env vars, not code -
// matches this repo's existing preference for small, swappable
// building blocks over provider-specific lock-in.
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  transporter = host && port && user && pass
    ? nodemailer.createTransport({ host, port: Number(port), secure: Number(port) === 465, auth: { user, pass } })
    : null;
  return transporter;
}

export function isEmailConfigured(): boolean {
  return getTransporter() !== null;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const t = getTransporter();
  if (!t) throw new Error("Email is not connected yet");
  await t.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject: "Reset your VenueGuard password",
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    html: `<p>Someone requested a password reset for this VenueGuard account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
  });
}
