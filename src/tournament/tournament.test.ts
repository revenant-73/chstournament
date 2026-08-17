import { describe, expect, it } from "vitest";
import { generateInitialPoolMatches, generateInitialPools } from "./pools";
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
