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

    if (!result.isTie) {
      standings.get(result.winnerId)!.matchesWon += 1;
      standings.get(result.loserId)!.matchesLost += 1;
    }
  }

  const calculated = [...standings.values()].map(withPercentages).sort(comparePoolPrimaryCriteria);
  const ranked: TeamStanding[] = [];
  for (let index = 0; index < calculated.length; ) {
    const tied = calculated.slice(index).filter((standing) => comparePoolPrimaryCriteria(calculated[index], standing) === 0);
    ranked.push(...resolvePoolTie(tied, matches));
    index += tied.length;
  }
  return ranked;
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

function comparePoolPrimaryCriteria(a: TeamStanding, b: TeamStanding): number {
  const pointDifferentialA = a.pointsScored - a.pointsAllowed;
  const pointDifferentialB = b.pointsScored - b.pointsAllowed;
  return b.setsWon - a.setsWon || pointDifferentialB - pointDifferentialA;
}

function resolvePoolTie(tied: TeamStanding[], matches: Match[]): TeamStanding[] {
  if (tied.length !== 2) {
    return tied.slice().sort((a, b) => a.team.originalSeed - b.team.originalSeed);
  }

  const [a, b] = tied;
  const headToHead = matches.find(
    (match) =>
      match.pool === a.team.pool &&
      ((match.teamAId === a.team.id && match.teamBId === b.team.id) ||
        (match.teamAId === b.team.id && match.teamBId === a.team.id))
  );
  const result = headToHead ? getMatchResult(headToHead) : null;
  if (result && !result.isTie && result.winnerId === a.team.id) {
    return [a, b];
  }
  if (result && !result.isTie && result.winnerId === b.team.id) {
    return [b, a];
  }

  return tied.slice().sort((first, second) => first.team.originalSeed - second.team.originalSeed);
}
