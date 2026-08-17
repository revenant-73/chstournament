import type { TournamentState } from "./tournament/types";

const storageKey = "century-varsity-tournament-state";

export function loadTournamentState(): TournamentState | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as TournamentState) : null;
  } catch {
    return null;
  }
}

export function saveTournamentState(state: TournamentState): void {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

export function clearTournamentState(): void {
  localStorage.removeItem(storageKey);
}
