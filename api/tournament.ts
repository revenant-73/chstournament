import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { IncomingHttpHeaders } from "node:http";

type ApiRequest = {
  method?: string;
  body?: {
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

const tournamentId = "century-varsity-2026";

const tournamentSnapshots = sqliteTable("tournament_snapshots", {
  id: text("id").primaryKey(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull()
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

    if (request.method === "PUT") {
      if (!isAdminRequest(request)) {
        response.status(401).json({ error: "Admin access is required." });
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

    response.setHeader("Allow", "GET, PUT, OPTIONS");
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
}

function isAdminRequest(request: ApiRequest): boolean {
  const configuredPin = process.env.ADMIN_PIN;
  if (!configuredPin) {
    return false;
  }
  return request.headers["x-admin-pin"] === configuredPin;
}

function setCorsHeaders(response: ApiResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Pin");
}
