import type { Match, SetScore, Team, TournamentState } from "./types";

const stages = new Set(["SETUP", "POOL_PLAY", "QUALIFIER", "FINAL_BRACKET", "COMPLETE"]);

export function createTournamentBackupJson(state: TournamentState): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: "century-varsity-tournament",
      version: 1,
      state
    },
    null,
    2
  );
}

export function parseTournamentBackupJson(raw: string): TournamentState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  const candidate = getStateCandidate(parsed);
  if (!isTournamentState(candidate)) {
    throw new Error("That file does not look like a Century tournament backup.");
  }

  return candidate;
}

function getStateCandidate(parsed: unknown): unknown {
  if (isRecord(parsed) && "state" in parsed) {
    return parsed.state;
  }

  return parsed;
}

function isTournamentState(value: unknown): value is TournamentState {
  if (!isRecord(value) || !stages.has(String(value.stage)) || !Array.isArray(value.teams) || !Array.isArray(value.matches)) {
    return false;
  }

  return value.teams.every(isTeam) && value.matches.every(isMatch);
}

function isTeam(value: unknown): value is Team {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Number.isFinite(value.originalSeed) &&
    typeof value.conference === "string" &&
    (value.pool === undefined || value.pool === "A" || value.pool === "B" || value.pool === "C")
  );
}

function isMatch(value: unknown): value is Match {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Number.isFinite(value.round) &&
    (value.court === 1 || value.court === 2 || value.court === 3) &&
    typeof value.label === "string" &&
    (value.pool === undefined || value.pool === "A" || value.pool === "B" || value.pool === "C") &&
    typeof value.teamAId === "string" &&
    typeof value.teamBId === "string" &&
    (value.workTeamId === undefined || typeof value.workTeamId === "string") &&
    typeof value.scheduledTime === "string" &&
    Array.isArray(value.sets) &&
    value.sets.every(isSetScore)
  );
}

function isSetScore(value: unknown): value is SetScore {
  return (
    isRecord(value) &&
    (value.teamA === null || Number.isFinite(value.teamA)) &&
    (value.teamB === null || Number.isFinite(value.teamB))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
