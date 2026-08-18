import { getMatchResult } from "./scoring";
import type { CourtId, Match } from "./types";

export interface CourtStatus {
  court: CourtId;
  currentMatch?: Match;
  nextMatch?: Match;
  completedCount: number;
  totalCount: number;
}

const courts: CourtId[] = [1, 2, 3];

export function getCourtStatuses(matches: Match[]): CourtStatus[] {
  return courts.map((court) => {
    const courtMatches = matches
      .filter((match) => match.court === court)
      .sort((a, b) => a.round - b.round || a.scheduledTime.localeCompare(b.scheduledTime));
    const remainingMatches = courtMatches.filter((match) => !getMatchResult(match));

    return {
      court,
      currentMatch: remainingMatches[0],
      nextMatch: remainingMatches[1],
      completedCount: courtMatches.length - remainingMatches.length,
      totalCount: courtMatches.length
    };
  });
}
