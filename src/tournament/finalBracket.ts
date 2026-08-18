import { createEmptySets, getMatchResult } from "./scoring";
import { compareStandings } from "./standings";
import { getPoolFinishers } from "./qualifiers";
import type { CourtId, Match, Team, TeamStanding } from "./types";

export interface TournamentSeed {
  seed: number;
  team: Team;
  standing: TeamStanding;
}

export function areQualifierMatchesComplete(matches: Match[]): boolean {
  const qualifierMatches = matches.filter((match) => match.round === 4);
  return qualifierMatches.length === 3 && qualifierMatches.every((match) => getMatchResult(match));
}

export function getReseededTeams(teams: Team[], matches: Match[]): TournamentSeed[] {
  if (!areQualifierMatchesComplete(matches)) {
    return [];
  }

  const finishers = getPoolFinishers(teams, matches);
  const poolWinners = [finishers.A[0], finishers.B[0], finishers.C[0]].filter(Boolean);
  const qualifierResults = matches
    .filter((match) => match.round === 4)
    .map((match) => getMatchResult(match))
    .filter((result): result is NonNullable<typeof result> => Boolean(result));
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const qualifierWinners = qualifierResults.map((result) => teamsById.get(result.winnerId)).filter(Boolean) as Team[];
  const qualifierLosers = qualifierResults.map((result) => teamsById.get(result.loserId)).filter(Boolean) as Team[];

  if (poolWinners.length !== 3 || qualifierWinners.length !== 3 || qualifierLosers.length !== 3) {
    return [];
  }

  return [
    ...rankSeedGroup(poolWinners, matches, 1),
    ...rankSeedGroup(qualifierWinners, matches, 4),
    ...rankSeedGroup(qualifierLosers, matches, 7)
  ];
}

export function canGenerateFinalBracket(teams: Team[], matches: Match[]): boolean {
  return getReseededTeams(teams, matches).length === 9;
}

export function generateFinalBracketMatches(teams: Team[], matches: Match[]): Match[] {
  const seededTeams = getReseededTeams(teams, matches);
  if (seededTeams.length !== 9) {
    return [];
  }

  const seeds = new Map(seededTeams.map((seededTeam) => [seededTeam.seed, seededTeam.team]));

  return [
    createFinalBracketMatch(1, "#3 vs #6", seeds.get(3), seeds.get(6), seeds.get(1)),
    createFinalBracketMatch(2, "#4 vs #5", seeds.get(4), seeds.get(5), seeds.get(2)),
    createFinalBracketMatch(3, "#8 vs #9", seeds.get(8), seeds.get(9), seeds.get(7))
  ].filter((match): match is Match => Boolean(match));
}

export function areRoundFiveMatchesComplete(matches: Match[]): boolean {
  const roundFiveMatches = getRoundFiveMatches(matches);
  return roundFiveMatches.length === 3 && roundFiveMatches.every((match) => getMatchResult(match));
}

export function generateRoundSixMatches(teams: Team[], matches: Match[]): Match[] {
  const seededTeams = getReseededTeams(teams, matches);
  const roundFiveMatches = getRoundFiveMatches(matches);
  if (seededTeams.length !== 9 || roundFiveMatches.length !== 3 || !areRoundFiveMatchesComplete(matches)) {
    return [];
  }

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const seeds = new Map(seededTeams.map((seededTeam) => [seededTeam.seed, seededTeam.team]));
  const courtOneResult = getMatchResult(roundFiveMatches[0]);
  const courtTwoResult = getMatchResult(roundFiveMatches[1]);
  const courtThreeResult = getMatchResult(roundFiveMatches[2]);
  if (!courtOneResult || !courtTwoResult || !courtThreeResult) {
    return [];
  }

  return [
    createScheduledMatch(
      "final-round-6-court-1",
      6,
      1,
      "#1 vs Winner #4/#5",
      seeds.get(1),
      teamsById.get(courtTwoResult.winnerId),
      teamsById.get(courtTwoResult.loserId),
      "1:00 PM"
    ),
    createScheduledMatch(
      "final-round-6-court-2",
      6,
      2,
      "#2 vs Winner #3/#6",
      seeds.get(2),
      teamsById.get(courtOneResult.winnerId),
      teamsById.get(courtOneResult.loserId),
      "1:00 PM"
    ),
    createScheduledMatch(
      "final-round-6-court-3",
      6,
      3,
      "#7 vs Winner #8/#9",
      seeds.get(7),
      teamsById.get(courtThreeResult.winnerId),
      teamsById.get(courtThreeResult.loserId),
      "1:00 PM"
    )
  ].filter((match): match is Match => Boolean(match));
}

function rankSeedGroup(teams: Team[], matches: Match[], startingSeed: number): TournamentSeed[] {
  return teams
    .map((team) => createCumulativeStanding(team, matches))
    .sort(compareStandings)
    .map((standing, index) => ({
      seed: startingSeed + index,
      team: standing.team,
      standing
    }));
}

function createCumulativeStanding(team: Team, matches: Match[]): TeamStanding {
  const standing: TeamStanding = {
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

  for (const match of matches.filter((item) => item.round <= 4 && (item.teamAId === team.id || item.teamBId === team.id))) {
    const result = getMatchResult(match);
    if (!result) {
      continue;
    }

    const isTeamA = match.teamAId === team.id;
    standing.pointsScored += isTeamA ? result.teamAPoints : result.teamBPoints;
    standing.pointsAllowed += isTeamA ? result.teamBPoints : result.teamAPoints;
    standing.setsWon += isTeamA ? result.teamASetsWon : result.teamBSetsWon;
    standing.setsLost += isTeamA ? result.teamBSetsWon : result.teamASetsWon;

    if (result.winnerId === team.id) {
      standing.matchesWon += 1;
    } else {
      standing.matchesLost += 1;
    }
  }

  const totalSets = standing.setsWon + standing.setsLost;
  const totalPoints = standing.pointsScored + standing.pointsAllowed;
  return {
    ...standing,
    setPercentage: totalSets ? standing.setsWon / totalSets : 0,
    pointPercentage: totalPoints ? standing.pointsScored / totalPoints : 0
  };
}

function createFinalBracketMatch(
  court: CourtId,
  label: string,
  teamA?: Team,
  teamB?: Team,
  worker?: Team
): Match | null {
  return createScheduledMatch(`final-round-5-court-${court}`, 5, court, label, teamA, teamB, worker, "12:00 PM");
}

function createScheduledMatch(
  id: string,
  round: number,
  court: CourtId,
  label: string,
  teamA?: Team,
  teamB?: Team,
  worker?: Team,
  scheduledTime = "12:00 PM"
): Match | null {
  if (!teamA || !teamB || !worker) {
    return null;
  }

  return {
    id,
    round,
    court,
    label,
    teamAId: teamA.id,
    teamBId: teamB.id,
    workTeamId: worker.id,
    scheduledTime,
    sets: createEmptySets()
  };
}

function getRoundFiveMatches(matches: Match[]): Match[] {
  return matches.filter((match) => match.round === 5).sort((a, b) => a.court - b.court);
}
