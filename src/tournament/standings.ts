import { getMatchResult } from "./scoring";
import type { Match, PoolId, Team, TeamStanding } from "./types";

export function calculatePoolStandings(teams: Team[], matches: Match[], pool: PoolId): TeamStanding[] {
  const poolTeams = teams.filter((team) => team.pool === pool);
  const standings = new Map(poolTeams.map((team) => [team.id, createEmptyStanding(team)]));

  for (const match of matches.filter((item) => item.pool === pool)) {
    const result = getMatchResult(match);
    if (!result) {
      continue;
    }

    const teamA = standings.get(match.teamAId);
    const teamB = standings.get(match.teamBId);
    if (!teamA || !teamB) {
      continue;
    }

    teamA.pointsScored += result.teamAPoints;
    teamA.pointsAllowed += result.teamBPoints;
    teamA.setsWon += result.teamASetsWon;
    teamA.setsLost += result.teamBSetsWon;

    teamB.pointsScored += result.teamBPoints;
    teamB.pointsAllowed += result.teamAPoints;
    teamB.setsWon += result.teamBSetsWon;
    teamB.setsLost += result.teamASetsWon;

    standings.get(result.winnerId)!.matchesWon += 1;
    standings.get(result.loserId)!.matchesLost += 1;
  }

  return [...standings.values()].map(withPercentages).sort(compareStandings);
}

export function compareStandings(a: TeamStanding, b: TeamStanding): number {
  return (
    b.matchesWon - a.matchesWon ||
    b.setPercentage - a.setPercentage ||
    b.pointPercentage - a.pointPercentage ||
    a.team.originalSeed - b.team.originalSeed
  );
}

function createEmptyStanding(team: Team): TeamStanding {
  return {
    team,
    matchesWon: 0,
    matchesLost: 0,
    setsWon: 0,
    setsLost: 0,
    pointsScored: 0,
    pointsAllowed: 0,
    setPercentage: 0,
    pointPercentage: 0
  };
}

function withPercentages(standing: TeamStanding): TeamStanding {
  const totalSets = standing.setsWon + standing.setsLost;
  const totalPoints = standing.pointsScored + standing.pointsAllowed;
  return {
    ...standing,
    setPercentage: totalSets ? standing.setsWon / totalSets : 0,
    pointPercentage: totalPoints ? standing.pointsScored / totalPoints : 0
  };
}
