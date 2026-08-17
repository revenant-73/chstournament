import { createEmptySets, getMatchResult } from "./scoring";
import { calculatePoolStandings } from "./standings";
import type { CourtId, Match, PoolId, Team } from "./types";

const pools: PoolId[] = ["A", "B", "C"];

export function arePoolPlayMatchesComplete(matches: Match[]): boolean {
  const poolMatches = matches.filter((match) => match.pool && match.round <= 3);
  return poolMatches.length === 9 && poolMatches.every((match) => getMatchResult(match));
}

export function getPoolFinishers(teams: Team[], matches: Match[]): Record<PoolId, Team[]> {
  return pools.reduce(
    (finishers, pool) => {
      finishers[pool] = calculatePoolStandings(teams, matches, pool).map((standing) => standing.team);
      return finishers;
    },
    { A: [], B: [], C: [] } as Record<PoolId, Team[]>
  );
}

export function canGenerateQualifiers(teams: Team[], matches: Match[]): boolean {
  if (!arePoolPlayMatchesComplete(matches)) {
    return false;
  }

  const finishers = getPoolFinishers(teams, matches);
  return pools.every((pool) => finishers[pool].length === 3);
}

export function generateQualifierMatches(teams: Team[], matches: Match[]): Match[] {
  if (!canGenerateQualifiers(teams, matches)) {
    return [];
  }

  const finishers = getPoolFinishers(teams, matches);

  return [
    createQualifierMatch(1, "A2 vs B3", finishers.A[1], finishers.B[2], finishers.A[0]),
    createQualifierMatch(2, "B2 vs C3", finishers.B[1], finishers.C[2], finishers.B[0]),
    createQualifierMatch(3, "C2 vs A3", finishers.C[1], finishers.A[2], finishers.C[0])
  ];
}

function createQualifierMatch(court: CourtId, label: string, teamA: Team, teamB: Team, worker: Team): Match {
  return {
    id: `qualifier-court-${court}`,
    round: 4,
    court,
    label,
    teamAId: teamA.id,
    teamBId: teamB.id,
    workTeamId: worker.id,
    scheduledTime: "11:00 AM",
    sets: createEmptySets()
  };
}
