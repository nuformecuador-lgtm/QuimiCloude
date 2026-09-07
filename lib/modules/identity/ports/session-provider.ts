import type { SessionContext } from '../domain/session-context';
import type { SessionUser } from '../domain/session-user';

export interface SessionProvider {
  getSessionUser(): Promise<SessionUser | null>;
  /**
   * QC-48 (T8, R18): la empresa de la sesion en curso, desde el servidor. Devuelve `null`
   * EXACTAMENTE en los mismos casos en que `getSessionUser` devuelve `null` (R19), porque las dos
   * salidas se cablean desde la MISMA instancia de `createResolveSession` (`design.md > 6`).
   *
   * Lo que devuelve no autoriza nada (R22): la frontera sigue siendo el service
   * (`docs/architecture.md > Acceso a datos y autorizacion`).
   */
  getSessionContext(): Promise<SessionContext | null>;
  endSession(): Promise<void>;
}
