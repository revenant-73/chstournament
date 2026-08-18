import type { TournamentState } from "./tournament/types";

interface RemoteSnapshot {
  state: TournamentState | null;
  updatedAt: string | null;
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

export async function verifyAdminPin(adminPin: string): Promise<void> {
  const response = await fetch("/api/tournament", {
    method: "POST",
    headers: {
      "X-Admin-Pin": adminPin
    }
  });

  if (!response.ok) {
    throw new Error("Admin PIN verification failed.");
  }
}

export async function saveRemoteTournamentState(state: TournamentState, adminPin: string): Promise<string | null> {
  const response = await fetch("/api/tournament", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Pin": adminPin
    },
    body: JSON.stringify({ state })
  });

  if (!response.ok) {
    throw new Error("Remote tournament save failed.");
  }

  const payload = (await response.json()) as { updatedAt?: string };
  return payload.updatedAt ?? null;
}
