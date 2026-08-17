import { useEffect, useMemo, useState } from "react";
import { clearTournamentState, loadTournamentState, saveTournamentState } from "./storage";
import { findConferenceConflicts, generateInitialPoolMatches, generateInitialPools } from "./tournament/pools";
import { createDefaultTeams } from "./tournament/setup";
import { calculatePoolStandings } from "./tournament/standings";
import type { Match, PoolId, SetScore, Team, TournamentState } from "./tournament/types";

const pools: PoolId[] = ["A", "B", "C"];

function createInitialState(): TournamentState {
  return {
    stage: "SETUP",
    teams: createDefaultTeams(),
    matches: []
  };
}

export default function App() {
  const [state, setState] = useState<TournamentState>(() => loadTournamentState() ?? createInitialState());
  const [activeView, setActiveView] = useState<"setup" | "scores" | "pools">("setup");

  useEffect(() => {
    saveTournamentState(state);
  }, [state]);

  const teamsById = useMemo(() => new Map(state.teams.map((team) => [team.id, team])), [state.teams]);
  const conferenceConflicts = useMemo(() => findConferenceConflicts(state.teams), [state.teams]);
  const hasGeneratedPools = state.teams.every((team) => team.pool);

  function updateTeam(teamId: string, patch: Partial<Team>) {
    setState((current) => ({
      ...current,
      teams: current.teams.map((team) => (team.id === teamId ? { ...team, ...patch } : team))
    }));
  }

  function updateSetScore(matchId: string, setIndex: number, side: keyof SetScore, value: string) {
    const parsed = value === "" ? null : Number(value);
    setState((current) => ({
      ...current,
      matches: current.matches.map((match) =>
        match.id === matchId
          ? {
              ...match,
              sets: match.sets.map((set, index) =>
                index === setIndex ? { ...set, [side]: Number.isNaN(parsed) ? null : parsed } : set
              )
            }
          : match
      )
    }));
  }

  function generatePoolsAndSchedule() {
    setState((current) => {
      const teams = generateInitialPools(current.teams);
      return {
        ...current,
        stage: "POOL_PLAY",
        teams,
        matches: generateInitialPoolMatches(teams)
      };
    });
    setActiveView("scores");
  }

  function resetTournament() {
    clearTournamentState();
    setState(createInitialState());
    setActiveView("setup");
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Century Volleyball</p>
          <h1>Varsity Tournament Control</h1>
        </div>
        <div className="stage-pill">{state.stage.replace("_", " ")}</div>
      </header>

      <nav className="tabs" aria-label="Primary views">
        <button className={activeView === "setup" ? "active" : ""} onClick={() => setActiveView("setup")}>
          Setup
        </button>
        <button className={activeView === "scores" ? "active" : ""} onClick={() => setActiveView("scores")}>
          Scores
        </button>
        <button className={activeView === "pools" ? "active" : ""} onClick={() => setActiveView("pools")}>
          Pools
        </button>
      </nav>

      {activeView === "setup" && (
        <SetupView
          teams={state.teams}
          hasGeneratedPools={hasGeneratedPools}
          conferenceConflicts={conferenceConflicts}
          onTeamChange={updateTeam}
          onGenerate={generatePoolsAndSchedule}
          onReset={resetTournament}
        />
      )}

      {activeView === "scores" && (
        <ScoresView matches={sortedMatches(state.matches)} teamsById={teamsById} onScoreChange={updateSetScore} />
      )}

      {activeView === "pools" && <PoolsView teams={state.teams} matches={state.matches} />}
    </main>
  );
}

interface SetupViewProps {
  teams: Team[];
  hasGeneratedPools: boolean;
  conferenceConflicts: Record<PoolId, string[]>;
  onTeamChange: (teamId: string, patch: Partial<Team>) => void;
  onGenerate: () => void;
  onReset: () => void;
}

function SetupView({
  teams,
  hasGeneratedPools,
  conferenceConflicts,
  onTeamChange,
  onGenerate,
  onReset
}: SetupViewProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Phase 1-3</p>
          <h2>Team Seeding</h2>
        </div>
        <div className="action-row">
          <button className="secondary" onClick={onReset}>
            Reset
          </button>
          <button onClick={onGenerate}>Generate Pools</button>
        </div>
      </div>

      <div className="team-grid">
        {teams
          .slice()
          .sort((a, b) => a.originalSeed - b.originalSeed)
          .map((team) => (
            <article className="team-row" key={team.id}>
              <label>
                Seed
                <input
                  type="number"
                  min="1"
                  max="9"
                  value={team.originalSeed}
                  onChange={(event) => onTeamChange(team.id, { originalSeed: Number(event.target.value) })}
                />
              </label>
              <label>
                Team
                <input value={team.name} onChange={(event) => onTeamChange(team.id, { name: event.target.value })} />
              </label>
              <label>
                Conference
                <input
                  value={team.conference}
                  placeholder="Optional"
                  onChange={(event) => onTeamChange(team.id, { conference: event.target.value })}
                />
              </label>
              {hasGeneratedPools && (
                <label>
                  Pool
                  <select value={team.pool} onChange={(event) => onTeamChange(team.id, { pool: event.target.value as PoolId })}>
                    {pools.map((pool) => (
                      <option key={pool} value={pool}>
                        {pool}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </article>
          ))}
      </div>

      {pools.some((pool) => conferenceConflicts[pool].length > 0) && (
        <div className="warning">
          Same-conference pool warning:{" "}
          {pools
            .filter((pool) => conferenceConflicts[pool].length > 0)
            .map((pool) => `Pool ${pool} has ${conferenceConflicts[pool].join(", ")}`)
            .join("; ")}
        </div>
      )}
    </section>
  );
}

interface ScoresViewProps {
  matches: Match[];
  teamsById: Map<string, Team>;
  onScoreChange: (matchId: string, setIndex: number, side: keyof SetScore, value: string) => void;
}

function ScoresView({ matches, teamsById, onScoreChange }: ScoresViewProps) {
  if (!matches.length) {
    return <EmptyState title="No Matches Yet" detail="Generate initial pools from Setup to create the 8:00, 9:00, and 10:00 AM rounds." />;
  }

  return (
    <section className="match-list">
      {matches.map((match) => (
        <article className="match-card" key={match.id}>
          <div className="match-meta">
            <strong>
              Round {match.round} · Court {match.court}
            </strong>
            <span>
              {match.scheduledTime} · {match.label}
            </span>
          </div>
          <ScoreLine match={match} teamId={match.teamAId} team={teamsById.get(match.teamAId)} side="teamA" onScoreChange={onScoreChange} />
          <ScoreLine match={match} teamId={match.teamBId} team={teamsById.get(match.teamBId)} side="teamB" onScoreChange={onScoreChange} />
          <p className="work-team">Work team: {match.workTeamId ? teamsById.get(match.workTeamId)?.name : "TBD"}</p>
        </article>
      ))}
    </section>
  );
}

interface ScoreLineProps {
  match: Match;
  teamId: string;
  team?: Team;
  side: keyof SetScore;
  onScoreChange: (matchId: string, setIndex: number, side: keyof SetScore, value: string) => void;
}

function ScoreLine({ match, team, side, onScoreChange }: ScoreLineProps) {
  return (
    <div className="score-line">
      <div className="team-name">{team?.name ?? "Unknown team"}</div>
      {match.sets.map((set, index) => (
        <label key={index}>
          Set {index + 1}
          <input
            inputMode="numeric"
            type="number"
            min="0"
            value={set[side] ?? ""}
            onChange={(event) => onScoreChange(match.id, index, side, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

function PoolsView({ teams, matches }: { teams: Team[]; matches: Match[] }) {
  if (!teams.every((team) => team.pool)) {
    return <EmptyState title="Pools Not Generated" detail="Use Setup to generate the initial pool assignments." />;
  }

  return (
    <section className="pool-grid">
      {pools.map((pool) => {
        const standings = calculatePoolStandings(teams, matches, pool);
        return (
          <article className="pool-panel" key={pool}>
            <h2>Pool {pool}</h2>
            <div className="standings-table">
              <div className="table-row table-head">
                <span>Team</span>
                <span>Match</span>
                <span>Sets</span>
                <span>Set %</span>
                <span>Point %</span>
              </div>
              {standings.map((standing, index) => (
                <div className="table-row" key={standing.team.id}>
                  <span>
                    {pool}
                    {index + 1} {standing.team.name}
                  </span>
                  <span>
                    {standing.matchesWon}-{standing.matchesLost}
                  </span>
                  <span>
                    {standing.setsWon}-{standing.setsLost}
                  </span>
                  <span>{standing.setPercentage.toFixed(3)}</span>
                  <span>{standing.pointPercentage.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{detail}</p>
    </section>
  );
}

function sortedMatches(matches: Match[]): Match[] {
  return matches.slice().sort((a, b) => a.round - b.round || a.court - b.court);
}
