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
import { effectiveAccountStatus } from './effective-account-status';
import { isSessionExpired } from './session-claims';
import { isStampedOut } from './session-revocation';

import type { SessionReader } from '../ports/session-reader';
import type { SessionUserReader, SessionUserRecord } from '../ports/session-user-reader';
import type { SessionCheckLog } from '../ports/session-check-log';
import type { SessionContext } from './session-context';
import type { SessionUser } from './session-user';

export type ResolveSessionDeps = {
  readonly session: SessionReader;
  readonly users: SessionUserReader;
  /**
   * QC-23 (T10, R16, R17): a donde va la causa cuando la comprobacion NO SE PUDO HACER. No es un
   * puerto de escritura de negocio —esta resolucion sigue sin escribir en la base (R40)—: es el
   * registro del servidor, y es lo que impide que el `catch` de mas abajo quede vacio.
   *
   * Aqui solo viaja la CAUSA. El identificador de peticion de QC-71 lo pone el adaptador de ese
   * puerto y no este dominio: QC-71 R9 prohibe que el identificador atraviese el `domain/` o los
   * `ports/` de un modulo de negocio, y su guardia lo vigila. R17 se cumple entero, en la misma
   * linea de log, pero del otro lado del puerto.
   */
  readonly log: SessionCheckLog;
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
    //
    // QC-23 (T10, R16, R17, `design.md > 4.2`): la llamada va dentro de un `try` acotado
    // EXACTAMENTE a esta linea —igual que `parseSessionClaims` acota el suyo a `JSON.parse`—. Si
    // la base, el puerto o cualquier pieza de la que dependa fallan, la sesion se trata como
    // INVALIDA y la persona acaba en el login: **fallar cerrado**. Una revocacion que se puede
    // saltar provocando un fallo no es una revocacion (decision cerrada 13).
    //
    // QC-23 R14: el `sid` entra como segundo argumento y NO anade ninguna invocacion: el sello y
    // la pertenencia al registro de cerradas llegan en esta MISMA lectura.
    let record: SessionUserRecord | null;
    try {
      record = await deps.users.findActiveById(claims.sub, claims.sessionId);
    } catch (error) {
      // El `catch` NO esta vacio (`docs/conventions.md > Manejo de errores`): la causa y el
      // identificador de peticion —que pone el adaptador— quedan en el registro del SERVIDOR, y al navegador no llega
      // ningun detalle (R17). **El diagnostico nunca lleva el `sid`** (`design.md > 7`): es
      // material de autenticacion, mismo criterio con el que QC-79 prohibio el secreto del
      // enlace. Traducirlo a «sin sesion» es una decision de negocio, no un silencio.
      //
      // Coste declarado y aceptado: una caida de la base se le presenta a la persona como «te
      // echo». Es lo que la decision 13 compro a cambio.
      deps.log.log(diagnosticoDe(error));
      return null;
    }
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

    // 6. QC-78 R20 — el estado EFECTIVO de la cuenta ya no es `active`: sin sesion. Va detras del
    // paso 3 porque necesita la fila, y con `if` propio y no combinado con el anterior: cada
    // corte tiene su test y su `R<n>`.
    //
    // Pasa por `effectiveAccountStatus` y NUNCA por `record.accountStatus !== 'active'` a pelo
    // (alternativa descartada en `design.md > 5`): comparar la columna dejaria fuera de la
    // aplicacion a quien tiene un bloqueo YA VENCIDO hasta que volviera a hacer login, y romperia
    // R7 —la traduccion existiria en un sitio y su ausencia en otro, que es la misma enfermedad
    // que tener dos definiciones—.
    //
    // Cero consultas nuevas y cero escrituras (R21): el estado y el plazo vienen en la MISMA fila
    // que el paso 3 ya leyo, y una ficha con el plazo vencido se corrige en el camino de
    // ESCRITURA del login (R15, R16), no al leerla. Tampoco se consulta ningun sello ni registro
    // de invalidacion de sesiones por usuario (R22): QC-23 no es dependencia de esta ficha, y se
    // decide solo con la ficha que esta resolucion ya relee en cada peticion. Y ninguna tarea
    // programada ni proceso de fondo corrige estados vencidos (R23).
    //
    // ANOTACION DE QC-23 (T10): el parrafo de arriba es de QC-78 y describe SU corte, que no ha
    // cambiado ni una linea —este `if` sigue decidiendo solo con la ficha, sin consultar nada—.
    // Lo que ya no es cierto es la frase «QC-23 no es dependencia»: los cortes 7 y 8 de abajo SI
    // miran el sello y el registro de cerradas (R13). Siguen sin costar ninguna consulta ni
    // ninguna escritura, porque los dos datos vienen en la MISMA fila del paso 3.
    if (effectiveAccountStatus(record, now) !== 'active') return null;

    // 7. QC-23 R8 — el SELLO de la persona mata esta sesion: se emitio en el instante del sello
    // o antes. `if` propio y `R<n>` propio, como todos los de arriba.
    //
    // La comparacion `<=` NO se escribe aqui: la aporta `isStampedOut`, que es su UNICO cuerpo
    // en el repositorio y lo comparte con el calculo del `issuedAt` de la reemision de R31. Dos
    // copias de esa desigualdad serian dos formas de equivocarse (`design.md > 2.3`, `> 4.1`).
    //
    // Cero consultas nuevas y CERO ESCRITURAS (R40): el sello es una columna de `users` que vino
    // en la MISMA fila que el paso 3 ya leyo. La purga de las filas caducadas vive en las dos
    // operaciones del puerto de revocacion, nunca en este camino de lectura (alternativa
    // descartada 6).
    if (isStampedOut(claims, record.sessionsValidFrom)) return null;

    // 8. QC-23 R11 — esta sesion, y solo esta, fue cerrada una a una: hay fila en el registro
    // para su `sid`. Basta con que exista; el instante solo sirve para el diagnostico humano.
    //
    // R18 — los cortes 7 y 8 son INDEPENDIENTES y CONMUTATIVOS: los dos salen por el mismo
    // `return null`, que es el mismo camino de salida de siempre, y sus dos datos llegan juntos
    // en la misma lectura, asi que adelantar uno no ahorra IO. El sello va primero por claridad
    // y por coste conceptual, no porque el orden cambie el resultado.
    if (record.sessionRevokedAt !== null) return null;

    // 9. Compone las dos proyecciones. Salir por `null` en cualquiera de los ocho cortes es el
    // MISMO camino de salida de siempre: el layout privado redirige al login, no se borra
    // ninguna cookie y no hay mensaje que diga por que (R16, QC-78 R20, `design.md > 4.3`).
    return {
      user: {
        id: record.id,
        username: record.username,
        displayName: buildDisplayName(record.firstNames, record.lastNames, record.username),
        roleName: record.roleName,
        // QC-74 R7, R11 — los permisos viajan TAL CUAL desde el record: sin normalizar, sin
        // ordenar y sin deduplicar. Esta cadena decide si hay sesion, no que puede hacer quien
        // la tiene; eso lo decide `assertPermission` en cada caso de uso.
        permissions: record.permissions,
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

/**
 * QC-23 (T10, R17) — la CAUSA en texto, para el registro del servidor y solo para el.
 *
 * Se queda con el mensaje del error y nunca con el objeto entero: un error de Prisma arrastra la
 * consulta, los parametros y los nombres de tabla, y por ahi se cuela PII en un log. Lo que no
 * es `Error` se describe por su tipo, sin volcar su contenido, por lo mismo.
 *
 * **Nunca incluye el `sid`, ni el `sub`, ni nada de los claims** (`design.md > 7`): un
 * identificador de sesion es material de autenticacion —con el y la firma correcta se entra— y
 * esta funcion no recibe los claims, asi que anadirlo por descuido no es posible.
 */
function diagnosticoDe(error: unknown): string {
  const causa = error instanceof Error ? error.message : typeof error;
  return `resolve-session: la comprobacion de sesion fallo (${causa})`;
}
