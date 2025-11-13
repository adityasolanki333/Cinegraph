import { Request } from "express";
import { SQL } from "drizzle-orm";
import { db } from "./db";

// Extend express-session to include userId
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

// Authenticated request with userId
export interface AuthRequest extends Request {
  userId?: string;
}

// Database transaction type - inferred from the actual db.transaction
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// User stats updates type - using SQL type for dynamic SQL expressions
export interface UserStatsUpdate {
  totalReviews?: SQL;
  totalLists?: SQL;
  totalFollowers?: SQL;
  totalFollowing?: SQL;
  totalAwardsReceived?: SQL;
  totalAwardsGiven?: SQL;
  totalComments?: SQL;
  experiencePoints?: SQL;
}

// Award from database with joined user
export interface AwardWithUser {
  id: string;
  userId: string;
  awardType: string;
  createdAt: Date | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  } | null;
}

// Award grouping type
export interface AwardGroup {
  [awardType: string]: AwardWithUser[];
}
