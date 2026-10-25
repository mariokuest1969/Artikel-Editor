import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const appStorageState = pgTable("app_storage_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
