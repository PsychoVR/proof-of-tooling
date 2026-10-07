import { int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const heartbeat = mysqlTable("heartbeat", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
