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
//
// `baseUnitId` y `factor` los aporta ya `UnitRef` desde QC-26bis -QC-39 los declaraba tambien
// aqui, con tipos identicos-, asi que `UnitView` SOLO anade `isSystem` (2026-09-08, QC-39). Se
// adelgazo porque dos declaraciones identicas del mismo campo obligan a mantener la misma
// verdad en dos sitios y, si algun dia `UnitRef` estrechara uno de los dos tipos, la
// interseccion lo estrecharia aqui EN SILENCIO. Lo que `UnitRef` aporta sigue siendo verdad y
// esta ficha sigue dependiendo de ello: el `factor` viaja como TEXTO decimal y NUNCA `number`
// (R1) -es un `decimal(14,4)` que no cabe en coma flotante sin riesgo de redondeo-, y
// `baseUnitId` y `factor` van los DOS o NINGUNO -ambos `null` cuando la unidad es base-.
// Quien protege el adelgazamiento es `tests/unit/unidades/unit-view-projection.test.ts`: afirma
// los SEIS campos de la proyeccion, asi que si alguien retirara `baseUnitId` o `factor` de
// `UnitRef` -y `UnitView` los perdiera sin avisar- ese caso se pone rojo.

import type { UnitRef } from './unit-catalog';

export type UnitView = UnitRef & {
  /** Si la unidad es DE SISTEMA, o sea si no pertenece a ninguna empresa. Viaja DERIVADO (R2):
   *  el identificador de empresa no cruza la frontera hacia el cliente, y quien lo consume solo
   *  necesita saber si la fila lleva acciones, no de quien es la unidad. La definicion de «de
   *  sistema» sigue siendo una sola -`companyId === null`-, la misma de las escrituras. */
  readonly isSystem: boolean;
};
