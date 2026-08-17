import type { Match, MatchResult, SetScore } from "./types";

export function isSetComplete(set: SetScore): boolean {
  return Number.isFinite(set.teamA) && Number.isFinite(set.teamB) && set.teamA !== set.teamB;
}

export function getCompletedSets(sets: SetScore[]): SetScore[] {
  return sets.filter(isSetComplete);
}

export function getMatchResult(match: Match): MatchResult | null {
  const completedSets = getCompletedSets(match.sets);
  let teamASetsWon = 0;
  let teamBSetsWon = 0;
  let teamAPoints = 0;
  let teamBPoints = 0;

  for (const set of completedSets) {
    const teamA = set.teamA ?? 0;
    const teamB = set.teamB ?? 0;
    teamAPoints += teamA;
    teamBPoints += teamB;

    if (teamA > teamB) {
      teamASetsWon += 1;
    } else {
      teamBSetsWon += 1;
    }

    if (teamASetsWon === 2 || teamBSetsWon === 2) {
      break;
    }
  }

  if (teamASetsWon < 2 && teamBSetsWon < 2) {
    return null;
  }

  return {
    winnerId: teamASetsWon > teamBSetsWon ? match.teamAId : match.teamBId,
    loserId: teamASetsWon > teamBSetsWon ? match.teamBId : match.teamAId,
    teamASetsWon,
    teamBSetsWon,
    teamAPoints,
    teamBPoints
  };
}

export function createEmptySets(): SetScore[] {
  return [
    { teamA: null, teamB: null },
    { teamA: null, teamB: null },
    { teamA: null, teamB: null }
  ];
}
