# Auto-asignar empacador al finalizar · design.md

## 1. Dónde vive el cambio

`createFinishAssignedOrder` (`lib/modules/asignaciones/domain/finish-assigned-order.ts`) gana dos
puertos en `FinishAssignedOrderDeps`: `people: PeopleDirectory` y `groups: WorkGroupDirectory`
(los mismos contratos y la misma implementación —`assignmentDirectoryPrisma`— que ya cablea
`assignResponsibles`; ningún adaptador nuevo). `lib/composition/index.ts` los ata en la entrada
`finishAssignedOrder` de la fachada, junto a las claves existentes.

## 2. Algoritmo (corre ANTES de la transición, pedido aún `EN_CURSO`)

1. `rows = await assignments.listByOrderInCompany(companyId, orderId)` (lectura ya existente en el puerto).
2. `groupIds` = `workGroupId` no nulos distintos, en orden de primera aparición en `rows`
   (determinista sin ordenar: el orden de `listByOrderInCompany` lo fija el adaptador, R7/R38).
3. `snapshots = await Promise.all(groupIds.map(g => groups.findSnapshotAliveInCompany(companyId, g, now)))`;
   los `null` (grupo dado de baja o ajeno) se saltan.
4. `candidateIds` = unión de `snapshot.activeMemberIds` + `userIds` de `rows` (cubre al suelto ya
   asignado). `refs = await people.findAliveRefsInCompany(companyId, [...candidateIds], now)`
   (si vacío, nada que hacer → R2).
5. `packers` = refs con `permissions.includes('empaque.modificar')` e `isActive`. El literal vive
   en el dominio como en `start-packing.ts` (`requirePermission(actor, 'empaque.modificar')`):
   precedente, no novedad; la guardia de autorización por permiso sigue verde porque nunca se mira
   un nombre de rol.
6. `missing` = packers sin fila en `rows`. Filas a insertar con el origen de la primera aparición:
   miembro de snapshot → `{ workGroupId: snapshot.id, workGroupName: snapshot.name }` (nombre vivo
   congelado ahora); solo en `rows` → `{ null, null }`. `await assignments.insertMissing(filas, now)`.
7. Transición a `POR_EMPACAR` como hoy. SI falla, compensar: `deleteOne(companyId, orderId, userId)`
   por cada fila de `missing`, best-effort (un fallo de compensación no oculta el error original;
   se registra por el log del caso de uso —no hay logger en el dominio: se deja fallar en silencio
   documentado, la fila huérfana es inocua—), y se propaga el error de transición.

## 3. Por qué antes de transicionar (y no después)

Después, el pedido es `POR_EMPACAR` y toda escritura de asignación choca con el congelado R33:
haría falta una exención «acto del sistema» en el caso de uso o en el repo, más difícil de vigilar
que el orden elegido. Antes, `EN_CURSO` admite escrituras y no hay exención que pedir; el precio es
la compensación de §2.7, acotada a las filas que este paso creó (se conocen por el diff previo, no
por contar a mano).

## 4. Alternativa descartada

**Insertar después de transicionar con exención R33.** Se descarta porque la exención abriría una
vía de escritura sobre pedidos producidos que la guardia y R33 hoy niegan por igual a todos los
caminos, y porque un fallo del insert dejaría `POR_EMPACAR` + error al operario sin camino de
reintento (repetir el Finalizar sobre `POR_EMPACAR` se rechaza). Con el orden elegido, un fallo
deja `EN_CURSO` limpio y reintentable.

## 5. Cruces conocidos

- **QC-82** (`spec_ready`, con worktree): enmendará este mismo caso de uso (log de ejecución,
  `design.md > 9` de QC-168). Al llegar a F2.0 deberá rebasar sobre esta ficha; avisado en
  `progress/current.md`.
- Sin migración, sin permiso nuevo, sin cambio de esquema: `prisma generate` no cambia.
