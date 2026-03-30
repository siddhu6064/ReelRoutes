/**
 * User — core identity document.
 * Auth is handled by Clerk; this mirrors the Clerk user
 * into MongoDB for relational queries and trip ownership.
 */
export interface User {
  /** MongoDB ObjectId (string representation) */
  id: string;
  /** Clerk user ID — unique, used as the primary auth key */
  clerkId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  /** OAuth provider IDs for social login correlation */
  googleId?: string;
  appleId?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateUserInput {
  clerkId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  googleId?: string;
  appleId?: string;
}

export interface UpdateUserInput {
  name?: string;
  avatarUrl?: string;
  email?: string;
}
