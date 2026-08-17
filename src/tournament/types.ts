export type PoolId = "A" | "B" | "C";
export type CourtId = 1 | 2 | 3;
export type TournamentStage = "SETUP" | "POOL_PLAY" | "QUALIFIER" | "FINAL_BRACKET" | "COMPLETE";

export interface Team {
  id: string;
  name: string;
  originalSeed: number;
  conference: string;
  pool?: PoolId;
}

export interface SetScore {
  teamA: number | null;
  teamB: number | null;
}

export interface Match {
  id: string;
  round: number;
  court: CourtId;
  label: string;
  pool?: PoolId;
  teamAId: string;
  teamBId: string;
  workTeamId?: string;
  scheduledTime: string;
  sets: SetScore[];
}

export interface MatchResult {
  winnerId: string;
  loserId: string;
  teamASetsWon: number;
  teamBSetsWon: number;
  teamAPoints: number;
  teamBPoints: number;
}

export interface TeamStanding {
  team: Team;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  pointsScored: number;
  pointsAllowed: number;
  setPercentage: number;
  pointPercentage: number;
}

export interface TournamentState {
  stage: TournamentStage;
  teams: Team[];
  matches: Match[];
}
