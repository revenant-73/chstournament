import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

const passwordIterations = 210_000;
const passwordKeyLength = 32;
const sessionDurationSeconds = 60 * 60 * 12;

type ApiRequest = {
  method?: string;
  body?: {
    action?: unknown;
    email?: unknown;
    password?: unknown;
    state?: unknown;
  };
  headers: IncomingHttpHeaders;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
};

interface SessionPayload {
  email: string;
  exp: number;
}

const tournamentId = "century-varsity-2026";

const tournamentSnapshots = sqliteTable("tournament_snapshots", {
  id: text("id").primaryKey(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull()
});

const adminUsers = sqliteTable("admin_users", {
  email: text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastLoginAt: text("last_login_at")
});

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    response.status(503).json({ error: "Turso is not configured for this deployment." });
    return;
  }

  try {
    const db = createDatabase();
    await ensureSchema(db);

    if (request.method === "GET") {
      const snapshot = await db
        .select()
        .from(tournamentSnapshots)
        .where(eq(tournamentSnapshots.id, tournamentId))
        .get();

      response.status(200).json({
        state: snapshot ? JSON.parse(snapshot.stateJson) : null,
        updatedAt: snapshot?.updatedAt ?? null
      });
      return;
    }

    if (request.method === "POST") {
      const adminEmail = await ensureConfiguredAdmin(db);
      if (!adminEmail) {
        response.status(503).json({ error: "Admin email/password auth is not configured." });
        return;
      }

      const action = typeof request.body?.action === "string" ? request.body.action : "login";
      if (action === "verify") {
        const session = verifyAdminSession(request.headers.authorization);
        if (!session || session.email !== adminEmail) {
          response.status(401).json({ error: "Admin session is required." });
          return;
        }

        response.status(200).json({ email: session.email, expiresAt: new Date(session.exp * 1000).toISOString() });
        return;
      }

      const email = normalizeEmail(request.body?.email);
      const password = typeof request.body?.password === "string" ? request.body.password : "";
      if (!email || !password) {
        response.status(400).json({ error: "Email and password are required." });
        return;
      }

      const user = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).get();
      if (!user || user.email !== adminEmail || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
        response.status(401).json({ error: "Email or password is incorrect." });
        return;
      }

      const now = new Date().toISOString();
      await db.update(adminUsers).set({ lastLoginAt: now }).where(eq(adminUsers.email, email));

      const { token, expiresAt } = createSessionToken(email);
      response.status(200).json({ token, email, expiresAt });
      return;
    }

    if (request.method === "PUT") {
      const adminEmail = await ensureConfiguredAdmin(db);
      if (!adminEmail) {
        response.status(503).json({ error: "Admin email/password auth is not configured." });
        return;
      }

      const session = verifyAdminSession(request.headers.authorization);
      if (!session || session.email !== adminEmail) {
        response.status(401).json({ error: "Admin session is required." });
        return;
      }

      const state = request.body?.state;
      if (!state || typeof state !== "object") {
        response.status(400).json({ error: "A tournament state object is required." });
        return;
      }

      const updatedAt = new Date().toISOString();
      await db
        .insert(tournamentSnapshots)
        .values({
          id: tournamentId,
          stateJson: JSON.stringify(state),
          updatedAt
        })
        .onConflictDoUpdate({
          target: tournamentSnapshots.id,
          set: {
            stateJson: JSON.stringify(state),
            updatedAt
          }
        });

      response.status(200).json({ ok: true, updatedAt });
      return;
    }

    response.setHeader("Allow", "GET, POST, PUT, OPTIONS");
    response.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Unable to load tournament data." });
  }
}

function createDatabase() {
  return drizzle(
    createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!
    })
  );
}

async function ensureSchema(db: ReturnType<typeof createDatabase>) {
  await db.run(sql`
    create table if not exists tournament_snapshots (
      id text primary key not null,
      state_json text not null,
      updated_at text not null
    )
  `);

  await db.run(sql`
    create table if not exists admin_users (
      email text primary key not null,
      password_hash text not null,
      password_salt text not null,
      created_at text not null,
      updated_at text not null,
      last_login_at text
    )
  `);
}

async function ensureConfiguredAdmin(db: ReturnType<typeof createDatabase>): Promise<string | null> {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    return null;
  }

  const existing = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).get();
  if (existing && verifyPassword(password, existing.passwordSalt, existing.passwordHash)) {
    return email;
  }

  const now = new Date().toISOString();
  const credentials = hashPassword(password);
  await db
    .insert(adminUsers)
    .values({
      email,
      passwordHash: credentials.hash,
      passwordSalt: credentials.salt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastLoginAt: existing?.lastLoginAt ?? null
    })
    .onConflictDoUpdate({
      target: adminUsers.email,
      set: {
        passwordHash: credentials.hash,
        passwordSalt: credentials.salt,
        updatedAt: now
      }
    });

  return email;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function hashPassword(password: string, salt = randomBytes(16).toString("base64")): { hash: string; salt: string } {
  return {
    hash: pbkdf2Sync(password, salt, passwordIterations, passwordKeyLength, "sha256").toString("base64"),
    salt
  };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualHash = hashPassword(password, salt).hash;
  const actual = Buffer.from(actualHash, "base64");
  const expected = Buffer.from(expectedHash, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createSessionToken(email: string): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + sessionDurationSeconds;
  const payload = base64UrlEncode(JSON.stringify({ email, exp } satisfies SessionPayload));
  const signature = signSessionPayload(payload);
  return { token: `${payload}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
}

function verifyAdminSession(authorizationHeader: string | string[] | undefined): SessionPayload | null {
  const header = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !timingSafeStringEqual(signature, signSessionPayload(payload))) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof parsed.email !== "string" || typeof parsed.exp !== "number" || parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { email: parsed.email, exp: parsed.exp };
  } catch {
    return null;
  }
}

function signSessionPayload(payload: string): string {
  const secret = getSessionSecret();
  if (!secret) {
    return "";
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function getSessionSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || null;
}

function timingSafeStringEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function setCorsHeaders(response: ApiResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

