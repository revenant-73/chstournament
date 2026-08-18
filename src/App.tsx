import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { fetchRemoteTournamentState, saveRemoteTournamentState, verifyAdminPin } from "./apiClient";
import { getCurrentRoute } from "./routes";
import { clearTournamentState, loadTournamentState, saveTournamentState } from "./storage";
import { createTournamentBackupJson, parseTournamentBackupJson } from "./tournament/backup";
import { getCourtStatuses } from "./tournament/dashboard";
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
const publicResultsUrl = "https://chstournament.vercel.app/results";
const publicFlowPreviewRounds = [
  {
    round: 4,
    time: "11:00 AM",
    title: "Qualifier crossovers",
    note: "Second-place teams play third-place teams. Pool winners work.",
    matches: [
      { court: 1, label: "A2 vs B3", work: "A1" },
      { court: 2, label: "B2 vs C3", work: "B1" },
      { court: 3, label: "C2 vs A3", work: "C1" }
    ]
  },
  {
    round: 5,
    time: "12:00 PM",
    title: "Bracket openers",
    note: "After Round 4, teams are reseeded #1 through #9.",
    matches: [
      { court: 1, label: "#3 vs #6", work: "#1" },
      { court: 2, label: "#4 vs #5", work: "#2" },
      { court: 3, label: "#8 vs #9", work: "#7" }
    ]
  },
  {
    round: 6,
    time: "1:00 PM",
    title: "Semifinals and lower bracket",
    note: "Work team is usually the team that lost on that court in Round 5.",
    matches: [
      { court: 1, label: "#1 vs Winner #4/#5", work: "Loser of Court 2" },
      { court: 2, label: "#2 vs Winner #3/#6", work: "Loser of Court 1" },
      { court: 3, label: "#7 vs Winner #8/#9", work: "Loser of Court 3" }
    ]
  },
  {
    round: 7,
    time: "2:00 PM",
    title: "Placement matches",
    note: "Championship, 3rd place, and 5th place are played at the same time.",
    matches: [
      { court: 1, label: "Championship", work: "Previous loser if available" },
      { court: 2, label: "3rd Place", work: "Previous loser if available" },
      { court: 3, label: "5th Place", work: "Previous loser if available" }
    ]
  }
];

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
  const [activeView, setActiveView] = useState<"dashboard" | "setup" | "scores" | "pools" | "bracket">(() =>
    isReadOnly ? "scores" : "dashboard"
  );
  const [adminPin, setAdminPin] = useState(() => sessionStorage.getItem(adminPinKey) ?? "");
  const [adminPinVerified, setAdminPinVerified] = useState(false);
  const [adminPinStatus, setAdminPinStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("Local draft");
  const [backupStatus, setBackupStatus] = useState("");
  const [lastRemoteUpdate, setLastRemoteUpdate] = useState<string | null>(null);
  const hasLoadedRemote = useRef(false);
  const lastSyncedStateJson = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const importFileInput = useRef<HTMLInputElement | null>(null);

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
          lastSyncedStateJson.current = JSON.stringify(remote.state);
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

    if (isReadOnly || !hasLoadedRemote.current || !adminPinVerified) {
      return;
    }

    const stateJson = JSON.stringify(state);
    if (lastSyncedStateJson.current === stateJson) {
      return;
    }

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(async () => {
      try {
        setSyncStatus("Saving to Turso...");
        const updatedAt = await saveRemoteTournamentState(state, adminPin.trim());
        lastSyncedStateJson.current = stateJson;
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
  }, [adminPin, adminPinVerified, isReadOnly, state]);

  const teamsById = useMemo(() => new Map(state.teams.map((team) => [team.id, team])), [state.teams]);
  const courtStatuses = useMemo(() => getCourtStatuses(state.matches), [state.matches]);
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

  function updateMatch(matchId: string, patch: Partial<Pick<Match, "teamAId" | "teamBId" | "workTeamId" | "scheduledTime" | "label">>) {
    setState((current) => ({
      ...current,
      matches: current.matches.map((match) => {
        if (match.id !== matchId) {
          return match;
        }

        const teamsChanged =
          (patch.teamAId !== undefined && patch.teamAId !== match.teamAId) ||
          (patch.teamBId !== undefined && patch.teamBId !== match.teamBId);

        return {
          ...match,
          ...patch,
          sets: teamsChanged ? createEmptyScoreSets() : match.sets
        };
      })
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
    setBackupStatus("");
    setActiveView("setup");
  }

  function exportBackup() {
    const blob = new Blob([createTournamentBackupJson(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `century-varsity-tournament-${dateStamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupStatus("Backup exported");
  }

  async function importBackup(file: File | null) {
    if (!file) {
      return;
    }

    try {
      const importedState = parseTournamentBackupJson(await file.text());
      setState(importedState);
      saveTournamentState(importedState);
      setBackupStatus("Backup imported");
      setActiveView("scores");
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "Backup import failed");
    } finally {
      if (importFileInput.current) {
        importFileInput.current.value = "";
      }
    }
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
    setAdminPinVerified(false);
    setAdminPinStatus("");
    if (!value.trim()) {
      sessionStorage.removeItem(adminPinKey);
    }
  }

  async function unlockAdmin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmedPin = adminPin.trim();
    if (!trimmedPin) {
      setAdminPinStatus("Enter the admin PIN to continue.");
      return;
    }

    try {
      setAdminPinStatus("Checking PIN...");
      await verifyAdminPin(trimmedPin);
      sessionStorage.setItem(adminPinKey, trimmedPin);
      setAdminPinVerified(true);
      setAdminPinStatus("Admin unlocked");
      setSyncStatus(hasLoadedRemote.current ? "Synced with Turso" : syncStatus);
    } catch {
      sessionStorage.removeItem(adminPinKey);
      setAdminPinVerified(false);
      setAdminPinStatus("PIN did not unlock admin access.");
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

  if (route === "qr") {
    return <QrCodePage />;
  }

  if (!adminPinVerified) {
    return (
      <main className="app-shell admin-lock-shell">
        <header className="masthead admin-lock-header">
          <div>
            <p className="eyebrow">Century Volleyball</p>
            <h1>Admin Locked</h1>
          </div>
          <div className="status-stack">
            <div className="stage-pill">{state.stage.replace("_", " ")}</div>
            <div className="sync-pill">{syncStatus}</div>
            {lastRemoteUpdate && <div className="sync-time">Updated {new Date(lastRemoteUpdate).toLocaleTimeString()}</div>}
          </div>
        </header>

        <form className="admin-lock-panel" onSubmit={(event) => void unlockAdmin(event)}>
          <label>
            Admin PIN
            <input
              type="password"
              value={adminPin}
              placeholder="Required for scorekeeping"
              autoFocus
              onChange={(event) => rememberAdminPin(event.target.value)}
            />
          </label>
          <button type="submit">Unlock Admin</button>
          {adminPinStatus && <p>{adminPinStatus}</p>}
          <a href="/results">Open public results</a>
        </form>
      </main>
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

      <section className="backup-bar">
        <div>
          <p className="eyebrow">Emergency Backup</p>
          <strong>Save or restore the full tournament state</strong>
          {backupStatus && <span>{backupStatus}</span>}
        </div>
        <div className="action-row">
          <button className="secondary" onClick={exportBackup}>
            Export JSON
          </button>
          <button className="secondary" onClick={() => importFileInput.current?.click()}>
            Import JSON
          </button>
          <input
            ref={importFileInput}
            className="file-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importBackup(event.currentTarget.files?.[0] ?? null)}
          />
        </div>
      </section>

      <nav className="tabs" aria-label="Primary views">
        <button className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")}>
          Dashboard
        </button>
        <button className={activeView === "setup" ? "active" : ""} onClick={() => setActiveView("setup")}>
          Setup
        </button>
        <button className={activeView === "scores" ? "active" : ""} onClick={() => setActiveView("scores")}>
          Scores
        </button>
        <button className={activeView === "pools" ? "active" : ""} onClick={() => setActiveView("pools")}>
          Pools
        </button>
        <button className={activeView === "bracket" ? "active" : ""} onClick={() => setActiveView("bracket")}>
          Bracket
        </button>
      </nav>

      {activeView === "dashboard" && <DashboardView courtStatuses={courtStatuses} teamsById={teamsById} />}

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
            teams={state.teams}
            teamsById={teamsById}
            isReadOnly={isReadOnly}
            onScoreChange={updateSetScore}
            onMatchChange={updateMatch}
          />
        </>
      )}

      {activeView === "pools" && <PoolsView teams={state.teams} matches={state.matches} />}

      {activeView === "bracket" && (
        <BracketView
          matches={state.matches}
          teamsById={teamsById}
          seededTeams={seededTeams}
          finalPlacements={finalPlacements}
        />
      )}
    </main>
  );
}

function DashboardView({
  courtStatuses,
  teamsById
}: {
  courtStatuses: ReturnType<typeof getCourtStatuses>;
  teamsById: Map<string, Team>;
}) {
  if (!courtStatuses.some((status) => status.totalCount > 0)) {
    return <EmptyState title="No Court Schedule Yet" detail="Generate initial pools from Setup to populate the court dashboard." />;
  }

  return (
    <section className="dashboard-grid">
      {courtStatuses.map((status) => (
        <article className="court-panel" key={status.court}>
          <div className="court-panel-header">
            <p className="eyebrow">Court {status.court}</p>
            <span>
              {status.completedCount}/{status.totalCount} complete
            </span>
          </div>
          <DashboardMatchBlock title="Now" match={status.currentMatch} teamsById={teamsById} fallback="Court complete" />
          <DashboardMatchBlock title="Next" match={status.nextMatch} teamsById={teamsById} fallback="No later match" />
        </article>
      ))}
    </section>
  );
}

function DashboardMatchBlock({
  title,
  match,
  teamsById,
  fallback
}: {
  title: string;
  match?: Match;
  teamsById: Map<string, Team>;
  fallback: string;
}) {
  if (!match) {
    return (
      <div className="dashboard-match muted">
        <strong>{title}</strong>
        <span>{fallback}</span>
      </div>
    );
  }

  const teamA = teamsById.get(match.teamAId)?.name ?? "TBD";
  const teamB = teamsById.get(match.teamBId)?.name ?? "TBD";
  const worker = match.workTeamId ? teamsById.get(match.workTeamId)?.name : "TBD";

  return (
    <div className="dashboard-match">
      <strong>{title}</strong>
      <div className="dashboard-time">
        Round {match.round} | {match.scheduledTime}
      </div>
      <div className="dashboard-teams">
        <span>{teamA}</span>
        <small>vs</small>
        <span>{teamB}</span>
      </div>
      <div className="dashboard-work">Work: {worker}</div>
    </div>
  );
}

function BracketView({
  matches,
  teamsById,
  seededTeams,
  finalPlacements
}: {
  matches: Match[];
  teamsById: Map<string, Team>;
  seededTeams: Array<{ seed: number; team: Team; standing: TeamStanding }>;
  finalPlacements: Array<{ place: number; team: Team; source: string }>;
}) {
  const bracketRounds = [
    { round: 4, title: "Qualifiers", detail: "11:00 AM crossovers" },
    { round: 5, title: "Round 5", detail: "12:00 PM bracket openers" },
    { round: 6, title: "Round 6", detail: "1:00 PM semifinals" },
    { round: 7, title: "Round 7", detail: "2:00 PM placements" }
  ];
  const hasBracketMatches = matches.some((match) => match.round >= 4);

  if (!hasBracketMatches) {
    return <EmptyState title="Bracket Not Generated Yet" detail="Complete pool play, then generate qualifiers from Scores." />;
  }

  return (
    <section className="bracket-view">
      {seededTeams.length === 9 && <ReseedingPanel seededTeams={seededTeams} />}
      {finalPlacements.length === 9 && <FinalStandingsPanel placements={finalPlacements} />}
      <div className="bracket-grid">
        {bracketRounds.map((round) => {
          const roundMatches = matches
            .filter((match) => match.round === round.round)
            .sort((a, b) => a.court - b.court);

          return (
            <section className="bracket-column" key={round.round}>
              <div className="bracket-column-header">
                <h2>{round.title}</h2>
                <span>{round.detail}</span>
              </div>
              {roundMatches.length ? (
                roundMatches.map((match) => <BracketMatchCard key={match.id} match={match} teamsById={teamsById} />)
              ) : (
                <div className="bracket-placeholder">Pending</div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function BracketMatchCard({ match, teamsById }: { match: Match; teamsById: Map<string, Team> }) {
  const result = getMatchResult(match);
  const teamA = teamsById.get(match.teamAId);
  const teamB = teamsById.get(match.teamBId);
  const worker = match.workTeamId ? teamsById.get(match.workTeamId)?.name : "TBD";

  return (
    <article className={result ? "bracket-match complete" : "bracket-match"}>
      <div className="bracket-match-meta">
        <strong>Court {match.court}</strong>
        <span>{match.scheduledTime}</span>
      </div>
      <div className="bracket-match-label">{match.label}</div>
      <div className="bracket-team-row">
        <span className={result?.winnerId === match.teamAId ? "winner" : ""}>{teamA?.name ?? "TBD"}</span>
        <small>{getBracketSetSummary(match, "teamA")}</small>
      </div>
      <div className="bracket-team-row">
        <span className={result?.winnerId === match.teamBId ? "winner" : ""}>{teamB?.name ?? "TBD"}</span>
        <small>{getBracketSetSummary(match, "teamB")}</small>
      </div>
      <div className="bracket-work">Work: {worker}</div>
    </article>
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
  const publicRounds = getPublicScheduleRounds(matches);
  const postedRounds = publicRounds.filter((round) => round.kind === "actual");
  const previewRounds = publicRounds.filter((round): round is PublicPreviewRoundData => round.kind === "preview");
  const previewMatchCount = publicRounds.reduce(
    (total, round) => total + (round.kind === "preview" ? round.matches.length : 0),
    0
  );
  const publicCourtStatuses = getCourtStatuses(matches);

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
        <small>Updates automatically about every 15 seconds.</small>
      </section>

      {matches.length > 0 && <PublicNowNextBand courtStatuses={publicCourtStatuses} teamsById={teamsById} />}

      {finalPlacements.length === 9 && <FinalStandingsPanel placements={finalPlacements} />}

      <section className="public-section">
        <div className="section-title-row">
          <h2>Schedule & Results</h2>
          <span>{matches.length ? `${matches.length} posted${previewMatchCount ? ` + ${previewMatchCount} preview` : ""}` : "Schedule pending"}</span>
        </div>
        {matches.length ? (
          <div className="public-rounds">
            {postedRounds.map((round) => (
              <PublicActualRound key={round.round} round={round.round} matches={round.matches} teamsById={teamsById} />
            ))}
            {previewRounds.length > 0 && <PublicFlowPreviewSection rounds={previewRounds} />}
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

function QrCodePage() {
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function generateQrCode() {
      const dataUrl = await QRCode.toDataURL(publicResultsUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        scale: 10,
        color: {
          dark: "#061011",
          light: "#ffffff"
        }
      });

      if (!cancelled) {
        setQrCodeUrl(dataUrl);
      }
    }

    void generateQrCode();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="qr-page">
      <section className="qr-sheet">
        <p className="eyebrow">Century Volleyball</p>
        <h1>Tournament Schedule & Results</h1>
        <div className="qr-code-frame">
          {qrCodeUrl ? <img src={qrCodeUrl} alt="QR code for Century tournament results" /> : <span>Loading QR code</span>}
        </div>
        <p className="qr-url">{publicResultsUrl}</p>
        <p className="qr-note">Scan for live court assignments, scores, standings, and bracket flow.</p>
        <div className="qr-actions">
          <button onClick={() => window.print()}>Print</button>
          <a href="/results">Open results</a>
        </div>
      </section>
    </main>
  );
}

function PublicFlowPreviewSection({ rounds }: { rounds: PublicPreviewRoundData[] }) {
  const previewMatchCount = rounds.reduce((total, round) => total + round.matches.length, 0);

  return (
    <details className="public-flow-preview" open>
      <summary>
        <span>Tournament flow after pool play</span>
        <small>{previewMatchCount} preview matches</small>
      </summary>
      <div className="public-rounds public-flow-rounds">
        {rounds.map((round) => (
          <PublicPreviewRound key={round.round} round={round} />
        ))}
      </div>
    </details>
  );
}

function PublicNowNextBand({ courtStatuses, teamsById }: { courtStatuses: ReturnType<typeof getCourtStatuses>; teamsById: Map<string, Team> }) {
  return (
    <section className="public-now-next" aria-label="Current and next matches by court">
      <div className="section-title-row">
        <h2>Now / Next</h2>
        <span>By court</span>
      </div>
      <div className="public-court-status-grid">
        {courtStatuses.map((status) => (
          <article className="public-court-status" key={status.court}>
            <div className="public-court-status-head">
              <strong>Court {status.court}</strong>
              <span>
                {status.completedCount}/{status.totalCount} complete
              </span>
            </div>
            <PublicCourtStatusLine title="Now" match={status.currentMatch} teamsById={teamsById} fallback="Done for now" />
            <PublicCourtStatusLine title="Next" match={status.nextMatch} teamsById={teamsById} fallback="No later match posted" />
          </article>
        ))}
      </div>
    </section>
  );
}

function PublicCourtStatusLine({
  title,
  match,
  teamsById,
  fallback
}: {
  title: string;
  match?: Match;
  teamsById: Map<string, Team>;
  fallback: string;
}) {
  if (!match) {
    return (
      <div className="public-court-status-line muted">
        <span>{title}</span>
        <strong>{fallback}</strong>
      </div>
    );
  }

  const teamA = teamsById.get(match.teamAId)?.name ?? "TBD";
  const teamB = teamsById.get(match.teamBId)?.name ?? "TBD";

  return (
    <div className="public-court-status-line">
      <span>
        {title} · R{match.round} · {match.scheduledTime}
      </span>
      <strong>
        {teamA} vs {teamB}
      </strong>
    </div>
  );
}

function PublicActualRound({ round, matches, teamsById }: { round: number; matches: Match[]; teamsById: Map<string, Team> }) {
  return (
    <article className="round-strip" key={round}>
      <div className="round-heading">
        <strong>Round {round}</strong>
        <span>{matches[0]?.scheduledTime}</span>
      </div>
      <div className="court-strip">
        {matches.map((match) => (
          <PublicMatchCard key={match.id} match={match} teamsById={teamsById} />
        ))}
      </div>
    </article>
  );
}

function PublicPreviewRound({ round }: { round: PublicPreviewRoundData }) {
  return (
    <article className="round-strip flow-preview">
      <div className="round-heading">
        <strong>Round {round.round}</strong>
        <span>{round.time}</span>
      </div>
      <div className="court-strip">
        {round.matches.map((match) => (
          <div className="public-match preview-match" key={`${round.round}-${match.court}`}>
            <div className="public-court">Court {match.court}</div>
            <div className="public-teams">
              <span>{match.label}</span>
            </div>
            <div className="public-match-footer">
              <span>{round.title}</span>
              <span>Teams TBD</span>
            </div>
            <div className="public-worker">Work: {match.work}</div>
          </div>
        ))}
        <div className="flow-note">{round.note}</div>
      </div>
    </article>
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
        {result ? (
          <>
            <span className="final-badge">Final</span>
            <span className="final-summary">{winnerName}</span>
          </>
        ) : (
          <span>Upcoming</span>
        )}
        <span className={result ? "score-summary" : ""}>{scoreText}</span>
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
  teams: Team[];
  teamsById: Map<string, Team>;
  isReadOnly: boolean;
  onScoreChange: (matchId: string, setIndex: number, side: keyof SetScore, value: string) => void;
  onMatchChange: (
    matchId: string,
    patch: Partial<Pick<Match, "teamAId" | "teamBId" | "workTeamId" | "scheduledTime" | "label">>
  ) => void;
}

function ScoresView({ matches, teams, teamsById, isReadOnly, onScoreChange, onMatchChange }: ScoresViewProps) {
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
          {!isReadOnly && <DirectorOverride match={match} teams={teams} onMatchChange={onMatchChange} />}
        </article>
      ))}
    </section>
  );
}

function DirectorOverride({
  match,
  teams,
  onMatchChange
}: {
  match: Match;
  teams: Team[];
  onMatchChange: (
    matchId: string,
    patch: Partial<Pick<Match, "teamAId" | "teamBId" | "workTeamId" | "scheduledTime" | "label">>
  ) => void;
}) {
  const sortedTeams = teams.slice().sort((a, b) => a.originalSeed - b.originalSeed);

  return (
    <details className="override-panel">
      <summary>Director override</summary>
      <div className="override-grid">
        <label>
          Team A
          <select value={match.teamAId} onChange={(event) => onMatchChange(match.id, { teamAId: event.target.value })}>
            {sortedTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team B
          <select value={match.teamBId} onChange={(event) => onMatchChange(match.id, { teamBId: event.target.value })}>
            {sortedTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Work Team
          <select
            value={match.workTeamId ?? ""}
            onChange={(event) => onMatchChange(match.id, { workTeamId: event.target.value || undefined })}
          >
            <option value="">TBD</option>
            {sortedTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Time
          <input value={match.scheduledTime} onChange={(event) => onMatchChange(match.id, { scheduledTime: event.target.value })} />
        </label>
        <label className="override-label-wide">
          Label
          <input value={match.label} onChange={(event) => onMatchChange(match.id, { label: event.target.value })} />
        </label>
      </div>
    </details>
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

interface PublicPreviewRoundData {
  kind: "preview";
  round: number;
  time: string;
  title: string;
  note: string;
  matches: Array<{
    court: number;
    label: string;
    work: string;
  }>;
}

type PublicScheduleRound = { kind: "actual"; round: number; matches: Match[] } | PublicPreviewRoundData;

function sortedMatches(matches: Match[]): Match[] {
  return matches.slice().sort((a, b) => a.round - b.round || a.court - b.court);
}

function getPublicScheduleRounds(matches: Match[]): PublicScheduleRound[] {
  const actualRounds = groupMatchesByRound(matches).map(([round, roundMatches]) => ({
    kind: "actual" as const,
    round,
    matches: roundMatches
  }));
  const actualRoundNumbers = new Set(actualRounds.map((round) => round.round));
  const previewRounds = publicFlowPreviewRounds
    .filter((round) => !actualRoundNumbers.has(round.round))
    .map((round) => ({ ...round, kind: "preview" as const }));

  return [...actualRounds, ...previewRounds].sort((a, b) => a.round - b.round);
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

function getBracketSetSummary(match: Match, side: keyof SetScore): string {
  const scores = match.sets
    .map((set) => set[side])
    .filter((score): score is number => score !== null);

  return scores.length ? scores.join(" / ") : "-";
}

function createEmptyScoreSets(): SetScore[] {
  return [
    { teamA: null, teamB: null },
    { teamA: null, teamB: null },
    { teamA: null, teamB: null }
  ];
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
