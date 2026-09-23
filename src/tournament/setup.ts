import type { Team } from "./types";

const defaultTeamNames = [
  "Centennial",
  "Caldera",
  "McNary",
  "Sunset",
  "Lake Oswego",
  "Ida B. Wells",
  "Century",
  "St. Helens",
  "Lebanon"
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
