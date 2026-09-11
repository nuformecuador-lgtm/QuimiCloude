// lib/modules/identity/domain/work-group-input.ts
/**
 * QC-84 T3 — Esquemas de entrada de las operaciones sobre GRUPOS DE TRABAJO
 * (`design.md > 4.1`).
 *
 * Validacion con **zod en el borde** (R14): ningun dato sin validar ni tipar cruza hacia el
 * dominio, y la Server Action y —manana— el formulario de QC-85 validan con el MISMO esquema,
 * porque vive en `domain/` y lo reexporta el contrato del modulo.
 *
 * **LO QUE NO ESTA EN ESTOS ESQUEMAS ES EL REQUISITO**, y `strictObject` hace que mandarlo
 * **FALLE** en vez de ignorarlo en silencio:
 *
 *   - `companyId` — **R11**: la empresa del grupo nuevo sale DEL ACTOR y de ningun otro sitio. No
 *     hay ninguna forma de crear un grupo —ni de mover uno— en una empresa distinta.
 *   - `deletedAt` (ni ninguna marca de baja) — **R10**, **R40**: el grupo nace con la marca vacia,
 *     darlo de baja es su propia operacion y **no existe** ninguna de restaurar.
 *   - `nameNormalized` — **R13**: lo calcula el caso de uso con `normalizeWorkGroupName`, la unica
 *     definicion de «mismo nombre de grupo» que publica el contrato. Si entrara por el borde,
 *     quien llama podria mandar una forma canonica que no corresponde al nombre y romper el indice
 *     unico parcial de QC-83 desde fuera.
 *   - **cualquier lista de miembros** — **R33**: meter y sacar son operaciones propias, de a una.
 *     La decision 6 descarto por escrito el «mandar el conjunto completo» —dos encargados a la vez
 *     se pisan en silencio y el error no puede decir a QUIEN se refiere—, y la forma del borde lo
 *     hace **inexpresable**, no solo desaconsejado.
 *
 * **El tope de 80 es la POSICION POR DEFECTO DE ESTE DISENO, no una decision del humano**
 * (`design.md > 4.1`): la columna `work_groups.name` es `TEXT` **sin limite a proposito** (QC-83
 * R2, «el tope vive en `zod`, no en el tipo, para que cambiarlo no sea una migracion») y ningun
 * requisito lo cita por su valor. Cambiar el numero es una linea aqui y su caso de test.
 *
 * Dominio puro: aqui solo entra `zod` y el propio `domain/` por ruta RELATIVA —nunca el barrel
 * `@/lib/modules/identity`, que crearia un ciclo del modulo consigo mismo—.
 */

import { z } from 'zod';

export const WORK_GROUP_NAME_MAX_LENGTH = 80;

/**
 * `trim()` va ANTES de `min(1)`: al reves, '   ' pasaria el minimo y solo se recortaria DESPUES de
 * validar, asi que un nombre de solo espacios acabaria guardado como nombre vacio (R14). Mismo
 * orden que `trimmed` en `user-input.ts` y que `supplierNameSchema`.
 */
const workGroupNameSchema = z.string().trim().min(1).max(WORK_GROUP_NAME_MAX_LENGTH);

/** El identificador de un grupo o de una persona: lo que viaja es un UUID de la base. */
const idSchema = z.string().uuid();

/**
 * Crear (R10, R11). **Un solo campo**: el nombre. `strictObject` y no `object` porque con `object`
 * una clave desconocida —`companyId`, `deletedAt`, `members`— se DESCARTARIA en silencio y el
 * llamante creeria que surtio efecto; aqui **falla**, que es lo que R11 y R33 piden poder
 * demostrar.
 */
export const createWorkGroupSchema = z.strictObject({
  name: workGroupNameSchema,
});

/** Renombrar (R16, R17): el grupo y su nombre nuevo. Nada mas: renombrar no toca a los miembros. */
export const renameWorkGroupSchema = z.strictObject({
  workGroupId: idSchema,
  name: workGroupNameSchema,
});

/**
 * Meter y sacar a **una** persona (R28, R34). La ENTRADA es la misma para las dos, asi que el
 * esquema es uno; los casos de uso son **dos** y no uno con una bandera (R33): meter y sacar son
 * operaciones distintas, con errores distintos, y una bandera invitaria a construir desde la
 * pantalla la operacion «pon exactamente esta lista» que la decision 6 descarto.
 */
export const workGroupMemberSchema = z.strictObject({
  workGroupId: idSchema,
  userId: idSchema,
});

/**
 * Dar de baja (R37). Solo el identificador: el `now` de la marca de baja lo pone el caso de uso
 * por parametro, no el llamante, y no hay ningun campo que permita pedir lo contrario —restaurar
 * no existe (R40)—.
 */
export const deleteWorkGroupSchema = z.strictObject({
  workGroupId: idSchema,
});

export type CreateWorkGroupInput = z.infer<typeof createWorkGroupSchema>;
export type RenameWorkGroupInput = z.infer<typeof renameWorkGroupSchema>;
export type WorkGroupMemberInput = z.infer<typeof workGroupMemberSchema>;
export type DeleteWorkGroupInput = z.infer<typeof deleteWorkGroupSchema>;
