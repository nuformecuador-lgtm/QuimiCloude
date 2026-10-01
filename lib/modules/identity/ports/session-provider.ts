import type { SessionContext } from '../domain/session-context';
import type { SessionUser } from '../domain/session-user';

export interface SessionProvider {
  getSessionUser(): Promise<SessionUser | null>;
  /**
   * La empresa de la sesion en curso, desde el servidor. Devuelve `null` en los mismos casos en
   * que `getSessionUser` devuelve `null` —las dos salen de la misma resolucion— y ademas cuando la
   * sesion es de alguien sin empresa (el Maestro): entonces `getSessionUser` si devuelve su
   * usuario y toda operacion con ambito de empresa falla cerrado por falta de contexto.
   *
   * Lo que devuelve no autoriza nada (R22): la frontera sigue siendo el service
   * (`docs/architecture.md > Acceso a datos y autorizacion`).
   */
  getSessionContext(): Promise<SessionContext | null>;
  endSession(): Promise<void>;
}
