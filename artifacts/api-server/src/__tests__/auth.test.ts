import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { resetDb, createCompany, createUser, sessionCookie } from "./helpers";

// Platform Maturity Roadmap, Tier 3, item 7 - the shared auth code
// every other route in this app depends on through requireAuth.
describe("auth", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("logs in with correct credentials and sets a session cookie", async () => {
    const company = await createCompany();
    const { user, password } = await createUser(company.id, "manager", { email: "manager@test.local" });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("manager@test.local");
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^vg_session=/);
  });

  it("rejects a wrong password with a generic error", async () => {
    const company = await createCompany();
    const { user } = await createUser(company.id, "manager");

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("rejects login for a deactivated user with the same generic error (no account-existence leak)", async () => {
    const company = await createCompany();
    const { user, password } = await createUser(company.id, "manager", { active: false });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("blocks an unauthenticated request to a protected route", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(401);
  });

  it("blocks a request with a tampered session cookie", async () => {
    const company = await createCompany();
    const { user } = await createUser(company.id, "manager");
    const cookie = await sessionCookie(user.id);
    // Flip a character in the signature - the HMAC should no longer
    // verify, same as a forged/corrupted cookie would in production.
    const tampered = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");

    const res = await request(app).get("/api/tasks").set("Cookie", tampered);
    expect(res.status).toBe(401);
  });

  it("allows an authenticated request with a valid session cookie", async () => {
    const company = await createCompany();
    const { user } = await createUser(company.id, "manager");
    const cookie = await sessionCookie(user.id);

    const res = await request(app).get("/api/tasks").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});
