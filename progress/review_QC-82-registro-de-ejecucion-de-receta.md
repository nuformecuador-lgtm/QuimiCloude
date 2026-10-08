# QC-82 — registro-de-ejecucion-de-receta · review

## Vuelta 1 (F2.2, HEAD `29871e70`, diff contra `origin/dev`)

Revisado contra `specs/QC-82-registro-de-ejecucion-de-receta/{requirements,design,tasks}.md`, la
bitácora, `CHECKPOINTS.md`, `docs/checkpoints-proyecto.md`, `docs/architecture.md` y
`docs/conventions.md`. Las enmiendas aprobadas se toman como dadas: P1-P5, el `CHECK` como
implicación, `packing-limits`, la aserción R18 de QC-125, la carrera R16 como `stale` y la excepción
de baseline en las tandas. No usé el MCP del grafo: revisé con Grep/Read y ejecutando tests.

### Verificación que corrí yo

| Qué | Resultado |
|---|---|
| `pnpm typecheck` | verde |
| `eslint` sobre los `.ts/.tsx` del diff | 0 errores |
| `vitest run`: unitarios del diff, `tests/guards` completo, `packing-order-screen`, `cancel-order` y `order-packing` | 72 archivos, 1320 verdes, 0 rojos |
| `.int` del diff (8 archivos, incluido `execution-atomicity`) | 81/81 verdes |
| `tests/integration` entero (153 archivos) | **1 rojo nuevo**: `pedidos/company-scope.int.test.ts` (3 casos) |
| `tests/unit` entero (735 archivos) | 9 rojos: los 8 del baseline + **1 nuevo**: `pedidos/qc145-estado-solo-planta.test.ts` |
| Comentarios en líneas añadidas de producción que citen `QC-`, `R<n>`, `design.md` o «decisión cerrada» | ninguno |
| `tests/guards/` frente a `origin/dev` | solo líneas añadidas, ninguna borrada |
| ¿Es la última migración de `db/migrations` frente a `origin/dev`? (T24) | sí (`20261006180000` > `20261006140000`) |

Los dos rojos nuevos **no** están en `tests/baseline-rojos.json`, y `--rapido` no los ve (el grafo de
`vitest related` no los alcanza). Saldrían en `gate-completo` del CI.

### Checklist

**Trazabilidad**
- [x] R1-R44 + R5bis tienen test en el mapa de la bitácora. Los comprobé por nombre de caso en
  `record-step-move`, `cancel-assigned-order`, `start-assigned-order`, `finish-*`, `*-packing`,
  `order-cancel-dialog`, `order-execution-step-log`, `step-reader`, `mig`, `cons`, `atom` y
  `order-cancellation`. Ningún test vacío.
- [x] R39/R40: `e2e/registro-ejecucion.spec.ts` comprueba «Paso 3», una sola fila `RESUME` y que
  el pedido queda `CANCELADO` con el motivo leído de la base. El leader los corrió en chromium y
  webkit.
- [~] R37, la mitad que dice «la pantalla de empaque NO DEBE recibir esas props»: solo la cubre
  `packing-order-screen.test.tsx`, sin tocar (empieza en «Paso 1»). Ver hallazgo 6.

**Tasks**
- [ ] **T20 y T23 siguen `[ ]`** en `tasks.md`. Ver hallazgo 3.

**CHECKPOINTS.md**
- [x] Spec: requirements EARS, design con alternativas descartadas, tasks.
- [ ] Todas las tasks `[x]`: no (faltan T20 y T23).
- [?] Equipo: `progress/features/QC-82.md` dice assignee «sin asignar». Jira no lo puedo verificar
  desde aquí. Ver hallazgo 9.
- [x] Mapa `R<n> -> test` en la bitácora.
- [x] Typecheck y lint.
- [ ] `gate-completo` sin rojos nuevos: hay dos (hallazgos 1 y 2).
- [ ] E2E de flujo crítico **con su salida en la bitácora**: los flujos son permisos e inventario
  (cancelar libera material). Los E2E existen y pasaron según el leader, pero la salida no está en
  `progress/impl_…`. Ver hallazgo 3.
- [x] Sin dependencias nuevas (`package.json`, lockfile y `docs/dependencias.md` fuera del diff).
- [x] Sin secretos ni configuración hardcodeada. No hay webhooks.
- [ ] Verificación final y Cierre: los cierra el leader (normal en F2.2).

**docs/checkpoints-proyecto.md**
- [x] `order_execution_entries` lleva:
  - `company_id`;
  - FK compuestas a `orders(id, company_id)` y `users(id, company_id)`;
  - RLS con `ENABLE` + `FORCE`;
  - `/// @module asignaciones`.
- [x] Toda lectura del registro filtra por la empresa del actor (`findLastStepPosition(companyId, …)`).
  El rechazo cruzado está probado: R27 («otra empresa = inexistente») en `record-step-move` y
  `cancel-assigned-order`, y R7 en `cons`.
- [x] Permisos en `domain/`, en la primera línea:
  - `asignaciones.ejecutar` en los cinco casos de uso de ejecución;
  - `empaque.modificar` en los dos de empaque;
  - cada uno con su test, y un test de que `consultar` no basta.
- [x] Migración con `down.sql` exacto y `db:rollback` documentado.
- [x] Hexagonal:
  - `domain/` y `ports/` solo importan el contrato de `pedidos`;
  - las actions piden todo a `lib/composition`;
  - el `use server` no sale por el barrel;
  - `lib/shared/routes.ts` sigue siendo hoja.
- [x] Multiplataforma:
  - botón y botones del diálogo con `min-h-11 min-w-11`;
  - `Textarea` con `text-base`;
  - sin `:hover`, y sin `100vh` (la pantalla usa `min-h-dvh`);
  - `AlertDialog` del kit que el repo ya usa;
  - operable por teclado (test R36).
- [x] Ninguna guardia aflojada. Las listas cerradas que crecieron llevan nota fechada.

### Desvíos que la bitácora pide juzgar

| Desvío | Juicio |
|---|---|
| T26 delega en `lockAndStartPackingAlive` y no en `createOrderPackingRepository(tx).startPackingAlive` | **Aceptable en el fondo**: mismo cuerpo y misma transacción. El motivo se puede verificar: la guardia de ámbito no sigue el ámbito a través de un método del objeto. Pero rompe `qc145-estado-solo-planta` (hallazgo 1), y `design.md > 4` sigue dibujando la forma literal (hallazgo 4). |
| T12 no reexporta los tipos de los puertos en el barrel | **Aceptable**: lo impone `guard-arquitectura-modulos`, y es el mismo patrón del puerto de asignación. |
| T10 cambia la fixture y el recuento de lecturas de QC-138 R32 | **Aceptable**: la aserción sigue igual de estricta (`order_blocked`, una sola transición). El recuento sube por la lectura nueva de la vista, y lleva nota fechada. |
| T12/T13 tocan `finish-with-finished-goods.int` y la lista de `asignaciones-facade` | **Aceptable**: lo primero es para compilar y para limpiar `orderExecutionEntry`. Lo segundo amplía una lista cerrada con nota fechada y dos casos R26. |
| T14 rechaza Finalizar sin `stepPosition` | **Aceptable**: la pantalla siempre manda el campo (vacío = `null`), y es coherente con el esquema estricto del caso de uso. |
| T17 no deshabilita el confirmar con el motivo vacío | **Aceptable**: R9 se cumple —no se llama a la acción y el rechazo sale como texto en `role="alert"`—, y lo prueban dos casos (vacío y solo espacios). |
| R45 de QC-168 sin test | **Aceptable** por decisión humana: su objeto era impedir que QC-168 tocara este spec, y eso ya está superado. Queda el rastro desfasado en la bitácora de QC-168 (hallazgo 5). |

### Hallazgos

1. **BLOQUEANTE — rojo nuevo: `tests/unit/pedidos/qc145-estado-solo-planta.test.ts`.**
   - Falla el caso «`order-prisma.ts`: la lista exacta de funciones con un bloque `data:` que fija
     `status:` es `cancelAliveOrder`, `finishPackingAliveOrder`, `setAliveOrderStatus` y
     `startPackingAliveOrder`»: recibe `lockAndStartPackingAlive` en lugar de
     `startPackingAliveOrder`.
   - Lo causa T26, y no está en el baseline.
   - Falta tensar esa lista cerrada con nota fechada (sustituir `startPackingAliveOrder` por
     `lockAndStartPackingAlive`) sin aflojar el resto del test, y anotarlo en la bitácora como lista
     ajena tocada.
2. **BLOQUEANTE — rojo nuevo: `tests/integration/pedidos/company-scope.int.test.ts`**, en 3 casos:
   el backfill, el aborto del UP y el DOWN limpio.
   - Postgres rechaza soltar `orders_id_company_id_key` porque ahora depende de ella
     `order_execution_entries_order_id_company_id_fkey` (R7, T1). No está en el baseline.
   - El test ya tiene el mecanismo para esto: `dropForeignKeysDependingOnOrdersCompanyKey` y
     `restoreForeignKeysDependingOnOrdersCompanyKey`, que hoy retiran y restauran las FK de
     `reservation_movements` e `inventory_movements`.
   - Falta añadir allí la FK nueva, con nota fechada, y comprobar que el archivo vuelve a verde
     contra `QuimiCloude_QC82`.
   - Comprobar también si algún otro test de reversión suelta `users_id_company_id_key`: no encontré
     ninguno en rojo, pero la FK de `user_id` cuelga de ella.
3. **BLOQUEANTE — T20 y T23 sin marcar y sin la salida de Playwright en la bitácora.**
   - `tasks.md` exige las dos en `[x]`, y su «Hecho cuando» pide la salida (chromium y webkit) en
     `progress/impl_…`. Lo mismo exige `CHECKPOINTS.md > Calidad de codigo` para un flujo crítico.
   - La corrida del leader (41/42; el reintento de `pedidos-asignados`, 4/4) no está escrita en
     disco.
   - Falta pegar esa salida en la bitácora, junto a la lista de E2E confirmadas y descartadas de T23
     (esa ya está), y marcar T20 y T23.
4. menor — `design.md > 4` sigue dibujando que `startPackingAliveOrder` delega en
   `createOrderPackingRepository(tx).startPackingAlive`, y el código hace otra cosa. Una nota fechada
   en el design evita que el siguiente lo «arregle» y ponga roja la guardia.
5. menor — `progress/impl_QC-168-estado-por-empacar.md:103` sigue mapeando R45 de QC-168 a un bloque
   de `packing-limits.test.ts` que ya no existe.
6. menor — R37 dice que la pantalla de empaque NO DEBE recibir las props nuevas, pero ningún test se
   pone rojo si `packing-order-screen.tsx` empieza a pasarle `onStepChange` o
   `initialStepPosition={1}`. Que `packing-order-screen.test.tsx` siga sin tocar cubre el
   comportamiento, no la prohibición. Un barrido de fuente de una línea lo cerraría.
7. menor — `cancelAssignedOrder` lee el resumen con `[order.status]` después de `findAliveById`. Si
   alguien mueve el pedido entre las dos lecturas (por ejemplo, con Finalizar), responde `not_found`
   en vez de `not_cancellable`. Es la misma ventana que obligó a arreglar R16. Aquí no rompe la
   atomicidad, solo cambia el código de error.
8. menor — la regla que recorta la posición del paso está escrita dos veces: `entryStepPosition` en
   `order-execution-screen.tsx` e `initialIndexFor` en `step-reader.tsx`. El propio comentario lo
   admite («Igual que el recorte de `StepReader`»). Si una cambia, el diálogo de cancelar y Finalizar
   mandarían una posición distinta de la que se ve.
9. menor — `progress/features/QC-82.md` dice assignee «sin asignar», y `CHECKPOINTS.md > Equipo` lo
   exige para `done`. Hay que verificarlo en Jira antes del cierre.

### Veredicto

**RECHAZADO.** Tres bloqueantes:
- (1) un rojo nuevo en `qc145-estado-solo-planta.test.ts`, por T26;
- (2) un rojo nuevo en `company-scope.int.test.ts`, por la FK compuesta de T1;
- (3) T20 y T23 sin `[x]` y sin la salida de los E2E en la bitácora.

Los dos primeros pondrían en rojo `gate-completo` en el PR. El código de la feature, la trazabilidad
de R1-R44 + R5bis, la seguridad (permisos, empresa, RLS) y la multiplataforma están bien. La vuelta 2
puede acotarse a esos tres puntos.

## Vuelta 2 (acotada a `29871e70..cf68893a`)

Revisé solo ese diff (12 archivos) contra los 9 hallazgos de la vuelta 1 y sus posibles regresiones.
El MCP del grafo no lo usé: el diff es corto y lo leí entero con `git diff`/Grep.

### Verificación que corrí yo (HEAD `cf68893a`, base `QuimiCloude_QC82` según `.env`)

- `pnpm exec vitest run` sobre `qc145-estado-solo-planta`, `asignaciones/cancel-assigned-order`,
  `recetas-ui/step-reader`, `asignaciones-ui/{order-execution-screen,packing-order-screen,
  order-execution-step-log,order-cancel-dialog}` ⇒ **7 archivos, 205/205 verdes**.
- `tests/integration/pedidos/company-scope.int.test.ts` ⇒ **12/12 verdes** (antes: 3 rojos).
- `tests/integration/identity/work-groups-constraints.int.test.ts` ⇒ **24/24 verdes**.
- typecheck, lint y `test:rapido` los corrió el leader en `cf68893a`: 7 rojos, todos en
  `tests/baseline-rojos.json`; no los repito.

### Checklist de la vuelta 1

- [x] **1 (BLOQ)** — `qc145-estado-solo-planta.test.ts`: la lista cerrada pasa a nombrar
  `lockAndStartPackingAlive` en lugar de `startPackingAliveOrder`. Sigue cerrada en cuatro y con
  `toEqual` exacto, y lleva nota fechada. El resto del archivo está intacto. Verde.
- [x] **2 (BLOQ)** — `company-scope.int.test.ts`: suelta y restaura
  `order_execution_entries_order_id_company_id_fkey`. La forma es la misma que la migración (FK
  compuesta, `RESTRICT`/`CASCADE`) y la nota está fechada. Verde contra `QuimiCloude_QC82`.
  - `users_id_company_id_key`: el único test que corre el `down.sql` de work groups contra Postgres
    es `work-groups-constraints.int.test.ts`, y está verde. Los otros tres que lo nombran son
    barridos de fuente. No falta nada.
- [x] **3 (BLOQ)** — T20 y T23 en `[x]`; no queda ninguna tarea sin marcar (T4 está retirada). La
  bitácora tiene la salida de Playwright: chromium y webkit, 10 specs, 41/42; el único rojo fue un
  fallo de `browser.newContext` en webkit, y al repetir `pedidos-asignados` pasó 4/4. La lista de
  E2E confirmadas y descartadas de T23 ya estaba. Lo doy por cumplido.
- [x] **4** — nota fechada en `design.md > 4` sobre `lockAndStartPackingAlive`.
- [x] **5** — `impl_QC-168` lleva una nota fechada: R45 se queda sin test por decisión humana.
- [x] **6** — un barrido de fuente R37 sobre `packing-order-screen.tsx` (sin comentarios) se pone
  rojo si aparece `onStepChange` o `initialStepPosition`.
- [x] **7** — `cancelAssignedOrder` vuelve a leer una vez el pedido y su asignación. Si el estado
  cambió, `pedidos` decide (`not_cancellable` / `ok`); si no, `not_found` sin abrir la transacción.
  Seis casos nuevos cubren las ramas, incluido el tope de un solo reintento.
- [x] **8** — una sola regla, `clampStepPosition`, en `step-reader.tsx`. `initialIndexFor` y la
  pantalla de ejecución la usan; tiene test de bordes. Ver hallazgo nuevo 1.
- [ ] **9** — el assignee en Jira está bien (el leader lo verificó en vivo el 2026-10-07), pero
  `progress/features/QC-82.md` sigue diciendo «sin asignar». Lo actualiza el leader, no el
  implementer: no bloquea esta vuelta.

### Hallazgos de la vuelta 2

1. menor — `order-execution-screen.tsx` importa `clampStepPosition` desde
   `@/components/shared/step-reader/step-reader`, por ruta profunda. El docstring del barrel
   `components/shared/step-reader/index.ts` dice que es «la UNICA superficie publica» y que ningún
   consumidor alcanza piezas por ruta profunda. `docs/architecture.md > Componentes` no lo prohíbe
   para `components/shared/` («por su ruta de siempre»), y ninguna guardia lo detecta. Aun así,
   contradice el contrato escrito del propio barrel; en QC-103 se trató igual con `data-table`.
   Para cerrarlo hay dos salidas: exportar `clampStepPosition` desde el barrel y ajustar su
   docstring, o anotar la excepción en ese docstring.
2. menor — (arrastre del 9) la ficha `progress/features/QC-82.md` debe pasar a «Christian Quevedo»
   antes del cierre (`CHECKPOINTS.md > Equipo`).

### Veredicto

**APROBADO.** Los tres bloqueantes de la vuelta 1 están cerrados y verificados con ejecución
propia. Quedan dos menores que no bloquean.
