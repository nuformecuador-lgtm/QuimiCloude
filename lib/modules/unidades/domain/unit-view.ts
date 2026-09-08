// lib/modules/unidades/domain/unit-view.ts
//
// QC-39 (R1, R2, R3; `design.md > 2.1`). Lo que el LISTADO del catalogo devuelve por cada
// unidad, que es MAS de lo que otro modulo puede saber de una unidad (`UnitRef`).
//
// **Es un tipo NUEVO y NO un `UnitRef` mas gordo, a proposito.** `UnitRef` es tambien lo que
// devuelve `UnitCatalog.findRefs` -el servicio que `recetas` consume para resolver ids
// conocidos-: ensancharlo obligaria a ampliar ESA otra proyeccion y arrastraria esta ficha
// hasta otro modulo (R3). Como `UnitView` EXTIENDE `UnitRef`, todo lo que hoy esta tipado
// como `UnitRef` -los dos selectores de unidad de `app/`- sigue compilando y sigue recibiendo
// lo que espera (R4).

import type { UnitId, UnitRef } from './unit-catalog';

export type UnitView = UnitRef & {
  /** Unidad de la que esta deriva, o `null` si es BASE. Viaja el identificador y no el nombre:
   *  el modelo `Unit` declara `baseUnitId` como escalar y NO tiene relacion Prisma, asi que la
   *  proyeccion no puede traer el nombre sin tocar el esquema (`design.md > 2.3`). Quien pinte
   *  la equivalencia resuelve el nombre contra el catalogo que ya pide. */
  readonly baseUnitId: UnitId | null;
  /** Cuantas unidades de la apuntada caben en una de esta. **Texto decimal, NUNCA `number`**
   *  (R1), igual que `UnitConversion` y que el esquema de entrada: este es el unico modulo del
   *  ERP que decidio no tener coma flotante y la lectura no la reintroduce. `null` cuando la
   *  unidad es base -entonces `baseUnitId` tambien lo es: los dos van juntos o ninguno-. */
  readonly factor: string | null;
  /** Si la unidad es DE SISTEMA, o sea si no pertenece a ninguna empresa. Viaja DERIVADO (R2):
   *  el identificador de empresa no cruza la frontera hacia el cliente, y quien lo consume solo
   *  necesita saber si la fila lleva acciones, no de quien es la unidad. La definicion de «de
   *  sistema» sigue siendo una sola -`companyId === null`-, la misma de las escrituras. */
  readonly isSystem: boolean;
};
