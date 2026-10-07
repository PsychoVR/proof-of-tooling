import { NotImplemented } from "@/lib/errors";
import type {
  Category,
  Cluster,
  LeaderboardResponse,
  Stats,
  ToolStatus,
  ToolWithClaims,
  ValidatorProfile,
} from "@/lib/types";

export async function getStats(): Promise<Stats> {
  throw new NotImplemented("getStats");
}

export async function getLeaderboard(_opts: {
  cluster?: Cluster;
  page?: number;
  pageSize?: number;
}): Promise<LeaderboardResponse> {
  throw new NotImplemented("getLeaderboard");
}

export async function getValidatorProfile(_identity: string): Promise<ValidatorProfile | null> {
  throw new NotImplemented("getValidatorProfile");
}

export async function getTools(_opts: {
  category?: Category;
  status?: ToolStatus;
}): Promise<ToolWithClaims[]> {
  throw new NotImplemented("getTools");
}
