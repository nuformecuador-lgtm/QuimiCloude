# Auto-asignar empacador al finalizar · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** ninguna (requiere QC-168 `done`, ya en `dev`) ·
> **Rama:** `feature/auto-assign-empacador`
>
> **Alcance.** Al finalizar la ejecución de un pedido (`EN_CURSO → POR_EMPACAR`), si entre sus
> responsables vinculados hay empacadores —miembros con permiso de empaque del equipo de trabajo
> (grupo) asignado, o personas sueltas asignadas con ese permiso— el pedido queda asignado a esos
> empacadores (filas en `order_assignments`), automáticamente y en la misma operación.
>
> **Lo que NO entra.** Preseleccionar `packed_by` ni auto-`Comenzar` (lo escribe `startPacking`
> como hoy); cambiar `Mis asignados` (R12 de QC-168 intacto: `POR_EMPACAR` sigue sin salir ahí, el
> empacador trabaja desde «Por empacar»); permiso nuevo, migración o cambio de esquema; tocar
> `specs/QC-82-registro-de-ejecucion-de-receta/`.
>
> Nace del chat el 2026-09-27 (sin issue en el board: no hay `key`; la ficha vive solo en disco y
> en `progress/current.md`). Decisiones cerradas con el humano en el chat: origen = vinculado al
> pedido, efecto = fila en responsables, múltiples = a todos. Defectos aplicados: R12 sin tocar,
> inserción antes de transicionar con compensación.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). «Empacador» = persona con el permiso `empaque.modificar`,
> nunca un nombre de rol (QC-168 R38). «Equipo vinculado» = grupos (`workGroupId` distintos) que
> aparecen en las filas vigentes del pedido.

### A. Disparo y alcance

**R1.** CUANDO un Finalizar válido sobre un pedido `EN_CURSO` vaya a dejarlo `POR_EMPACAR`,
el sistema DEBE, antes de la transición, asegurar filas de responsable para cada empacador
vinculado al pedido: los miembros activos con `empaque.modificar` de los snapshots **vivos** de
sus equipos vinculados, más las personas sueltas ya asignadas con ese permiso. A todos los
encontrados, no solo al primero.

**R2.** SI ningún responsable vinculado tiene `empaque.modificar` (o no hay responsables), ENTONCES
el sistema NO DEBE escribir ninguna fila de asignación y DEBE completar el Finalizar como hoy.

**R3.** La detección DEBE decidirse por el permiso `empaque.modificar` leído en `PersonRef.permissions`
y por `isActive`; NINGÚN archivo de producción DEBE comparar nombres de rol.

### B. Origen y congelado

**R4.** Las filas creadas para miembros de un equipo DEBEN llevar su `workGroupId` y el nombre
**vivo** del snapshot (el congelado de QC-86 R19/R28 aplicado al instante del Finalizar); las de
personas sueltas, `(null, null)`.

**R5.** El auto-asignado NUNCA DEBE borrar ni reescribir filas existentes: solo `insertMissing`
(idempotente). Leer el snapshot vivo de un equipo vinculado para **sumar** empacadores es la única
excepción admitida al congelado QC-86 R9, y queda escrita aquí, no supuesta.

### C. Atomicidad

**R6.** La inserción DEBE ocurrir mientras el pedido sigue `EN_CURSO` (escrituras admitidas, sin
exención al congelado R33); SI la transición a `POR_EMPACAR` falla después (los cinco errores de
QC-168 R7 u otro), ENTONCES el sistema DEBE compensar borrando solo las filas que este paso creó
(`deleteOne` por fila, best-effort) y DEBE devolver el error original de la transición.

**R7.** El auto-asignado DEBE correr UNA sola vez por Finalizar, fuera del bucle de reintento
`stale`: el reintento solo repite la transición.

**R8.** SI el Finalizar se rechaza antes de transicionar (sin permiso, pedido ajeno/inexistente,
estado no `EN_CURSO`), ENTONCES NO DEBE haberse escrito ninguna fila de este paso.

### D. Límites y verificación

**R9.** Esta ficha NO DEBE añadir permisos, tablas, columnas ni dependencias; NO DEBE cambiar
`listAssignedOrders` (R12), `startPacking`/`packedBy` (R18/R28) ni el mapeo de errores del Finalizar.

**R10.** El sistema DEBE tener tests unitarios (detección por permiso, inactivos excluidos, origen
preservado, no-escritura sin candidatos, compensación al fallar la transición) e integración
(grupo con empacador + operario → fila del empacador; suelto; sin empacadores → sin cambios).

## Preguntas abiertas

Ninguna: las tres del chat quedaron cerradas y los dos defectos (R12 sin tocar, inserción previa
con compensación) se aplican salvo objeción en la revisión de este spec.
