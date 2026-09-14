import type { TournamentState } from "./tournament/types";

interface RemoteSnapshot {
  state: TournamentState | null;
  updatedAt: string | null;
}

export interface AdminSession {
  token: string;
  email: string;
  expiresAt: string;
}

export async function fetchRemoteTournamentState(): Promise<RemoteSnapshot> {
  const response = await fetch("/api/tournament", {
    headers: { Accept: "application/json" }
  });

  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Remote tournament state is unavailable.");
  }

  return (await response.json()) as RemoteSnapshot;
}

export async function loginAdmin(email: string, password: string): Promise<AdminSession> {
  const response = await fetch("/api/tournament", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error("Admin login failed.");
  }

  return (await response.json()) as AdminSession;
}

export async function verifyAdminSession(token: string): Promise<Omit<AdminSession, "token">> {
  const response = await fetch("/api/tournament", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action: "verify" })
  });

  if (!response.ok) {
    throw new Error("Admin session verification failed.");
  }

  return (await response.json()) as Omit<AdminSession, "token">;
}

export async function saveRemoteTournamentState(state: TournamentState, token: string): Promise<string | null> {
  const response = await fetch("/api/tournament", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ state })
  });

  if (!response.ok) {
    throw new Error("Remote tournament save failed.");
  }

  const payload = (await response.json()) as { updatedAt?: string };
  return payload.updatedAt ?? null;
}
