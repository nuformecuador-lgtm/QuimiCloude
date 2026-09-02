import type { SessionUser } from '../domain/session-user';

export interface SessionProvider {
  getSessionUser(): Promise<SessionUser | null>;
  endSession(): Promise<void>;
}
