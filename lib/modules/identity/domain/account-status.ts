/**
 * El conjunto CERRADO de estados de cuenta de un usuario (QC-65, R1, R3, R4; decisiones
 * cerradas 1 y 2). Este archivo es la UNICA definicion del conjunto en TypeScript: toda otra
 * representacion —el `enum UserAccountStatus` de `db/schema.prisma` y el tipo de Postgres que
 * crea `db/migrations/<ts>_user_account_status/migration.sql`— tiene que coincidir con esta
 * lista EXACTAMENTE, mismos cuatro valores y misma grafia. Que no diverjan lo vigilan
 * `tests/unit/identity/schema/account-status-schema.test.ts` y
 * `tests/unit/identity/schema/account-status-migration.test.ts`, que importan estas constantes
 * de verdad en vez de copiar los literales (mismo patron que `INITIAL_COMPANY_NAME` en QC-47 y
 * `DOCUMENT_TYPE_CODES` en QC-4).
 *
 * Los valores van en INGLES y en minuscula, literalmente como los fijo la decision cerrada 1.
 * Se apartan a proposito de `OrderStatus`/`OrderPriority`, que son MAYUSCULAS en espanol: tener
 * una segunda grafia («ACTIVE» en el codigo, «active» en la ficha) es exactamente la clase de
 * traduccion silenciosa que se desincroniza.
 *
 * QUE SIGNIFICA CADA UNO (decision cerrada 2):
 *   active   — la cuenta funciona.
 *   pending  — creada, aun no habilitada para entrar.
 *   inactive — apagada a proposito por un administrador. REVERSIBLE.
 *   blocked  — bloqueada por seguridad. Es LA MISMA COSA que el bloqueo por intentos fallidos
 *              de QC-19, pero QC-65 no los unifica: eso es QC-78.
 *
 * El orden de la lista no significa nada (no hay prelacion entre estados, a diferencia de
 * `OrderPriority`): se escribe en el orden de la decision cerrada 1 para que el test que la
 * compara con el esquema y con el SQL pueda ser una igualdad ORDENADA y no un conjunto.
 *
 * LO QUE ESTE ARCHIVO NO CONTIENE, y es deliberado (`design.md > 2`): ninguna funcion de
 * transicion, ningun `canTransition`, ningun `isLoginAllowed`. El modelo NO restringe
 * transiciones (R14) y NADIE lee todavia el estado para decidir nada (R19): los casos de uso
 * que lo cambian son QC-66 y quien lo lee para cortar el acceso es QC-78.
 */
export const USER_ACCOUNT_STATUSES = ['active', 'pending', 'inactive', 'blocked'] as const

/** Union de literales: exigir un estado inexistente no compila. */
export type UserAccountStatus = (typeof USER_ACCOUNT_STATUSES)[number]

/**
 * Estado con el que NACE una cuenta nueva (decision cerrada 3). Es el mismo valor que el
 * `@default(pending)` de la columna: la base lo pone y esta constante lo nombra.
 */
export const INITIAL_USER_ACCOUNT_STATUS: UserAccountStatus = 'pending'

/**
 * Estado del administrador que crea el seed de acceso inicial (decision cerrada 4, R7). NO es
 * el default de la columna: el seed lo escribe EXPLICITO, porque una cuenta inicial `pending`
 * cerraria el sistema sobre si mismo en cuanto QC-78 corte el login por estado.
 */
export const SEED_ADMIN_ACCOUNT_STATUS: UserAccountStatus = 'active'
