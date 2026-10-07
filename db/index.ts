import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

let pool: mysql.Pool | undefined;

export function getDb() {
  pool ??= mysql.createPool({ uri: getEnv().DATABASE_URL, connectionLimit: 5 });
  return drizzle(pool, { schema, mode: "default" });
}
