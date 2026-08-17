import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tournamentSnapshots = sqliteTable("tournament_snapshots", {
  id: text("id").primaryKey(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull()
});
