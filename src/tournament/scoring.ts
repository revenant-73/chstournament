import type { Match, MatchResult, SetScore } from "./types";

export function isSetComplete(set: SetScore): boolean {
  return Number.isFinite(set.teamA) && Number.isFinite(set.teamB) && set.teamA !== set.teamB;
}

export function getCompletedSets(sets: SetScore[]): SetScore[] {
  return sets.filter(isSetComplete);
}

export function isPoolPlaySetComplete(set: SetScore): boolean {
  if (!isSetComplete(set)) {
    return false;
  }

  const winningScore = Math.max(set.teamA ?? 0, set.teamB ?? 0);
  const losingScore = Math.min(set.teamA ?? 0, set.teamB ?? 0);

  return (
    (winningScore === 25 && losingScore <= 23) ||
    (winningScore === 26 && losingScore === 24) ||
    (winningScore === 27 && losingScore === 26)
  );
}

export function getMatchSetCount(match: Match): number {
  if (match.round <= 3) {
    return 2;
  }

  return match.round === 4 ? 1 : 3;
}

export function getMatchResult(match: Match): MatchResult | null {
  const requiredSets = getMatchSetCount(match);
  const completedSets = match.sets
    .filter(match.round <= 3 ? isPoolPlaySetComplete : isSetComplete)
    .slice(0, requiredSets);
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

    if (match.round >= 5 && (teamASetsWon === 2 || teamBSetsWon === 2)) {
      break;
    }
  }

  if (match.round <= 4 && completedSets.length < requiredSets) {
    return null;
  }

  if (match.round >= 5 && teamASetsWon < 2 && teamBSetsWon < 2) {
    return null;
  }

  return {
    winnerId: teamASetsWon >= teamBSetsWon ? match.teamAId : match.teamBId,
    loserId: teamASetsWon >= teamBSetsWon ? match.teamBId : match.teamAId,
    isTie: teamASetsWon === teamBSetsWon,
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

export function createPoolPlaySets(): SetScore[] {
  return [
    { teamA: null, teamB: null },
    { teamA: null, teamB: null }
  ];
}
