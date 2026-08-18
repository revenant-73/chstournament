import { describe, expect, it } from "vitest";
import { areQualifierMatchesComplete, generateFinalBracketMatches, getReseededTeams } from "./finalBracket";
import { generateInitialPoolMatches, generateInitialPools } from "./pools";
import { arePoolPlayMatchesComplete, generateQualifierMatches, getPoolFinishers } from "./qualifiers";
import { getMatchResult } from "./scoring";
import { createDefaultTeams } from "./setup";
import { calculatePoolStandings } from "./standings";
import type { Match, PoolId, Team } from "./types";

describe("initial pool generation", () => {
  it("assigns teams with the Century 9-team snake pattern", () => {
    const teams = generateInitialPools(createDefaultTeams());

    expect(seedsInPool(teams, "A")).toEqual([1, 6, 7]);
    expect(seedsInPool(teams, "B")).toEqual([2, 5, 8]);
    expect(seedsInPool(teams, "C")).toEqual([3, 4, 9]);
  });

  it("generates the three pool-play rounds with correct opponents and work teams", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = generateInitialPoolMatches(teams);

    expect(matchSeeds(matches[0], teams)).toEqual({ teamA: 6, teamB: 7, workTeam: 1 });
    expect(matchSeeds(matches[3], teams)).toEqual({ teamA: 5, teamB: 8, workTeam: 2 });
    expect(matchSeeds(matches[6], teams)).toEqual({ teamA: 4, teamB: 9, workTeam: 3 });
    expect(matchSeeds(matches[2], teams)).toEqual({ teamA: 1, teamB: 6, workTeam: 7 });
  });
});

describe("match scoring", () => {
  it("automatically determines a best-of-three winner from set scores", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const match = withSets(generateInitialPoolMatches(teams)[0], [
      [25, 18],
      [21, 25],
      [15, 11]
    ]);

    expect(getMatchResult(match)).toMatchObject({
      winnerId: match.teamAId,
      loserId: match.teamBId,
      teamASetsWon: 2,
      teamBSetsWon: 1,
      teamAPoints: 61,
      teamBPoints: 54
    });
  });

  it("allows extended set scores above target points", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const match = withSets(generateInitialPoolMatches(teams)[0], [
      [28, 26],
      [24, 26],
      [17, 15]
    ]);

    expect(getMatchResult(match)?.winnerId).toBe(match.teamAId);
    expect(getMatchResult(match)?.teamAPoints).toBe(69);
  });
});

describe("pool standings", () => {
  it("ranks a three-team pool by match record", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = [
      withSets(generateInitialPoolMatches(teams)[0], [
        [25, 20],
        [25, 20]
      ]),
      withSets(generateInitialPoolMatches(teams)[1], [
        [25, 10],
        [25, 10]
      ]),
      withSets(generateInitialPoolMatches(teams)[2], [
        [25, 20],
        [25, 20]
      ])
    ];

    expect(calculatePoolStandings(teams, matches, "A").map((standing) => standing.team.originalSeed)).toEqual([
      1, 6, 7
    ]);
  });

  it("uses set percentage and point percentage for a three-way tie", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = [
      withSets(generateInitialPoolMatches(teams)[0], [
        [25, 20],
        [25, 20]
      ]),
      withSets(generateInitialPoolMatches(teams)[1], [
        [15, 25],
        [25, 20],
        [12, 15]
      ]),
      withSets(generateInitialPoolMatches(teams)[2], [
        [25, 19],
        [23, 25],
        [15, 12]
      ])
    ];

    const standings = calculatePoolStandings(teams, matches, "A");

    expect(standings.map((standing) => standing.team.originalSeed)).toEqual([6, 1, 7]);
    expect(standings.map((standing) => standing.matchesWon)).toEqual([1, 1, 1]);
    expect(standings[0].setPercentage).toBeCloseTo(0.6);
    expect(standings[1].setPercentage).toBeCloseTo(0.5);
  });

  it("uses original tournament seed as the final tiebreaker", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = [
      withSets(generateInitialPoolMatches(teams)[0], [
        [25, 20],
        [25, 20]
      ]),
      withSets(generateInitialPoolMatches(teams)[1], [
        [20, 25],
        [20, 25]
      ]),
      withSets(generateInitialPoolMatches(teams)[2], [
        [25, 20],
        [25, 20]
      ])
    ];

    expect(calculatePoolStandings(teams, matches, "A").map((standing) => standing.team.originalSeed)).toEqual([
      1, 6, 7
    ]);
  });
});

describe("qualifier crossovers", () => {
  it("does not generate qualifier matches until all pool-play scores are complete", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = generateInitialPoolMatches(teams);

    expect(arePoolPlayMatchesComplete(matches)).toBe(false);
    expect(generateQualifierMatches(teams, matches)).toEqual([]);
  });

  it("generates Round 4 from A/B/C pool finishers with correct work teams", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = completedPoolPlayMatches(teams);
    const finishers = getPoolFinishers(teams, matches);
    const qualifiers = generateQualifierMatches(teams, matches);

    expect(arePoolPlayMatchesComplete(matches)).toBe(true);
    expect(finishers.A.map((team) => team.originalSeed)).toEqual([1, 6, 7]);
    expect(finishers.B.map((team) => team.originalSeed)).toEqual([2, 5, 8]);
    expect(finishers.C.map((team) => team.originalSeed)).toEqual([3, 4, 9]);
    expect(qualifiers).toHaveLength(3);
    expect(qualifiers.map((match) => match.scheduledTime)).toEqual(["11:00 AM", "11:00 AM", "11:00 AM"]);
    expect(matchSeeds(qualifiers[0], teams)).toEqual({ teamA: 6, teamB: 8, workTeam: 1 });
    expect(matchSeeds(qualifiers[1], teams)).toEqual({ teamA: 5, teamB: 9, workTeam: 2 });
    expect(matchSeeds(qualifiers[2], teams)).toEqual({ teamA: 4, teamB: 7, workTeam: 3 });
  });
});

describe("final bracket reseeding", () => {
  it("does not generate final bracket matches until qualifier scores are complete", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = [...completedPoolPlayMatches(teams), ...generateQualifierMatches(teams, completedPoolPlayMatches(teams))];

    expect(areQualifierMatchesComplete(matches)).toBe(false);
    expect(getReseededTeams(teams, matches)).toEqual([]);
    expect(generateFinalBracketMatches(teams, matches)).toEqual([]);
  });

  it("reseeds teams #1-#9 and generates the 12:00 PM Round 5 matches", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = completedMatchesThroughQualifiers(teams);
    const seededTeams = getReseededTeams(teams, matches);
    const finalMatches = generateFinalBracketMatches(teams, matches);

    expect(areQualifierMatchesComplete(matches)).toBe(true);
    expect(seededTeams.map((seededTeam) => seededTeam.team.originalSeed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(finalMatches).toHaveLength(3);
    expect(finalMatches.map((match) => match.scheduledTime)).toEqual(["12:00 PM", "12:00 PM", "12:00 PM"]);
    expect(matchSeeds(finalMatches[0], teams)).toEqual({ teamA: 3, teamB: 6, workTeam: 1 });
    expect(matchSeeds(finalMatches[1], teams)).toEqual({ teamA: 4, teamB: 5, workTeam: 2 });
    expect(matchSeeds(finalMatches[2], teams)).toEqual({ teamA: 8, teamB: 9, workTeam: 7 });
  });
});

function seedsInPool(teams: Team[], pool: PoolId): number[] {
  return teams.filter((team) => team.pool === pool).map((team) => team.originalSeed);
}

function matchSeeds(match: Match, teams: Team[]) {
  return {
    teamA: teams.find((team) => team.id === match.teamAId)?.originalSeed,
    teamB: teams.find((team) => team.id === match.teamBId)?.originalSeed,
    workTeam: teams.find((team) => team.id === match.workTeamId)?.originalSeed
  };
}

function withSets(match: Match, scores: Array<[number, number]>): Match {
  return {
    ...match,
    sets: scores.map(([teamA, teamB]) => ({ teamA, teamB }))
  };
}

function completedPoolPlayMatches(teams: Team[]): Match[] {
  return generateInitialPoolMatches(teams).map((match) => {
    const teamASeed = teams.find((team) => team.id === match.teamAId)?.originalSeed ?? 99;
    const teamBSeed = teams.find((team) => team.id === match.teamBId)?.originalSeed ?? 99;
    return teamASeed < teamBSeed
      ? withSets(match, [
          [25, 18],
          [25, 18]
        ])
      : withSets(match, [
          [18, 25],
          [18, 25]
        ]);
  });
}

function completedMatchesThroughQualifiers(teams: Team[]): Match[] {
  const poolMatches = completedPoolPlayMatches(teams);
  const qualifierMatches = generateQualifierMatches(teams, poolMatches).map((match) => {
    const teamASeed = teams.find((team) => team.id === match.teamAId)?.originalSeed ?? 99;
    const teamBSeed = teams.find((team) => team.id === match.teamBId)?.originalSeed ?? 99;
    return teamASeed < teamBSeed
      ? withSets(match, [
          [25, 18],
          [25, 18]
        ])
      : withSets(match, [
          [18, 25],
          [18, 25]
        ]);
  });

  return [...poolMatches, ...qualifierMatches];
}
