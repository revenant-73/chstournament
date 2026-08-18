import { describe, expect, it } from "vitest";
import { createTournamentBackupJson, parseTournamentBackupJson } from "./backup";
import { getCourtStatuses } from "./dashboard";
import {
  areQualifierMatchesComplete,
  areRoundFiveMatchesComplete,
  areRoundSixMatchesComplete,
  areRoundSevenMatchesComplete,
  generateFinalBracketMatches,
  generateRoundSevenMatches,
  generateRoundSixMatches,
  getFinalPlacements,
  getReseededTeams
} from "./finalBracket";
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

  it("generates the 1:00 PM Round 6 matches from Round 5 results", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = completedMatchesThroughRoundFive(teams);
    const roundSixMatches = generateRoundSixMatches(teams, matches);

    expect(areRoundFiveMatchesComplete(matches)).toBe(true);
    expect(roundSixMatches).toHaveLength(3);
    expect(roundSixMatches.map((match) => match.scheduledTime)).toEqual(["1:00 PM", "1:00 PM", "1:00 PM"]);
    expect(matchSeeds(roundSixMatches[0], teams)).toEqual({ teamA: 1, teamB: 4, workTeam: 5 });
    expect(matchSeeds(roundSixMatches[1], teams)).toEqual({ teamA: 2, teamB: 3, workTeam: 6 });
    expect(matchSeeds(roundSixMatches[2], teams)).toEqual({ teamA: 7, teamB: 8, workTeam: 9 });
  });

  it("generates the 2:00 PM Round 7 placement matches from Round 6 results", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = completedMatchesThroughRoundSix(teams);
    const roundSevenMatches = generateRoundSevenMatches(teams, matches);

    expect(areRoundSixMatchesComplete(matches)).toBe(true);
    expect(roundSevenMatches).toHaveLength(3);
    expect(roundSevenMatches.map((match) => match.scheduledTime)).toEqual(["2:00 PM", "2:00 PM", "2:00 PM"]);
    expect(roundSevenMatches.map((match) => match.label)).toEqual(["Championship", "3rd Place", "5th Place"]);
    expect(matchSeeds(roundSevenMatches[0], teams)).toEqual({ teamA: 1, teamB: 2, workTeam: undefined });
    expect(matchSeeds(roundSevenMatches[1], teams)).toEqual({ teamA: 4, teamB: 3, workTeam: undefined });
    expect(matchSeeds(roundSevenMatches[2], teams)).toEqual({ teamA: 6, teamB: 5, workTeam: 8 });
  });

  it("calculates final 1st through 9th placements after Round 7 scores", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = completedMatchesThroughRoundSeven(teams);
    const placements = getFinalPlacements(teams, matches);

    expect(areRoundSevenMatchesComplete(matches)).toBe(true);
    expect(placements).toHaveLength(9);
    expect(placements.map((placement) => placement.team.originalSeed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(placements.map((placement) => placement.source)).toEqual([
      "Championship winner",
      "Championship runner-up",
      "3rd-place winner",
      "3rd-place runner-up",
      "5th-place winner",
      "5th-place runner-up",
      "Lower-bracket final winner",
      "Lower-bracket final runner-up",
      "#8/#9 match loser"
    ]);
  });
});

describe("tournament backup", () => {
  it("exports and imports a wrapped tournament backup", () => {
    const state = {
      stage: "POOL_PLAY" as const,
      teams: generateInitialPools(createDefaultTeams()),
      matches: generateInitialPoolMatches(generateInitialPools(createDefaultTeams()))
    };

    expect(parseTournamentBackupJson(createTournamentBackupJson(state))).toEqual(state);
  });

  it("rejects JSON that is not a tournament state", () => {
    expect(() => parseTournamentBackupJson('{"hello":"world"}')).toThrow("Century tournament backup");
  });
});

describe("court dashboard", () => {
  it("shows current and next incomplete match for each court", () => {
    const teams = generateInitialPools(createDefaultTeams());
    const matches = generateInitialPoolMatches(teams);
    const statuses = getCourtStatuses([
      withSets(matches[0], [
        [25, 18],
        [25, 18]
      ]),
      ...matches.slice(1)
    ]);

    expect(statuses[0].currentMatch?.id).toBe("pool-A-round-2");
    expect(statuses[0].nextMatch?.id).toBe("pool-A-round-3");
    expect(statuses[0].completedCount).toBe(1);
    expect(statuses[1].currentMatch?.id).toBe("pool-B-round-1");
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

function completedMatchesThroughRoundFive(teams: Team[]): Match[] {
  const matchesThroughQualifiers = completedMatchesThroughQualifiers(teams);
  const roundFiveMatches = generateFinalBracketMatches(teams, matchesThroughQualifiers).map((match) => {
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

  return [...matchesThroughQualifiers, ...roundFiveMatches];
}

function completedMatchesThroughRoundSix(teams: Team[]): Match[] {
  const matchesThroughRoundFive = completedMatchesThroughRoundFive(teams);
  const roundSixMatches = generateRoundSixMatches(teams, matchesThroughRoundFive).map((match) => {
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

  return [...matchesThroughRoundFive, ...roundSixMatches];
}

function completedMatchesThroughRoundSeven(teams: Team[]): Match[] {
  const matchesThroughRoundSix = completedMatchesThroughRoundSix(teams);
  const roundSevenMatches = generateRoundSevenMatches(teams, matchesThroughRoundSix).map((match) => {
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

  return [...matchesThroughRoundSix, ...roundSevenMatches];
}
