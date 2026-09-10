// lib/modules/identity/domain/user-view.ts
/**
 * QC-66 T8 — Tipos de SALIDA de las dos consultas de usuarios (`design.md > 6.3`). Viven en
 * `domain/` -no en `ports/`- porque describen el QUE se dice, no el COMO se habla con el mundo, y
 * es lo unico que el contrato publico (`index.ts`) puede reexportar (mismo criterio que
 * `proveedores/domain/supplier-view.ts`).
 *
 * **LO QUE NO SALE POR NINGUNA DE LAS DOS**, y es el requisito, no un olvido:
 *
 *   - `passwordHash` — **R31**, **R32**: ningun dato de credencial cruza hacia el cliente. El
 *     adaptador driven **enumera** las columnas en el `select` de Prisma: nunca un `findMany` sin
 *     `select`, que es exactamente como un hash acaba en un payload del navegador.
 *   - `mustChangeCredential` — **R31**, **R32**: tambien es dato de credencial, y la pantalla de
 *     QC-67 no lo muestra ni lo edita.
 *   - `failedLoginAttempts`, `lockLevel`, `lockedUntil` — **R45**: los tres contadores de QC-19 no
 *     los lee ni los escribe esta ficha; el mecanismo de bloqueo es de QC-19/QC-78.
 *   - `companyId` — **R33**: toda consulta esta ya acotada a la empresa del actor por el puerto,
 *     asi que seria siempre la misma y solo invitaria a filtrar en memoria lo que ya filtro la
 *     consulta. Y no es editable (R20).
 *   - `deletedAt` — **R34**, **R39**: las dos consultas excluyen los borrados, asi que seria
 *     siempre `null`; no hay listado de borrados ni recuperacion.
 *   - `accountStatusChangedBy` — es un **IDENTIFICADOR** que la pantalla no muestra, y exponerlo
 *     obligaria a resolver un nombre mas (una consulta y un `select` de mas para un dato que nadie
 *     pide). `accountStatusChangedAt` si sale, porque es legible por si solo.
 *
 * Dominio puro (R42): este archivo no importa framework, Prisma, `lib/shared/**`, `lib/composition`
 * ni las tripas de otro modulo, y de su propio modulo importa por ruta RELATIVA.
 */

import type { UserAccountStatus } from './account-status';

/**
 * Una FILA del listado (R31): identificador, nombre mostrable, nombre de usuario, correo, rol y
 * estado de cuenta. Seis claves, **estas y ninguna mas** -un test afirma las claves EXACTAS, no
 * solo que falten algunas-.
 *
 * `displayName` lo compone **`buildDisplayName`** (`domain/display-name.ts`, que ya existe y ya
 * tiene tests): no se concatena a mano en el adaptador. `roleName` viaja ya resuelto -`Role` es un
 * modelo de `identity`, asi que el `select` del rol es legal- y es **display**: no autoriza nada;
 * quien autoriza es el permiso (R1, R4).
 */
export type UserRow = {
  readonly id: string;
  readonly displayName: string;
  readonly username: string;
  readonly email: string;
  readonly roleName: string;
  readonly accountStatus: UserAccountStatus;
};

/**
 * La FICHA individual por identificador (R32): los nueve campos que R19 declara editables, mas el
 * rol resuelto para mostrarlo, el estado de cuenta con el instante de su ultimo cambio y las dos
 * marcas de tiempo de la fila. Quince claves, **estas y ninguna mas**.
 *
 * `birthDate` es un `Date` porque la columna es `@db.Date`; pasarla a `YYYY-MM-DD` para un
 * `<input type="date">` es de la pantalla (QC-67), no del dominio.
 *
 * `documentTypeCode` es `string` y no la union cerrada de `DOCUMENT_TYPE_CODES` a proposito: el
 * conjunto lo manda la tabla `document_types` (QC-4) y la constante de TypeScript es solo su
 * contrapartida para el codigo, asi que una fila puede traer un codigo que el codigo todavia no
 * nombra. En la ENTRADA si se exige la union: ahi el codigo elige.
 */
export type UserDetail = {
  readonly id: string;
  readonly firstNames: string;
  readonly lastNames: string;
  readonly birthDate: Date;
  readonly email: string;
  readonly phone: string;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  readonly username: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly accountStatus: UserAccountStatus;
  readonly accountStatusChangedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
