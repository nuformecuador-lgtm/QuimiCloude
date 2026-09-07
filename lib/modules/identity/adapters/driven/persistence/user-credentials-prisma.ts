import { prisma } from '@/lib/shared/db/prisma';

import type { AccountLockState } from '../../../domain/account-lock';
import type { AuthenticatableUser } from '../../../ports/user-credentials-reader';

// Implementa dos puertos del modulo `identity`:
// - `UserCredentialsReader` (`../../../ports/user-credentials-reader`): `findActiveByUsername`;
// - `LoginAttemptRecorder` (`../../../ports/login-attempt-recorder`): `compareAndSetLoginAttempt`
//   cumple `compareAndSet` y `setLoginAttempt` cumple `set`.
// El cableado nombre a nombre lo hace el punto de composicion.

/** Fila cruda que devuelve Postgres: nombres de columna, no de modelo. */
type FilaCredenciales = {
  id: string;
  password_hash: string;
  failed_login_attempts: number;
  lock_level: number;
  locked_until: Date | null;
  role_name: string;
  company_id: string;
  company_deleted_at: Date | null;
};

/**
 * Busca un usuario NO borrado por su nombre de usuario, sin distinguir mayusculas (R1, R4, R5).
 *
 * Va con `$queryRaw` parametrizado (template tag, jamas interpolacion de cadenas) y no con la
 * API tipada y `mode: 'insensitive'` por una razon concreta: la unicidad del nombre de usuario
 * vive como indice funcional parcial `users_username_unique` sobre
 * `lower(username) WHERE deleted_at IS NULL`. `mode: 'insensitive'` genera `ILIKE`, que **no**
 * usa ese indice: el login haria un seq scan sobre `users` en la ruta mas caliente de la app.
 *
 * Devuelve el id, el hash, el estado de bloqueo y el NOMBRE DEL ROL. Ni correo, ni documento, ni
 * nombre, ni telefono: lo que no sale de la base no se puede filtrar por error en un log (R15).
 * Por lo mismo, aqui no hay ni un `console.*`.
 *
 * QC-9 (R26) — el rol entra por un `JOIN roles` en ESTA misma consulta, no en una segunda: el
 * login sigue costando exactamente una lectura. `design.md > 3.6` lo describe como
 * «el `select` añade `role: { select: { name: true } }`», que es la forma tipada; aqui no aplica
 * porque esta consulta va con `$queryRaw` por el motivo del parrafo anterior (el indice funcional
 * parcial), y cambiarla a la API tipada para añadir una columna reintroduciria el seq scan que
 * ese parrafo evita. El `JOIN` es la traduccion literal de esa fila a SQL.
 *
 * QC-48 (R2) — el identificador de la empresa entra como una COLUMNA MAS de `users`
 * (`u.company_id`), que es un campo de la fila que esta consulta ya lee: traerlo no cuesta ni
 * una lectura mas. Su marca de baja no esta en esa fila —vive en `companies`— y entra por un
 * `JOIN companies c ON c.id = u.company_id` en ESTA misma consulta, exactamente igual que QC-9
 * hizo con el rol: el `JOIN` resuelve por la clave primaria de `companies`, asi que el plan gana
 * una busqueda de indice y **no** gana un viaje a la base. El login sigue costando una lectura.
 * De la empresa salen esas dos columnas y nada mas: ni su nombre, ni su normalizado, ni sus
 * marcas de creacion (R6).
 *
 * La fila SI se devuelve cuando la empresa esta dada de baja: aqui no hay
 * `AND c.deleted_at IS NULL`. El corte de «empresa no viva» es del DOMINIO
 * (`verify-credentials.ts`, QC-48 R3, R4) y no del `WHERE`, porque tiene que gastar igualmente
 * su verificacion de hash y porque una regla de acceso escondida en un `WHERE` solo se puede
 * afirmar contra Postgres, no con objetos planos.
 *
 * `INNER JOIN` y no `LEFT`, en los dos: `users.role_id` es NOT NULL con clave foranea
 * `onDelete: Restrict`, asi que todo usuario vivo tiene rol; y `users.company_id` lo mismo desde
 * QC-47 (R9, R10, R11), asi que todo usuario vivo tiene empresa. Si un dia no la tuviera, la
 * persona no se encontraria —y no entraria— en vez de emitirse una sesion con un rol o una
 * empresa inventados (QC-48 R5).
 */
export async function findActiveByUsername(username: string): Promise<AuthenticatableUser | null> {
  const filas = await prisma.$queryRaw<FilaCredenciales[]>`
    SELECT u.id, u.password_hash, u.failed_login_attempts, u.lock_level, u.locked_until,
           r.name AS role_name,
           u.company_id, c.deleted_at AS company_deleted_at
    FROM users u
    JOIN roles r ON r.id = u.role_id
    JOIN companies c ON c.id = u.company_id
    WHERE lower(u.username) = lower(${username}) AND u.deleted_at IS NULL
    LIMIT 1
  `;

  const fila = filas[0];
  if (fila === undefined) return null;

  // El raw no pasa por el mapeo de Prisma: las conversiones son explicitas y no implicitas.
  return {
    id: fila.id,
    passwordHash: fila.password_hash,
    failedAttempts: Number(fila.failed_login_attempts),
    lockLevel: Number(fila.lock_level),
    lockedUntil: fila.locked_until === null ? null : new Date(fila.locked_until),
    roleName: fila.role_name,
    companyId: fila.company_id,
    companyDeletedAt: fila.company_deleted_at === null ? null : new Date(fila.company_deleted_at),
  };
}

/**
 * Escritura CONDICIONAL del estado de bloqueo que ya calculo el dominio (`nextLockState`),
 * sin decidir nada sobre la escalada (R22, R23, R27, R30). Aplica `siguiente` solo si la fila
 * sigue en `esperado`, y devuelve si llego a afectarla.
 *
 * Es lo que hace que el contador aguante intentos concurrentes: el caso de uso lee el estado,
 * tarda ~110 ms en bcrypt y solo entonces escribe. Con un `UPDATE` incondicional, N intentos
 * en paralelo leerian `0` y escribirian todos `1`, y la cuenta no se bloquearia nunca. Si el
 * `UPDATE` no afecta a ninguna fila, otro intento se adelanto y el dominio relee y recalcula.
 *
 * El par `(failedAttempts, lockLevel)` NO identifica por si solo el estado de la fila, y por eso
 * no basta como predicado. `(0, 1)` existe con dos `locked_until` distintos: como bloqueo recien
 * consumado —`(0, 1, T_futuro)`— y como ese mismo bloqueo ya caducado —`(0, 1, T_pasado)`—; y se
 * vuelve a `(0, 1)` despues de un login correcto, que deja `(0, 0, null)`, mas otros cinco
 * fallos. Es un ABA de manual: un intento que leyo `(0, 1, T_pasado)` y llega tarde con su
 * escritura casaria el predicado contra un bloqueo VIVO y lo borraria, dejando fuera al bloqueo
 * que la politica acababa de imponer. Se comprobo ejecutandolo contra Postgres.
 *
 * Por eso el predicado exige ademas que **no haya bloqueo vigente en `now`**, y lo hace con un
 * RANGO (`locked_until` nulo o `<= now`) y no con una igualdad contra `esperado.lockedUntil`.
 * La distincion no es de estilo: `locked_until` es `timestamptz(6)` —microsegundos en Postgres—
 * y un `Date` de JS solo llega al milisegundo, asi que una igualdad seria una comparacion que
 * un dia deja de casar en silencio y el CAS no volveria a aplicar nunca. Un rango no necesita
 * que las marcas de tiempo casen exactamente, solo que caigan del lado correcto.
 *
 * Los tres caminos legitimos siguen pasando: el fallo normal y el quinto fallo salen de filas
 * con `locked_until` nulo, y un bloqueo ya caducado entra por el `lte: now`.
 *
 * `updateMany` y no `update` porque el `where` lleva columnas que no son clave; como `id` si es
 * la primaria, el conjunto afectado es de 0 o 1 filas.
 */
export async function compareAndSetLoginAttempt(
  userId: string,
  esperado: AccountLockState,
  siguiente: AccountLockState,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      failedLoginAttempts: esperado.failedAttempts,
      lockLevel: esperado.lockLevel,
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
    },
    data: {
      failedLoginAttempts: siguiente.failedAttempts,
      lockLevel: siguiente.lockLevel,
      lockedUntil: siguiente.lockedUntil,
    },
  });

  return count === 1;
}

/**
 * Escritura INCONDICIONAL del estado de bloqueo. Solo la usa el camino de exito, cuyo estado
 * es todo ceros y no depende del valor previo.
 *
 * Aqui si va la API tipada por clave primaria: no necesita el indice funcional y asi el
 * compilador vigila los nombres de las columnas.
 */
export async function setLoginAttempt(userId: string, estado: AccountLockState): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: estado.failedAttempts,
      lockLevel: estado.lockLevel,
      lockedUntil: estado.lockedUntil,
    },
  });
}
