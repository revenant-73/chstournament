import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRemoteTournamentState, saveRemoteTournamentState } from "./apiClient";
import { getCurrentRoute } from "./routes";
import { clearTournamentState, loadTournamentState, saveTournamentState } from "./storage";
import { findConferenceConflicts, generateInitialPoolMatches, generateInitialPools } from "./tournament/pools";
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
} from "./tournament/finalBracket";
import { arePoolPlayMatchesComplete, generateQualifierMatches } from "./tournament/qualifiers";
import { createDefaultTeams } from "./tournament/setup";
import { getMatchResult } from "./tournament/scoring";
import { calculatePoolStandings } from "./tournament/standings";
import type { Match, PoolId, SetScore, Team, TeamStanding, TournamentState } from "./tournament/types";

const pools: PoolId[] = ["A", "B", "C"];
const adminPinKey = "century-varsity-admin-pin";

function createInitialState(): TournamentState {
  return {
    stage: "SETUP",
    teams: createDefaultTeams(),
    matches: []
  };
}

export default function App() {
  const route = getCurrentRoute();
  const isReadOnly = route === "results";
  const [state, setState] = useState<TournamentState>(() => loadTournamentState() ?? createInitialState());
  const [activeView, setActiveView] = useState<"setup" | "scores" | "pools">(() => (isReadOnly ? "scores" : "setup"));
  const [adminPin, setAdminPin] = useState(() => sessionStorage.getItem(adminPinKey) ?? "");
  const [syncStatus, setSyncStatus] = useState("Local draft");
  const [lastRemoteUpdate, setLastRemoteUpdate] = useState<string | null>(null);
  const hasLoadedRemote = useRef(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteState() {
      try {
        const remote = await fetchRemoteTournamentState();
        if (cancelled) {
          return;
        }
        hasLoadedRemote.current = true;
        if (remote.state) {
          setState(remote.state);
          saveTournamentState(remote.state);
          setLastRemoteUpdate(remote.updatedAt);
          setSyncStatus(isReadOnly ? "Live results loaded" : "Synced with Turso");
        } else {
          setSyncStatus(isReadOnly ? "Waiting for tournament data" : "No hosted data yet");
        }
      } catch {
        hasLoadedRemote.current = true;
        setSyncStatus(isReadOnly ? "Offline results view" : "Local-only mode");
      }
    }

    loadRemoteState();
    if (isReadOnly) {
      const interval = window.setInterval(loadRemoteState, 15000);
      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [isReadOnly]);

  useEffect(() => {
    saveTournamentState(state);

    if (isReadOnly || !hasLoadedRemote.current || !adminPin.trim()) {
      return;
    }

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(async () => {
      try {
        setSyncStatus("Saving to Turso...");
        const updatedAt = await saveRemoteTournamentState(state, adminPin.trim());
        setLastRemoteUpdate(updatedAt);
        setSyncStatus("Saved to Turso");
      } catch {
        setSyncStatus("Local changes saved; Turso sync failed");
      }
    }, 600);

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [adminPin, isReadOnly, state]);

  const teamsById = useMemo(() => new Map(state.teams.map((team) => [team.id, team])), [state.teams]);
  const conferenceConflicts = useMemo(() => findConferenceConflicts(state.teams), [state.teams]);
  const hasGeneratedPools = state.teams.every((team) => team.pool);
  const poolPlayComplete = useMemo(() => arePoolPlayMatchesComplete(state.matches), [state.matches]);
  const qualifierComplete = useMemo(() => areQualifierMatchesComplete(state.matches), [state.matches]);
  const roundFiveComplete = useMemo(() => areRoundFiveMatchesComplete(state.matches), [state.matches]);
  const roundSixComplete = useMemo(() => areRoundSixMatchesComplete(state.matches), [state.matches]);
  const roundSevenComplete = useMemo(() => areRoundSevenMatchesComplete(state.matches), [state.matches]);
  const seededTeams = useMemo(() => getReseededTeams(state.teams, state.matches), [state.matches, state.teams]);
  const finalPlacements = useMemo(() => getFinalPlacements(state.teams, state.matches), [state.matches, state.teams]);
  const hasQualifierMatches = state.matches.some((match) => match.round === 4);
  const hasFinalBracketMatches = state.matches.some((match) => match.round >= 5);
  const hasRoundSixMatches = state.matches.some((match) => match.round >= 6);
  const hasRoundSevenMatches = state.matches.some((match) => match.round >= 7);

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

  function generateQualifiers() {
    setState((current) => {
      if (current.matches.some((match) => match.round === 4)) {
        return current;
      }

      const qualifierMatches = generateQualifierMatches(current.teams, current.matches);
      if (!qualifierMatches.length) {
        return current;
      }

      return {
        ...current,
        stage: "QUALIFIER",
        matches: [...current.matches, ...qualifierMatches]
      };
    });
    setActiveView("scores");
  }

  function generateFinalBracket() {
    setState((current) => {
      if (current.matches.some((match) => match.round >= 5)) {
        return current;
      }

      const finalBracketMatches = generateFinalBracketMatches(current.teams, current.matches);
      if (!finalBracketMatches.length) {
        return current;
      }

      return {
        ...current,
        stage: "FINAL_BRACKET",
        matches: [...current.matches, ...finalBracketMatches]
      };
    });
    setActiveView("scores");
  }

  function generateRoundSix() {
    setState((current) => {
      if (current.matches.some((match) => match.round >= 6)) {
        return current;
      }

      const roundSixMatches = generateRoundSixMatches(current.teams, current.matches);
      if (!roundSixMatches.length) {
        return current;
      }

      return {
        ...current,
        matches: [...current.matches, ...roundSixMatches]
      };
    });
    setActiveView("scores");
  }

  function generateRoundSeven() {
    setState((current) => {
      if (current.matches.some((match) => match.round >= 7)) {
        return current;
      }

      const roundSevenMatches = generateRoundSevenMatches(current.teams, current.matches);
      if (!roundSevenMatches.length) {
        return current;
      }

      return {
        ...current,
        matches: [...current.matches, ...roundSevenMatches]
      };
    });
    setActiveView("scores");
  }

  function rememberAdminPin(value: string) {
    setAdminPin(value);
    if (value.trim()) {
      sessionStorage.setItem(adminPinKey, value.trim());
    } else {
      sessionStorage.removeItem(adminPinKey);
    }
  }

  if (isReadOnly) {
    return (
      <PublicResultsView
        state={state}
        teamsById={teamsById}
        syncStatus={syncStatus}
        lastRemoteUpdate={lastRemoteUpdate}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Century Volleyball</p>
          <h1>Varsity Tournament Control</h1>
        </div>
        <div className="status-stack">
          <div className="stage-pill">{state.stage.replace("_", " ")}</div>
          <div className="sync-pill">{syncStatus}</div>
          {lastRemoteUpdate && <div className="sync-time">Updated {new Date(lastRemoteUpdate).toLocaleTimeString()}</div>}
        </div>
      </header>

      <section className="admin-bar">
        <label>
          Admin PIN
          <input
            type="password"
            value={adminPin}
            placeholder="Required for hosted saves"
            onChange={(event) => rememberAdminPin(event.target.value)}
          />
        </label>
        <a href="/results">Open public results</a>
      </section>

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
        <>
          <ProgressionPanel
            poolPlayComplete={poolPlayComplete}
            qualifierComplete={qualifierComplete}
            roundFiveComplete={roundFiveComplete}
            roundSixComplete={roundSixComplete}
            roundSevenComplete={roundSevenComplete}
            hasQualifierMatches={hasQualifierMatches}
            hasFinalBracketMatches={hasFinalBracketMatches}
            hasRoundSixMatches={hasRoundSixMatches}
            hasRoundSevenMatches={hasRoundSevenMatches}
            onGenerateQualifiers={generateQualifiers}
            onGenerateFinalBracket={generateFinalBracket}
            onGenerateRoundSix={generateRoundSix}
            onGenerateRoundSeven={generateRoundSeven}
          />
          {finalPlacements.length === 9 && <FinalStandingsPanel placements={finalPlacements} />}
          {seededTeams.length === 9 && <ReseedingPanel seededTeams={seededTeams} />}
          <ScoresView
            matches={sortedMatches(state.matches)}
            teamsById={teamsById}
            isReadOnly={isReadOnly}
            onScoreChange={updateSetScore}
          />
        </>
      )}

      {activeView === "pools" && <PoolsView teams={state.teams} matches={state.matches} />}
    </main>
  );
}

function ReseedingPanel({
  seededTeams
}: {
  seededTeams: Array<{ seed: number; team: Team; standing: TeamStanding }>;
}) {
  return (
    <section className="reseeding-panel">
      <div className="section-title-row">
        <h2>Reseeding</h2>
        <span>Through Round 4</span>
      </div>
      <div className="seed-grid">
        {seededTeams.map(({ seed, team, standing }) => (
          <article className="seed-card" key={team.id}>
            <strong>#{seed} {team.name}</strong>
            <span>
              {standing.matchesWon}-{standing.matchesLost} | Sets {standing.setsWon}-{standing.setsLost} | Set{" "}
              {standing.setPercentage.toFixed(3)} | Point {standing.pointPercentage.toFixed(3)}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinalStandingsPanel({ placements }: { placements: Array<{ place: number; team: Team; source: string }> }) {
  return (
    <section className="final-standings-panel">
      <div className="section-title-row">
        <h2>Final Standings</h2>
        <span>Tournament complete</span>
      </div>
      <div className="placement-grid">
        {placements.map((placement) => (
          <article className={placement.place <= 3 ? "placement-card podium" : "placement-card"} key={placement.team.id}>
            <strong>{formatPlace(placement.place)}</strong>
            <span>{placement.team.name}</span>
            <small>{placement.source}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProgressionPanel({
  poolPlayComplete,
  qualifierComplete,
  roundFiveComplete,
  roundSixComplete,
  roundSevenComplete,
  hasQualifierMatches,
  hasFinalBracketMatches,
  hasRoundSixMatches,
  hasRoundSevenMatches,
  onGenerateQualifiers,
  onGenerateFinalBracket,
  onGenerateRoundSix,
  onGenerateRoundSeven
}: {
  poolPlayComplete: boolean;
  qualifierComplete: boolean;
  roundFiveComplete: boolean;
  roundSixComplete: boolean;
  roundSevenComplete: boolean;
  hasQualifierMatches: boolean;
  hasFinalBracketMatches: boolean;
  hasRoundSixMatches: boolean;
  hasRoundSevenMatches: boolean;
  onGenerateQualifiers: () => void;
  onGenerateFinalBracket: () => void;
  onGenerateRoundSix: () => void;
  onGenerateRoundSeven: () => void;
}) {
  const canGenerateQualifiers = poolPlayComplete && !hasQualifierMatches;
  const canGenerateFinalBracket = hasQualifierMatches && qualifierComplete && !hasFinalBracketMatches;
  const canGenerateRoundSix = hasFinalBracketMatches && roundFiveComplete && !hasRoundSixMatches;
  const canGenerateRoundSeven = hasRoundSixMatches && roundSixComplete && !hasRoundSevenMatches;
  const buttonLabel = hasRoundSevenMatches
    ? "Round 7 Added"
    : hasRoundSixMatches
      ? "Generate Round 7"
    : hasFinalBracketMatches
      ? "Generate Round 6"
    : hasQualifierMatches
      ? "Generate Final Bracket"
      : "Generate Qualifiers";
  const buttonAction = canGenerateRoundSeven
    ? onGenerateRoundSeven
    : canGenerateRoundSix
    ? onGenerateRoundSix
    : canGenerateFinalBracket
      ? onGenerateFinalBracket
      : onGenerateQualifiers;

  return (
    <section className="progression-panel">
      <div>
        <p className="eyebrow">Next Step</p>
        <h2>
          {hasRoundSixMatches
            ? "2:00 PM Finals"
            : hasFinalBracketMatches
            ? "1:00 PM Semifinals"
            : hasQualifierMatches
              ? "12:00 PM Final Bracket"
              : "11:00 AM Qualifier Crossovers"}
        </h2>
        <p>
          {hasRoundSevenMatches
            ? roundSevenComplete
              ? "Final standings are ready."
              : "Enter all three Round 7 scores to complete final standings."
            : hasRoundSixMatches
            ? roundSixComplete
              ? "Round 6 is complete. Generate the 2:00 PM championship, 3rd place, and 5th place matches."
              : "Enter all three Round 6 scores before Round 7 can be generated."
            : hasFinalBracketMatches
            ? roundFiveComplete
              ? "Round 5 is complete. Generate the 1:00 PM semifinal and lower-bracket matches."
              : "Enter all three Round 5 scores before Round 6 can be generated."
            : hasQualifierMatches
              ? qualifierComplete
                ? "Round 4 is complete. Generate #3/#6, #4/#5, and #8/#9."
                : "Enter all three qualifier scores before the final bracket can be generated."
              : poolPlayComplete
              ? "Pool play is complete. Generate A2/B3, B2/C3, and C2/A3."
              : "Enter all nine pool-play scores before Round 4 can be generated."}
        </p>
      </div>
      <button
        disabled={!(canGenerateQualifiers || canGenerateFinalBracket || canGenerateRoundSix || canGenerateRoundSeven)}
        onClick={buttonAction}
      >
        {buttonLabel}
      </button>
    </section>
  );
}

function PublicResultsView({
  state,
  teamsById,
  syncStatus,
  lastRemoteUpdate
}: {
  state: TournamentState;
  teamsById: Map<string, Team>;
  syncStatus: string;
  lastRemoteUpdate: string | null;
}) {
  const matches = sortedMatches(state.matches);
  const hasPools = state.teams.every((team) => team.pool);
  const finalPlacements = getFinalPlacements(state.teams, state.matches);

  return (
    <main className="app-shell public-shell">
      <header className="public-header">
        <div>
          <p className="eyebrow">Century Volleyball</p>
          <h1>Schedule</h1>
        </div>
        <div className="public-status">
          <strong>{state.stage.replace("_", " ")}</strong>
          <span>{getPublicSyncLabel(syncStatus)}</span>
          {lastRemoteUpdate && <span>Updated {new Date(lastRemoteUpdate).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
        </div>
      </header>

      <section className="parent-note">
        <strong>Find your court, then the time.</strong>
        <span>Work team means that team is helping officiate, not playing.</span>
      </section>

      {finalPlacements.length === 9 && <FinalStandingsPanel placements={finalPlacements} />}

      <section className="public-section">
        <div className="section-title-row">
          <h2>Schedule & Results</h2>
          <span>{matches.length ? `${matches.length} matches` : "Schedule pending"}</span>
        </div>
        {matches.length ? (
          <div className="public-rounds">
            {groupMatchesByRound(matches).map(([round, roundMatches]) => (
              <article className="round-strip" key={round}>
                <div className="round-heading">
                  <strong>Round {round}</strong>
                  <span>{roundMatches[0]?.scheduledTime}</span>
                </div>
                <div className="court-strip">
                  {roundMatches.map((match) => (
                    <PublicMatchCard key={match.id} match={match} teamsById={teamsById} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Schedule Not Posted Yet" detail="Tournament staff will post court assignments after pools are generated." />
        )}
      </section>

      {hasPools && (
        <details className="public-standings">
          <summary>Pool standings</summary>
          <PoolsView teams={state.teams} matches={state.matches} />
        </details>
      )}
    </main>
  );
}

function PublicMatchCard({ match, teamsById }: { match: Match; teamsById: Map<string, Team> }) {
  const result = getMatchResult(match);
  const teamA = teamsById.get(match.teamAId);
  const teamB = teamsById.get(match.teamBId);
  const winnerName = result ? teamsById.get(result.winnerId)?.name : null;
  const scoreText = getScoreText(match);

  return (
    <div className={result ? "public-match complete" : "public-match"}>
      <div className="public-court">Court {match.court}</div>
      <div className="public-teams">
        <span className={result?.winnerId === match.teamAId ? "winner" : ""}>{teamA?.name ?? "TBD"}</span>
        <span className="versus">vs</span>
        <span className={result?.winnerId === match.teamBId ? "winner" : ""}>{teamB?.name ?? "TBD"}</span>
      </div>
      <div className="public-match-footer">
        <span>{result ? `Final: ${winnerName}` : "Upcoming"}</span>
        <span>{scoreText}</span>
      </div>
      <div className="public-worker">Work: {match.workTeamId ? teamsById.get(match.workTeamId)?.name : "TBD"}</div>
    </div>
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
  isReadOnly: boolean;
  onScoreChange: (matchId: string, setIndex: number, side: keyof SetScore, value: string) => void;
}

function ScoresView({ matches, teamsById, isReadOnly, onScoreChange }: ScoresViewProps) {
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
          <ScoreLine
            match={match}
            team={teamsById.get(match.teamAId)}
            side="teamA"
            isReadOnly={isReadOnly}
            onScoreChange={onScoreChange}
          />
          <ScoreLine
            match={match}
            team={teamsById.get(match.teamBId)}
            side="teamB"
            isReadOnly={isReadOnly}
            onScoreChange={onScoreChange}
          />
          <MatchOutcome match={match} teamsById={teamsById} />
          <p className="work-team">Work team: {match.workTeamId ? teamsById.get(match.workTeamId)?.name : "TBD"}</p>
        </article>
      ))}
    </section>
  );
}

interface ScoreLineProps {
  match: Match;
  team?: Team;
  side: keyof SetScore;
  isReadOnly: boolean;
  onScoreChange: (matchId: string, setIndex: number, side: keyof SetScore, value: string) => void;
}

function ScoreLine({ match, team, side, isReadOnly, onScoreChange }: ScoreLineProps) {
  return (
    <div className={isReadOnly ? "score-line read-only" : "score-line"}>
      <div className="team-name">{team?.name ?? "Unknown team"}</div>
      {match.sets.map((set, index) => (
        <label key={index}>
          Set {index + 1}
          {isReadOnly ? (
            <span className="score-box">{set[side] ?? "-"}</span>
          ) : (
            <input
              inputMode="numeric"
              type="number"
              min="0"
              value={set[side] ?? ""}
              onChange={(event) => onScoreChange(match.id, index, side, event.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}

function MatchOutcome({ match, teamsById }: { match: Match; teamsById: Map<string, Team> }) {
  const result = getMatchResult(match);
  if (!result) {
    return <p className="match-outcome">Result pending</p>;
  }

  return <p className="match-outcome">Winner: {teamsById.get(result.winnerId)?.name ?? "TBD"}</p>;
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

function groupMatchesByRound(matches: Match[]): Array<[number, Match[]]> {
  const grouped = new Map<number, Match[]>();
  for (const match of matches) {
    grouped.set(match.round, [...(grouped.get(match.round) ?? []), match]);
  }

  return [...grouped.entries()].map(([round, roundMatches]) => [
    round,
    roundMatches.slice().sort((a, b) => a.court - b.court)
  ]);
}

function getScoreText(match: Match): string {
  const playedSets = match.sets.filter((set) => set.teamA !== null && set.teamB !== null);
  if (!playedSets.length) {
    return "No score";
  }

  return playedSets.map((set) => `${set.teamA}-${set.teamB}`).join(", ");
}

function getPublicSyncLabel(syncStatus: string): string {
  if (syncStatus.toLowerCase().includes("offline")) {
    return "Offline";
  }
  if (syncStatus.toLowerCase().includes("waiting")) {
    return "Waiting";
  }
  return "Live";
}

function formatPlace(place: number): string {
  if (place === 1) {
    return "1st";
  }
  if (place === 2) {
    return "2nd";
  }
  if (place === 3) {
    return "3rd";
  }
  return `${place}th`;
}
