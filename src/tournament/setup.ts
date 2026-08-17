import type { Team } from "./types";

const defaultTeamNames = [
  "Century",
  "Caldera",
  "Centennial",
  "Lake Oswego",
  "Lebanon",
  "McNary",
  "St. Helens",
  "Sunset",
  "Ida B. Wells"
];

export function createDefaultTeams(): Team[] {
  return defaultTeamNames.map((name, index) => ({
    id: `team-${index + 1}`,
    name,
    originalSeed: index + 1,
    conference: "",
    pool: undefined
  }));
}
