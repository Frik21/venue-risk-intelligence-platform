import rateLimit from "express-rate-limit";

// Per-IP limiters for the two unauthenticated endpoints an attacker
// could otherwise hammer freely - there's no other gate in front of
// either (requireAuth doesn't apply, they're registered before it in
// routes/index.ts). Keyed by IP (express-rate-limit's default,
// req.ip - see app.ts's "trust proxy" setting for why that's reliable
// once this runs behind a real reverse proxy), not by email/company
// name, so a single attacker can't work around it by cycling through
// different target accounts/company names from the same IP.
//
// Generous enough that a real person fumbling their password, or a
// legitimate burst of signups from one office's shared IP, doesn't get
// blocked - tight enough to blunt a credential-stuffing or fake-company
// spam script.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in a few minutes." },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signup attempts from this network. Please try again later." },
});

// POST /auth/forgot-password always returns the same generic response
// regardless of whether the email exists (see that route's own
// comment), so this is the only real brake on someone hammering it to
// spam an inbox with reset emails or brute-force-probe which addresses
// are real accounts via timing/side channels. Same budget as register
// - both are "someone doing something unusual from one IP" surfaces.
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset attempts from this network. Please try again later." },
});
