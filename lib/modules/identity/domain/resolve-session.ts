// QC-48 T7 — La cadena de cortes que ES la politica de «hay sesion», en UN SOLO SITIO
// (`design.md > 4.2`). Hasta QC-47 vivia en `resolve-session-user.ts`; esta ficha necesita DOS
// proyecciones de esa misma politica —el `SessionUser` de la zona privada y el `SessionContext`
// que consumiran QC-49..QC-60— y duplicar la cadena seria tener dos definiciones distintas de
// «hay sesion», justo lo que R21 prohibe. Asi que la cadena se muda aqui entera y
// `resolve-session-user.ts` pasa a ser una proyeccion suya.
//
// Cubre R14, R15, R16, R17, R19, R20, R21. Los cortes que ya existian (QC-8 R1, R10-R14, R23) se
// conservan en el mismo orden y con el mismo comentario.

import { buildDisplayName } from './display-name';
import { isSessionExpired } from './session-claims';

import type { SessionReader } from '../ports/session-reader';
import type { SessionUserReader } from '../ports/session-user-reader';
import type { SessionContext } from './session-context';
import type { SessionUser } from './session-user';

export type ResolveSessionDeps = {
  readonly session: SessionReader;
  readonly users: SessionUserReader;
};

/** Las dos proyecciones de la MISMA resolucion, compuestas de una sola pasada (R21). */
export type ResolvedSession = {
  readonly user: SessionUser;
  readonly context: SessionContext;
};

/**
 * `now` entra como parametro con valor por defecto, igual que `createSessionTicket` (QC-7): es
 * lo que hace testeable la caducidad sin reloj falso ni `sleep`.
 */
export function createResolveSession(
  deps: ResolveSessionDeps,
): (now?: Date) => Promise<ResolvedSession | null> {
  return async function resolveSession(now: Date = new Date()): Promise<ResolvedSession | null> {
    const claims = await deps.session.readClaims();
    // 1. Sin cookie, prefijo invalido, version no vigente, firma que no casa o contenido que no
    // valida: el lector ya lo resolvio como "nada" (QC-8 R2-R6; aqui cae tambien QC-48 R9, el
    // contenido `v3` sin `cid` o con un `cid` mal formado).
    if (claims === null) return null;

    // 2. Caducada: tampoco justifica una consulta a la base (QC-8 R7, QC-48 R17).
    if (isSessionExpired(claims, now)) return null;

    // 3. Solo aqui, con una sesion con forma valida y sin caducar, se consulta por el `sub`
    // en cada peticion (QC-8 R10): el rol, la empresa y el estado activo son siempre los
    // actuales. Es la UNICA consulta de la cadena, y QC-48 no anade ninguna (R13).
    const record = await deps.users.findActiveById(claims.sub);
    // No existe, o esta dado de baja (`deleted_at`): sin sesion aunque la firma y la
    // caducidad fueran impecables (QC-8 R11).
    if (record === null) return null;

    // 4. QC-48 R14 — la empresa firmada no es la de la ficha. Va DETRAS del paso 3 porque no se
    // puede comparar contra una fila que todavia no se ha leido, y adelantarlo haria que una
    // sesion caducada costara una consulta (R17).
    if (record.companyId !== claims.companyId) return null;

    // 5. QC-48 R15 — la empresa de la ficha no esta viva (`deleted_at IS NULL` es el unico
    // criterio, QC-47 R6). `if` propio y no combinado con el anterior: cada corte tiene su test
    // y su `R<n>` (`design.md > 4.2`).
    if (record.companyDeletedAt !== null) return null;

    // 6. Compone las dos proyecciones. Salir por `null` en cualquiera de los cinco cortes es el
    // MISMO camino de salida de siempre: el layout privado redirige al login y no se borra
    // ninguna cookie (R16, `design.md > 4.3`).
    return {
      user: {
        id: record.id,
        username: record.username,
        displayName: buildDisplayName(record.firstNames, record.lastNames, record.username),
        roleName: record.roleName,
      },
      context: {
        userId: record.id,
        // R20 — `companyId` sale de `record`, o sea de la BASE, y NO de `claims`. Tras el corte 4
        // los dos valores son iguales por construccion, asi que la eleccion no cambia el valor:
        // cambia de quien es la culpa el dia que dejen de serlo. El valor firmado queda reducido
        // a lo unico que es, material de comparacion (`design.md > 6`).
        companyId: record.companyId,
        roleName: record.roleName,
      },
    };
  };
}
