# Auto-asignar empacador al finalizar · tasks.md

- [x] **T0. Spec en la rama.** `specs/auto-assign-empacador-al-finalizar/{requirements,design,tasks}.md`
  commiteados; nota en `progress/current.md` (origen, decisiones, cruce con QC-82).
- [x] **T1. Dominio.** `finish-assigned-order.ts`: `people` + `groups` en `FinishAssignedOrderDeps` y
  algoritmo de `design.md > 2` (R1-R8). Sin tocar firma del caso de uso `(actor, input)`.
- [x] **T2. Cableado.** `lib/composition/index.ts`: `people: peopleDirectory, groups: workGroupDirectory`
  en `finishAssignedOrder`. Ningún adaptador nuevo (R9).
- [x] **T3. Unitarios.** Extender `tests/unit/asignaciones/finish-assigned-order.test.ts`: grupo con
  empacador+operario → `insertMissing` solo con el empacador y origen del grupo; inactivo/excluido;
  rol con nombre de empacador pero sin permiso → nada (R3); sin candidatos → `insertMissing` no
  llamado; transición falla → `deleteOne` por creada + error original (R6); rechazo previo → cero
  escrituras (R8). Dobles nuevos de `PeopleDirectory`/`WorkGroupDirectory`.
- [x] **T4. Integración.** `tests/integration/asignaciones/finish-auto-assign-packers.int.test.ts`:
  pedido `EN_CURSO` asignado a grupo con empacador y operario → Finalizar deja `POR_EMPACAR` y fila
  del empacador con nombre del grupo; suelto con permiso → fila `(null,null)`; grupo sin empacadores
  → sin filas nuevas (R10). **Ajuste al implementar:** la transición va doblada (el consumo real ya
  lo cubre `finish-with-finished-goods`); el tercer caso prueba idempotencia+origen en vez del
  suelto aislado, que en la práctica es no-op. Registrado en `aislamiento.json` (`transaccion`).
- [x] **T5. E2E.** `e2e/empaque.spec.ts`: tras Finalizar de un pedido asignado a grupo con empacador,
  `order_assignments` trae su fila (patrón de las aserciones directas que ya usa ese spec).
  **Escrito y verificado por tipos; SIN EJECUTAR** (sin navegadores Playwright en esta máquina;
  lo corre el humano o el CI).
- [ ] **T6. Gate.** `./init.sh --rapido` tras T1-T3; `./init.sh` completo antes del PR.
- [ ] **T7. PR.** `gh pr create --base dev`, URL reportada; nota de cruce para QC-82.
