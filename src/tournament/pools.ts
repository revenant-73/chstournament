import { createEmptySets } from "./scoring";
import type { CourtId, Match, PoolId, Team } from "./types";

const poolAssignmentsBySeed: Record<number, PoolId> = {
  1: "A",
  6: "A",
  7: "A",
  2: "B",
  5: "B",
  8: "B",
  3: "C",
  4: "C",
  9: "C"
};

const poolCourt: Record<PoolId, CourtId> = {
  A: 1,
  B: 2,
  C: 3
};

const roundTimes: Record<number, string> = {
  1: "8:00 AM",
  2: "9:00 AM",
  3: "10:00 AM"
};

export function generateInitialPools(teams: Team[]): Team[] {
  return teams.map((team) => ({
    ...team,
    pool: poolAssignmentsBySeed[team.originalSeed]
  }));
}

export function getTeamsByPool(teams: Team[], pool: PoolId): Team[] {
  return teams
    .filter((team) => team.pool === pool)
    .sort((a, b) => a.originalSeed - b.originalSeed);
}

export function findConferenceConflicts(teams: Team[]): Record<PoolId, string[]> {
  return (["A", "B", "C"] as PoolId[]).reduce(
    (conflicts, pool) => {
      const conferenceCounts = new Map<string, number>();
      for (const team of teams.filter((item) => item.pool === pool)) {
        const conference = team.conference.trim();
        if (conference) {
          conferenceCounts.set(conference, (conferenceCounts.get(conference) ?? 0) + 1);
        }
      }
      conflicts[pool] = [...conferenceCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([conference]) => conference);
      return conflicts;
    },
    { A: [], B: [], C: [] } as Record<PoolId, string[]>
  );
}

export function generateInitialPoolMatches(teams: Team[]): Match[] {
  return (["A", "B", "C"] as PoolId[]).flatMap((pool) => {
    const poolTeams = getTeamsByPool(teams, pool);
    if (poolTeams.length !== 3) {
      return [];
    }

    const [top, middle, low] = poolTeams;
    const court = poolCourt[pool];
    return [
      createPoolMatch(1, court, pool, middle, low, top),
      createPoolMatch(2, court, pool, top, low, middle),
      createPoolMatch(3, court, pool, top, middle, low)
    ];
  });
}

function createPoolMatch(round: number, court: CourtId, pool: PoolId, teamA: Team, teamB: Team, worker: Team): Match {
  return {
    id: `pool-${pool}-round-${round}`,
    round,
    court,
    label: `Pool ${pool}`,
    pool,
    teamAId: teamA.id,
    teamBId: teamB.id,
    workTeamId: worker.id,
    scheduledTime: roundTimes[round],
    sets: createEmptySets()
  };
}
