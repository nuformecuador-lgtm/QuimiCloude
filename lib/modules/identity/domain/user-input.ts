// lib/modules/identity/domain/user-input.ts
/**
 * QC-66 T8 — Esquemas de entrada de la administracion de usuarios (`design.md > 6.1` y `> 6.2`).
 *
 * Validacion con **zod en el borde** (R18): ningun dato sin validar ni tipar cruza hacia el
 * dominio, y la Server Action de T14 y -manana- el formulario de QC-67 validan con el MISMO
 * esquema, porque vive en `domain/` y se reexporta por el contrato del modulo.
 *
 * **LO QUE NO ESTA EN ESTOS ESQUEMAS ES EL REQUISITO**, y `strictObject` hace que mandarlo
 * **FALLE** en vez de ignorarlo en silencio (`design.md > 6.1`):
 *
 *   - `companyId` — **R14**: la empresa del usuario nuevo sale DEL ACTOR y de ningun otro sitio.
 *     No hay ninguna forma de crear ni de mover un usuario a una empresa distinta (R20).
 *   - **cualquier** campo de contrasena — **R15**, **R16** (y decision cerrada 10): la credencial
 *     la genera el sistema detras de un puerto que devuelve SOLO su hash, y no entra ni sale por
 *     ningun borde. Cambiar la propia es QC-36; restablecer la de otro, QC-89.
 *   - `accountStatus` en el alta — **R13**: la cuenta NACE en `pending`. Moverlo despues es otra
 *     operacion, con su propio esquema (`setAccountStatusSchema`) y su propio permiso de escritura.
 *   - `mustChangeCredential` — **R13**: nace en VERDADERO, lo escribe el puerto, no el llamante.
 *   - `failedLoginAttempts`, `lockLevel`, `lockedUntil` — **R45**: los tres contadores de QC-19 no
 *     entran por ningun esquema de entrada (`strictObject` los rechaza). Los escribe SOLO
 *     `applyGuardedChange` al salir de `blocked`, con el estado de `clearedLockState()` (QC-95,
 *     que enmienda R45 de QC-66).
 *
 * **Sin validacion de FORMATO de correo ni de telefono, y sin normalizacion del nombre de usuario
 * mas alla de `trim`** (`design.md > 6.1`): es lo que hace el modelo hoy —los tres indices unicos
 * de QC-47 aplican `lower(...)` **en la base**—, y anadir aqui un `z.email()`, un patron de
 * telefono o un `toLowerCase()` seria reabrir QC-47 por la puerta de atras. **No lo "mejores"**:
 * si alguna vez hace falta, se decide en una ficha que tambien mire los indices.
 *
 * **Los largos maximos son la POSICION POR DEFECTO DE ESTE DISENO, no una decision del humano**
 * (`design.md > 6.1`, igual que QC-43 D14 y QC-38): la base tiene estas columnas como `TEXT` sin
 * restriccion y **no se le anade ninguna** (R43). Ningun requisito los cita por su valor a
 * proposito: cambiar un numero es una linea de `zod` y su caso de test, nunca una migracion.
 *
 * Dominio puro (R42): aqui solo entra `zod` y el propio `domain/` por ruta RELATIVA -nunca el
 * barrel `@/lib/modules/identity`, que crearia un ciclo del modulo consigo mismo-.
 */

import { z } from 'zod';

import { USER_ACCOUNT_STATUSES } from './account-status';
import { DOCUMENT_TYPE_CODES } from './document-type';

export const USER_NAME_MAX_LENGTH = 80;
export const USER_EMAIL_MAX_LENGTH = 160;
export const USER_PHONE_MAX_LENGTH = 40;
export const USER_DOCUMENT_NUMBER_MAX_LENGTH = 40;
export const USER_USERNAME_MAX_LENGTH = 60;

/**
 * `trim()` va ANTES de `min(1)`: al revés, '   ' pasaria el minimo y solo se recortaria DESPUES
 * de validar, asi que una cadena de espacios acabaria guardada como nombre vacio. Mismo orden que
 * `supplierNameSchema` y `productNameSchema`.
 */
function trimmed(max: number): z.ZodType<string, unknown> {
  return z.string().trim().min(1).max(max);
}

/**
 * La fecha de nacimiento viaja como `YYYY-MM-DD` (`design.md > 6.1`), que es lo que emite un
 * `<input type="date">` y lo que llega por `FormData`. `z.iso.date()` rechaza el formato y las
 * fechas imposibles (`2026-13-01`), y NO acepta un instante con hora: la columna es `@db.Date`.
 *
 * Convertirla al `Date` que pide el puerto (`design.md > 7`, `NewUser.birthDate`) es del caso de
 * uso: el borde valida la FORMA de lo que llega, no elige la representacion de la persistencia.
 */
const birthDateSchema = z.iso.date();

/**
 * Los OCHO campos del alta (`design.md > 6.1`) mas el rol. `strictObject` y no `object`: con
 * `object`, una clave desconocida -`companyId`, `passwordHash`, `accountStatus`- se DESCARTARIA en
 * silencio y el llamante creeria que surtio efecto. Aqui **falla**, que es lo que R14 y R20 piden
 * poder demostrar.
 */
export const createUserSchema = z.strictObject({
  firstNames: trimmed(USER_NAME_MAX_LENGTH),
  lastNames: trimmed(USER_NAME_MAX_LENGTH),
  birthDate: birthDateSchema,
  email: trimmed(USER_EMAIL_MAX_LENGTH),
  phone: trimmed(USER_PHONE_MAX_LENGTH),
  /** El conjunto cerrado de QC-4, importado: el literal `'CC'` no se escribe a mano (R18). */
  documentTypeCode: z.enum(DOCUMENT_TYPE_CODES),
  documentNumber: trimmed(USER_DOCUMENT_NUMBER_MAX_LENGTH),
  username: trimmed(USER_USERNAME_MAX_LENGTH),
  /** R18: si el rol no existe, quien lo rechaza es el puerto con `role_not_found`. */
  roleId: z.string().uuid(),
  /**
   * **QC-79 R1 — el UNICO campo nuevo del alta, y es OPCIONAL.** Esto ENMIENDA la linea de arriba
   * que decia «**cualquier** campo de contrasena» por QC-66 R15: la contrasena ya no la genera el
   * sistema al azar. Si el administrador la escribe, se evalua contra la politica de QC-19 y se
   * guarda como hash de QC-5 (R2, R3); si no la escribe, **no se genera ninguna** (R4) y el acceso
   * lo da el enlace por correo (R7).
   *
   * Lo que NO cambia: `password`, `passwordHash`, `newPassword` y cualquier otro nombre siguen
   * siendo claves desconocidas y `strictObject` los sigue RECHAZANDO, igual que `companyId`,
   * `accountStatus`, `mustChangeCredential` y los tres contadores. El campo nuevo es este y ninguno
   * mas.
   *
   * **Sin `trim()` y sin `max()`, a proposito** (`design.md > 5.2`): QC-19 R10 prohibe recortar o
   * normalizar la candidata -un espacio al final es parte de la contrasena- y el maximo lo pone la
   * propia politica (`max_length`, QC-19 R11), no un segundo numero escrito aqui que podria
   * divergir de ella. El nombre dice `credential` y no `password` por
   * `guard-password-never-plaintext`: se adapta el nombre, no la guardia.
   *
   * **La cadena vacia NO se contempla aqui, y tampoco es un olvido**: `min(1)` la rechaza, y quien
   * la convierte en «ausente» -que es lo que R1 exige: ausencia y cadena vacia son lo MISMO- es
   * `create-user.ts`, en UN solo sitio y antes de este esquema. Meter aqui un `transform` seria el
   * segundo sitio.
   */
  credential: z.string().min(1).optional(),
});

/**
 * La edicion son los **NUEVE** campos de R19 -los ocho del alta mas el rol- y es **REEMPLAZO
 * COMPLETO**: no hay edicion parcial campo a campo (R19), asi que el esquema es el MISMO que el
 * del alta y no un `partial()`. Si alguien los separa y afloja uno, el test que recorre los dos
 * esquemas a la vez lo dice.
 *
 * Y **no admite** empresa, contrasena, estado de cuenta, marca de cambio de credencial ni ningun
 * contador de acceso (R20): no porque se ignoren, sino porque `strictObject` los RECHAZA.
 *
 * **QC-79: el `omit` del campo nuevo es el requisito, no una simplificacion.** `design.md > 5.2`
 * dice que `credential` entra «dentro del `strictObject` existente», y ahi ese diseno no se
 * sostiene literalmente: hasta hoy este esquema ERA el del alta, asi que meter el campo dentro sin
 * mas haria que **la EDICION admitiera una contrasena**, y **QC-66 R20 lo prohibe expresamente**.
 * El campo nuevo es **solo del alta** (QC-79 R1), asi que la edicion lo quita explicitamente. Lo
 * demas se conserva entero: sigue siendo el MISMO objeto que el alta -reemplazo completo de los
 * nueve campos, no un `partial()`- y el test que recorre los dos esquemas a la vez sigue en pie.
 */
export const updateUserSchema = createUserSchema.omit({ credential: true });

/**
 * Mover el estado de cuenta (`design.md > 6.2`). El conjunto cerrado se **importa** de QC-65:
 * **el enum NO se reescribe**, y admite los **cuatro** valores como destino desde cualquier otro
 * porque en esta feature no hay transiciones prohibidas (R26).
 *
 * Aqui no viaja el autor ni el instante del cambio: los escribe el caso de uso con el actor y el
 * reloj (R25). Un `accountStatusChangedBy` que llegara del cliente seria un autor a eleccion de
 * quien llama, y `strictObject` lo rechaza.
 */
export const setAccountStatusSchema = z.strictObject({
  accountStatus: z.enum(USER_ACCOUNT_STATUSES),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SetAccountStatusInput = z.infer<typeof setAccountStatusSchema>;
