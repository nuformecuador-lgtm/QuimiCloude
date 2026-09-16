# QC-81 — lote-y-fecha-de-compra · review (F2.2)

> Reviewer. Worktree `.worktrees/QC-81-lote-y-fecha-de-compra`, rama
> `feature/QC-81-lote-y-fecha-de-compra`, commit revisado **`51621e7`**. Diff contra el merge-base
> con `origin/dev` (`f777c56`). Fecha: 2026-09-15.

## 0. Veredicto

**OK — APROBADO. 0 hallazgos mayores, 6 menores.**

Ningún menor bloquea. Hay dos condiciones de cierre que **no** son defectos del implementer y que el
leader tiene que resolver antes de pasar a `done` (sección 5):

1. T12 sigue `[ ]` hasta que el leader corra `./init.sh` completo.
2. **Un rojo ajeno a QC-81**: la suite unitaria completa trae `tests/unit/identity/usuarios/scope.test.ts`
   (R45 de QC-66) en rojo por un cambio de **QC-95** ya mergeado en `origin/dev`. No está en
   `tests/baseline-rojos.json`, así que **el `./init.sh` completo va a salir rojo por él**.

## 1. Qué ejecuté yo (no copiado de la bitácora)

| Qué | Resultado |
|---|---|
| `git diff --stat` contra el merge-base (37 archivos) | nada bajo `app/` ni `components/`, ni en `package.json` o `pnpm-lock.yaml`; bajo `e2e/`, solo `e2e/aislamiento-inventario.spec.ts` con +4 líneas |
| `pnpm exec vitest run --project node --project ui` (**suite unitaria completa**, por la lección de QC-101) | 404 archivos: **403 verdes y 1 rojo ajeno** (ver 5.2). 5832 tests pasan, 1 falla y 74 se saltan |
| `pnpm exec vitest run --project integration tests/integration/inventario tests/integration/recetas/recetas-constraints.int.test.ts tests/integration/unidades/unidades-constraints.int.test.ts` | **13 archivos y 192 tests en verde**, en la base efímera `qct_qc81_75ea7fee_mu2wphos_knw` (copia de la plantilla `qct_tpl_92d13dc6eb14`), borrada al terminar |
| `qc81-alcance.test.ts --reporter=verbose` | 15/15 y **ninguno saltado**: los casos de diff de R28, R29 y R30 midieron la rama de verdad |
| **Mutación del lock** (ver 3.2): `SELECT pg_advisory_xact_lock(` cambiado por `SELECT num_nonnulls(`, corriendo solo `product-batch-lot.int.test.ts` | **rojo**: 1 falla y 13 pasan. Restaurado desde una copia con `cp`; después, `git diff --quiet lib/` y `git status` limpios |
| Trazabilidad por máquina: la misma expresión de `scripts/check-trazabilidad.mjs`, aplicada a QC-81 | 33 `R<n>` declarados, 33 filas en el mapa final; ni faltan ni sobran |
| Base de desarrollo compartida (`localhost:5432/QuimiCloude`) | **no la toqué**: ni migré ni escribí nada en ella |

No corrí `./init.sh` completo: lo corre el leader después de este veredicto (`AGENTS.md > Regla del gate`).
Sí corrí la suite unitaria entera, como permite esa misma regla. Una nota: `scripts/check-trazabilidad.mjs`
no existe en este worktree (la rama nace de `dev`) y el `feature_list.json` del worktree no tiene QC-81, así
que **el script oficial, corrido desde aquí, no cubre QC-81**. Hay que correrlo desde el árbol principal.

## 2. Decisiones humanas: comprobado que se cumplen tal como se decidieron

| # | Decisión | Comprobación | Estado |
|---|---|---|---|
| 1 | Spec aprobado en F1.4 el 2026-09-15 | `requirements.md` tiene un solo commit en la rama (`be486b5`, 2026-09-13), anterior a la aprobación, y no se volvió a tocar | cumple |
| 2 | Sexta enmienda `batch_duplicate_lot` con el texto «Ya existe un lote con ese valor en esta empresa.», escrita en la cabecera de `error-codes.ts`; R13 entero y distinguible | La cabecera de `error-codes.ts` trae «Sexta enmienda, el 2026-09-15 (QC-81)» y «Aprobada por el humano el 2026-09-15 en la puerta F1.4 de QC-81». El texto de `error-catalog.ts` coincide exacto. `catalogo.test.ts` fija el texto, la cabecera y que no coincide con `invalid_input` ni con `duplicate_number`. El borde entrega `status: 'error'`, `code: 'batch_duplicate_lot'` y el mensaje del catálogo (`product-actions.test.ts`). No hay rastro del plan B | cumple |
| 3 | Actualizar `inventario-schema.test.ts:1082`, con el precedente de `:1030-1048` | `:1082` actualizado. **Además** se invirtieron `:433` y `:1111`, que no están en la aprobación literal | cumple en `:1082`; lo demás va en el menor **m2** |
| 4 | Excepción acotada a R29: solo la preparación de `e2e/aislamiento-inventario.spec.ts:210-219`; T11 tolera ese único archivo, nombrado; R29 sin editar | El diff de ese archivo son **4 líneas añadidas** dentro de `prisma.productBatch.create`: 2 de comentario, `lot` con valor `E2E-${RUN_ID}` y `purchaseDate` con `new Date('2026-09-01T00:00:00Z')`. No cambian ni el recorrido ni las aserciones, y es el único archivo tocado bajo `e2e/`. `qc81-alcance.test.ts` define `E2E_TOLERADO = 'e2e/aislamiento-inventario.spec.ts'` con igualdad exacta, y su caso sintético da rojo con `e2e/aislamiento-inventario.spec.ts.bak` y con `e2e/helpers/seed.ts`. El texto de R29 sigue como estaba (`requirements.md:179`). Nada en `app/**`, `components/**`, `package.json` ni `pnpm-lock.yaml` | cumple |

## 3. Lo que había que mirar con lupa

### 3.1. La desviación: reconocer el duplicado por columnas y no por nombre de índice

**Está justificada y sigue siendo conservadora.**

- **La evidencia es real, no supuesta.** `unit-write-prisma.ts:21-48` (QC-76) documenta que
  `@prisma/client` 6.19.3 entrega columnas en `meta.target`, y que comparar contra el nombre del
  índice fue un defecto real en QC-76. La salida de la mutación del implementer, pegada en su
  bitácora, muestra el `P2002` real con `target: [ 'company_id', 'lot' ]`. Y el caso R13 de
  integración pasa contra base real: si el reconocimiento no casara con el `P2002` real, no saldría
  `BatchDuplicateLotError`.
- **Es conservador.** `isDuplicateBatchLot` exige tres cosas: que sea
  `instanceof PrismaClientKnownRequestError`, que `code === 'P2002'` y que el **conjunto exacto** de
  columnas sea `{company_id, lot}`. Un target con tres columnas, con otras columnas o como cadena
  suelta no se reconoce, y cada caso tiene su unitario.
- **¿Puede confundirse con otro `P2002` sobre esas mismas columnas?** En la práctica, no. Dentro de la
  transacción solo se escriben `products` y `product_batches`, y `lot` solo existe en `ProductBatch`
  (`db/schema.prisma`): ningún índice único de `products` puede incluir `lot`. Endurecerlo mirando
  también `meta.modelName` sería opcional; no lo pido.
- **Un `P2002` no identificado se relanza.** En `writeBatchWithLotRetry`, si el error no es el choque
  de lote se llama a `translateBatchWriteError(error)`, que solo traduce `P2003` y el `23514` del
  disparador de empresa y relanza todo lo demás tal cual; el SQLSTATE de un `P2002` no es `23514`. Lo
  fija el unitario «un P2002 ajeno se relanza tal cual y sin reintentar».
- **Lo único que queda mal es documental:** `design.md §3.3` y `§4.4`, y `tasks.md T6`, siguen diciendo
  «nombre del índice» (**m1**).

### 3.2. Concurrencia (R14, R15)

- **Orden en el código** (`product-prisma.ts`, `resolveLot`):
  1. Lo primero es `if (batch.lot !== null) return batch.lot;`, así que con lote tecleado no hay lock
     ni máximo.
  2. Después `tx.$executeRaw` con `SELECT pg_advisory_xact_lock(81::int, hashtext(...))`, **como
     sentencia aparte**.
  3. Después `tx.$queryRaw` con el `SELECT max(lot::bigint)::text`, filtrado por la empresa del ámbito
     y por `'^[0-9]{1,18}$'`.

  El docblock explica por qué, citando READ COMMITTED.
- **Reintento:**
  - el bucle de 3 intentos va **fuera** de `prisma.$transaction` y abre una transacción nueva en cada
    vuelta;
  - con lote tecleado sale `BatchDuplicateLotError` a la primera, sin reintentar;
  - al agotarse, lanza un `Error` con empresa, último lote e intentos, y el choque como `cause`; no se
    disfraza de `InventarioError`;
  - hay un solo `catch`, y tiene cuerpo.
- **El test de la carrera puede ponerse rojo: lo comprobé con una mutación.** Cambié el lock por
  `num_nonnulls(` con los mismos argumentos y el caso R14 dio rojo. Restauré con `cp` y `lib/` quedó
  limpio.

  **Matiz:** en mi corrida, el error visible no fue el `P2002` sino una violación de FK en
  `dropFixture` (`prisma.presentation.deleteMany`, línea 195), dentro del `finally`. `Promise.all`
  rechazó en cuanto falló una alta, el `finally` limpió con otras altas todavía escribiendo, y el error
  de la limpieza tapó la causa. Que el test muerde está demostrado; que muestre su propia causa, no
  (**m5**). La bitácora del implementer sí muestra la causa real en otra corrida: `P2002` agotado a los
  3 intentos.

### 3.3. Migración

- **Orden del UP (§2.1)** — **cumple**, y lo fija `product-batch-lot-migration.test.ts` con cada
  predicado probado también contra una mutación en memoria:
  - paso 0: `NO FORCE`;
  - paso 1: la guardia de duplicados, en un `DO`;
  - paso 2: `ADD COLUMN "purchase_date" DATE`, anulable y sin `DEFAULT`;
  - pasos 3-4: los dos rellenos, cada uno con su comprobación de `ROW_COUNT`;
  - paso 5: los dos `SET NOT NULL`;
  - paso 6: los dos `CHECK` y el índice único;
  - paso 7: `ENABLE` + `FORCE`.
- **Paréntesis de RLS:** se abre en la primera sentencia y se cierra en las dos últimas, en el UP y en
  el DOWN. Lo verifica el test estático y, en ejecución, `rlsForced === true` tras el UP y tras el DOWN.
- **R20, con la tabla vacía, probado de verdad por dos vías independientes:**
  - (a) el caso de integración aplica el `migration.sql` leído de disco sobre una copia vacía y exige
    el esquema completo;
  - (b) la plantilla `qct_tpl_92d13dc6eb14`, contra la que corrí la integración, se construye aplicando
    esta migración con `product_batches` vacía, y la receta de QC-77 solo tolera el fallo de QC-49.
- **R23:**
  - el `down.sql` es solo DDL, sin `UPDATE`, `DELETE` ni `DROP COLUMN "lot"`, y su cabecera dice lo que
    pierde;
  - el test estático lo fija con mutaciones;
  - al ser un archivo solo DDL, la prueba estática basta: el caso de integración ejecuta el DOWN real,
    pero sobre una copia vacía.
- **Desviación en el `ROW_COUNT` del relleno de `lot`:** se compara contra las filas sin lote y no
  contra el total. Es la única lectura compatible con R18, y es correcta.

### 3.4. Guardias y tests que leen el disco (la lección de QC-101)

Corrí la suite unitaria completa. Los tres archivos de «lista cerrada» que esta ficha tenía que tocar
están al día y en verde:
- `guard-identificador-de-request.test.ts` (`MIGRACIONES_ESPERADAS`);
- `recipe-route-contract.test.ts` (`DB_PERMITIDAS`);
- `inventario-schema.test.ts`.

El único rojo de la suite no es de QC-81 (5.2).

## 4. Trazabilidad R<n> -> test, una fila por requisito

Leyenda:
- `lot-int` = `tests/integration/inventario/product-batch-lot.int.test.ts`
- `retry` = `tests/unit/inventario/product-batch-lot-retry.test.ts`
- `mig` = `tests/unit/inventario/schema/product-batch-lot-migration.test.ts`
- `schema` = `tests/unit/inventario/schema/inventario-schema.test.ts`
- `cp` = `tests/unit/inventario/create-product.test.ts`
- `input` = `tests/unit/inventario/product-batch-input.test.ts`
- `actions` = `tests/unit/inventario/product-actions.test.ts`
- `alcance` = `tests/unit/inventario/qc81-alcance.test.ts`

Abrí cada test que se cita y los corrí (sección 1). Los títulos van abreviados.

| R | Test que lo verifica | Qué afirma de verdad (leído) | Resultado |
|---|---|---|---|
| R1 | `schema` (`purchaseDate` es `DateTime` con `@db.Date`, no opcional y sin `@default`); `lot-int` R18/R20 (`schemaState`: `purchase_date` NOT NULL de tipo `date`) | La columna es obligatoria en Prisma y en la base. `toBatchCreateData` exige `purchaseDate` como string en los dos caminos, así que no queda ningún camino de escritura sin fecha | verificado |
| R2 | `cp` «pasa al puerto la fecha civil UTC del now inyectado, y el MISMO instante como now»; `lot-int` «R3, R2: por el caso de uso» | `now` se llama **una sola vez** y el argumento 2 del puerto **es** ese mismo instante (`toBe`). Contra base real, un alta sin fecha a las 03:30Z guarda 2026-03-01 | verificado |
| R3 | `lot-int` «R3: una fecha escrita llega identica» | 2026-01-01 y 2025-12-31 salen iguales al leer `purchase_date::text`, tanto por `createWithFirstBatch` como por `addBatchToAlive` | verificado |
| R4 | `cp` «rechaza la fecha de manana con ValidationError senalando purchaseDate» y «decide futura contra el dia UTC del now inyectado» | `code` es `invalid_input`, `diagnostic` contiene `purchaseDate` y el puerto queda intacto (ni siquiera consulta el nombre) | verificado, con reserva **m3** (el campo solo llega al log) |
| R5 | `cp` «acepta hoy y una fecha de meses atras sin corregirlas» | HOY, 2026-01-15 y 2019-12-31 llegan idénticas, incluido el límite exacto (hoy) | verificado |
| R6 | `input` «rechaza la fecha sin forma YYYY-MM-DD» y «rechaza la fecha que no existe en el calendario»; `cp`, las dos filas QC-81 R6 del it.each | Un único issue, con ruta `purchaseDate`, para 7 formas inválidas y 6 fechas inexistentes (29 de febrero de año no bisiesto, mes 13, día 00, etc.). El caso de uso rechaza sin tocar el puerto | verificado |
| R7 | `lot-int` «R7: lote vacío y lote de solo espacios los rechaza product_batches_lot_not_blank, y NULL da 23502»; `schema` (`lot` no opcional) | Con SQL crudo por `pg`: la cadena vacía y la de solo espacios dan 23514 en la restricción `product_batches_lot_not_blank`, y NULL da 23502 | verificado |
| R8 | `lot-int` «R8, R9: empresa sin lotes genera 1 y luego 2» y «también por addBatchToAlive»; `product-batch-write.int.test.ts` «QC-81 R8, R9»; `cp` «pasa lot null al puerto» | Contra base real, un lote ausente sale 1 y luego 2, por los dos caminos. El número lo calcula el adaptador, no el cliente | verificado |
| R9 | `lot-int` «R9: ACME-2026-07 no altera la serie y 007 cuenta como 7», más los dos casos de R8 | ACME-2026-07 no mueve la serie (sale 1). Con 007 ya escrito sale 8, sin ceros a la izquierda | verificado |
| R10 | `cp` «pasa el lote escrito tal cual, recortado»; `retry` «no reintenta, no pide lock ni maximo»; `lot-int` R13 | Un 7 con espacios alrededor llega como 7. Con lote a mano no se llama ni a `$executeRaw` ni a `$queryRaw`, y el `INSERT` lleva el lote escrito | verificado |
| R11 | `lot-int` «R11: un duplicado dentro de la empresa por SQL crudo»; `mig` (índice no parcial, creado después del relleno); `schema` (`@@unique`) | Con SQL crudo y sin pasar por el adaptador: 23505 sobre la restricción `product_batches_company_lot_unique` | verificado |
| R12 | `lot-int` «R12, R27: dos empresas escriben el mismo lote» | La empresa A escribe 50 y la B escribe 50; se aceptan las dos | verificado |
| R13 | `lot-int` «R13, R25: rechaza con BatchDuplicateLotError»; `retry` (2 casos); `catalogo.test.ts` (3 casos); `actions` «entrega batch_duplicate_lot» | Contra base real, por los dos caminos: `BatchDuplicateLotError` con código `batch_duplicate_lot`, **una** sola `$transaction`, cero filas nuevas y ningún 1 como sustituto. En el borde, estado exacto y el lote no aparece en el JSON | verificado |
| R14 | `lot-int` «R14, R15: 3 rondas de 8 altas con Promise.all» | 8 promesas sin `await` entre ellas; **exactamente 8** `$transaction` por ronda, así que sin reintentos; lotes distintos y consecutivos 1-8, 9-16 y 17-24. **Si se quita el lock, la mutación da rojo** (3.2) | verificado, con reserva **m5** (diagnóstico) |
| R15 | `retry` «reintenta en una transaccion nueva con maximo nuevo», «se para en 3 intentos y lanza un Error» y «un P2002 ajeno se relanza» | 2 transacciones, 2 locks y 2 máximos: el lote pasa de 42 a 43. Al agotar los 3 intentos, un `Error` que no es `InventarioError`, con la empresa, el lote 44, el texto «3 intentos» y el último choque como `cause`. Que no quede ninguna fila escrita descansa en el mismo rollback que R25 prueba contra base | verificado |
| R16 | `lot-int` «R16: con 50 tecleado a mano cuando la serie iba por 3» | Tras 1, 2, 3 y 50 se genera 51, que no está entre los existentes, sin repetidos | verificado, con reserva **m4** (dieciocho nueves) |
| R17 | `mig` «R17: existe exactamente UNA migracion» y «R17: el down quita indice, CHECK»; `lot-int` sandbox (estado migrado, DOWN real, estado previo) | Una sola carpeta. El DOWN leído del disco y ejecutado de verdad quita `purchase_date`, deja `lot` anulable, sin CHECK ni índice, y con RLS forzada. El `db:rollback` sobre la base de desarrollo lo hizo el implementer; yo no lo repetí porque esa base se comparte con QC-101 | verificado |
| R18 | `lot-int` «R18, R19: numera las filas sin lote» (SQL real del disco); `mig` «R18» | En la empresa A la numeración sigue desde 51 hasta 55 por `created_at`, con `id` como desempate, y el lote en blanco también recibe número. En la B sale 1 y 2 por `created_at`, no por orden de inserción. 50 y ACME quedan intactos | verificado |
| R19 | el mismo caso de `lot-int`; `mig` «R19 y R26» | Cada fila recibe el día UTC de su `created_at`, con la sesión en America/Guayaquil (las 23:30-05:00 caen en el día 12). Ninguna fila recibe la fecha de hoy | verificado |
| R20 | `lot-int` «R20: con la tabla vacia»; construcción de la plantilla de QC-77 | Con 0 filas, el UP termina y deja el esquema completo. La plantilla que usé se construyó con esta migración | verificado |
| R21 | `lot-int` «R21: con dos filas de la misma empresa y el mismo lote»; `mig` «R21» | Falla con P0001 y los textos «hay 1 lote(s)», «2 fila(s)» y «renombra a mano». El esquema queda en el estado previo y la fila sin lote sigue en NULL | verificado |
| R22 | `mig` (paréntesis de RLS, `ROW_COUNT`, rellenos antes de `SET NOT NULL`, CHECK e índice después, ninguna transacción propia); `lot-int` R21 | Cada predicado se prueba contra el SQL real y contra una mutación que lo rompe; en ejecución, nada queda a medias | verificado |
| R23 | `mig` «R23: el down no contiene ningun UPDATE que vacie lot» | Sin `UPDATE`, `DELETE`, `TRUNCATE` ni `DROP COLUMN` de `lot`, y la cabecera dice qué se pierde. La mutación que añade un `UPDATE` vaciando lotes da rojo | verificado (estático; suficiente porque el DOWN es solo DDL) |
| R24 | `cp` «rechaza a un actor con UnauthorizedError sin llamar al reloj ni al puerto», 4 variantes | Con una fecha **futura** a propósito, el error es `UnauthorizedError` y no `ValidationError`; `now` no se llama y el puerto queda intacto | verificado |
| R25 | `lot-int` «R13, R25»; `retry` | Tras el choque en `createWithFirstBatch` no existe ningún producto con el nombre nuevo, y la empresa sigue con 1 | verificado |
| R26 | `mig` «R26: sin borrado, sin marcas de tiempo, sin otras tablas e identificadores en ingles»; `schema` (`@db.Date`); `lot-int` (`data_type` es `date`) | Sin `deleted_at`, sin reescribir `created_at` ni `updated_at`, sin tocar otras tablas y con los 4 nombres nuevos en inglés | verificado |
| R27 | `lot-int` «R12, R27: B sin lotes genera 1 aunque A tenga 50»; `guard-ambito-empresa-inventario.test.ts:324`; `company-scope.test.ts:120` | Con un máximo global, B obtendría 51; obtiene 1. `NewProductBatch` no lleva empresa: `resolveLot` la toma de `companyScopeColumns(scope)` | verificado |
| R28 | `alcance` «R28: el diff de la rama» y «R28: el detector muerde» | Midió la rama, sin saltarse ningún caso: nada bajo `app/` ni `components/`. Coincide con mi `git diff --stat` | verificado |
| R29 | `alcance`, los 3 casos de R29 | Tolera **solo** `e2e/aislamiento-inventario.spec.ts`, por igualdad exacta. Mi revisión del diff de ese archivo (sección 2, decisión 4) confirma que solo cambia la preparación | verificado, con la excepción aprobada el 2026-09-15 |
| R30 | `alcance`, los 2 casos de R30 | Midió la rama: ni `package.json` ni `pnpm-lock.yaml` están en el diff | verificado |
| R31 | `alcance`, los 4 casos de R31 | Recorre `lib/modules/inventario/**` sin comentarios buscando sumas, `increment` o `decrement` e identificadores de ajuste o consumo. La línea `stock: product.stock ?? null` sigue en `createWithFirstBatch`. Los detectores muerden con fuentes fabricadas | verificado |
| R32 | `alcance`, los 3 casos de R32; `module-contract.test.ts:136` | Ni las claves del barrel ya cargado ni los métodos del puerto combinan una palabra de lote con listar, editar o borrar | verificado |
| R33 | `lot-int` completo | El correlativo (R8, R9, R16), la unicidad por empresa (R11, R12), el relleno con el SQL real (R18 a R21) y las altas compitiendo (R14), todo contra Postgres real | verificado |

**Resultado: 33 de 33 verificados; ninguno queda sin verificar.** R4, R14 y R16 llevan una reserva
menor, pero siguen cubiertos.

## 5. Checklist (`CHECKPOINTS.md` y los puntos del rol)

### Especificación
- [x] `requirements.md` con requisitos EARS R1-R33.
- [x] `design.md` con alternativas descartadas y su porqué (§6: A secuencia, B `nextLot` en el puerto, C disparador de fecha, D tabla de contadores).
- [ ] **Todas las tasks marcadas**: T0-T11 sí; **T12 sigue sin marcar** porque depende del `./init.sh` completo, que corre el leader. Es una condición de cierre, no un defecto del implementer.

### Trazabilidad
- [x] Cada R tiene al menos un test que lo verifica de verdad (sección 4, una fila por requisito).
- [x] `progress/impl_QC-81-lote-y-fecha-de-compra.md` contiene el mapa R -> test: 33/33 por comparación de conjuntos.

### Calidad de código
- [x] `pnpm run typecheck` y `pnpm run lint`: verdes en el `--rapido` del leader sobre `51621e7`; no los repetí.
- [ ] `pnpm test` completo: la suite unitaria tiene **1 rojo ajeno** (5.2) y la integración de lo tocado está en verde. La suite completa la corre el leader.
- [x] Flujo crítico (movimientos de inventario) sin E2E nuevo: es una excepción **decidida por el humano** (D11, R29), anotada en `design.md §8` y en la bitácora; se difiere a QC-103.
- [x] UI multiplataforma: no aplica, no hay archivos de UI.
- [x] Dependencias: no se añade ninguna.

### Datos y seguridad
- [x] No hay tablas ni modelos nuevos en `db/schema.prisma`. Aislamiento por empresa:
  - el correlativo se calcula con la empresa del ámbito;
  - la unicidad es por empresa y lote;
  - el test R12/R27 prueba que una empresa no ve la serie de otra.
- [x] Permiso validado en el service y con test: `requirePermission` va antes de zod y de `now()`; R24 tiene 4 casos.
- [x] RLS: la migración la suelta y la vuelve a poner con ENABLE y FORCE, en el UP y en el DOWN; verificado en ejecución.
- [x] Acceso a datos solo por el repositorio con Prisma; nada del cliente de Supabase.
- [x] Migración versionada con `down.sql`. El DOWN real se ejecutó en la sandbox; el `db:rollback` real lo hizo el implementer.
- [x] Sin secretos ni configuración hardcodeada. El namespace 81 del lock es una constante de dominio, no de entorno.
- [x] Webhooks: no aplica.

### Módulos hexagonales
- [x] `domain/` no importa Prisma. `BatchDuplicateLotError` vive en `domain/errors.ts` y es el adaptador quien lo importa. Las guardias de arquitectura están en verde en la suite completa.
- [x] Sin rutas profundas nuevas entre módulos; `index.ts` solo reexporta el error.
- [x] La lógica de negocio (hoy por defecto, rechazo de fecha futura) está en `create-product.ts`; la Server Action solo lee el campo.
- [x] Ningún `catch` vacío en producción.

### Verificación final
- [ ] `./init.sh` en verde: **pendiente del leader**, y **va a salir rojo por 5.2** mientras eso no se resuelva.
- [x] `progress/review_QC-81-lote-y-fecha-de-compra.md` existe y su veredicto es OK: es este archivo.
- [ ] Entrada en `progress/history.md` y desmontaje del worktree: tareas del leader.

### 5.1. Condición de cierre: T12
El implementer dejó el mapa hecho y el gate pendiente, que es lo correcto según `AGENTS.md > Regla del gate`.
T12 se marca cuando `./init.sh` completo salga sin rojos nuevos.

### 5.2. Un rojo ajeno a QC-81 que el leader tiene que resolver antes del gate completo
- **Archivo:** `tests/unit/identity/usuarios/scope.test.ts`, caso «R45: ningun archivo de produccion de la feature lee ni escribe los tres contadores de bloqueo de QC-19», en la línea 631.
- **Mensaje:** encuentra `failedLoginAttempts`, `lockLevel` y `lockedUntil` en `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts:797-799`.
- **Por qué no es de QC-81:** el diff de QC-81 no toca nada bajo `lib/modules/identity` ni `tests/unit/identity` (lo comprobé y la lista sale vacía). El último commit de `origin/dev` sobre ese archivo es **`f728d15 feat(QC-95): implementa desbloqueo-manual-limpia-el-conteo`**, y la rama lo contiene por el merge `d108789`.
- **Por qué importa:** el archivo **no está** en `tests/baseline-rojos.json`, así que el comparador del `./init.sh` completo lo contará como rojo nuevo, en esta rama y en cualquier otra que sincronice con `dev`. La causa se resuelve en la línea de QC-95/QC-66, no en QC-81.

## 6. Hallazgos

**Mayores (BLOQUEANTE): ninguno.**

**m1 (menor). El spec describe un mecanismo que la implementación no usa.**
- **Qué pasa:** `design.md §3.3` y `§4.4`, y `tasks.md > T6`, siguen diciendo que `isDuplicateBatchLot` reconoce el `P2002` por el nombre del índice `product_batches_company_lot_unique`. El código lo reconoce por el conjunto de columnas `company_id` + `lot`.
- **Por qué importa:** la desviación está justificada (3.1) y documentada en el docblock del adaptador y en la bitácora, pero el spec queda contradiciendo al código para quien lo lea después (QC-103, QC-91).
- **Qué falta:** que el leader o el spec_author anoten la corrección en `design.md §3.3/§4.4` y en `tasks.md T6`, sin reabrir nada.

**m2 (menor). `inventario-schema.test.ts`: dos inversiones más allá de la aprobación literal, y una fecha equivocada.**
- **Qué pasa:** la decisión humana 3 aprueba actualizar la línea 1082. Además se invirtieron otras dos afirmaciones:
  - **línea 433:** la misma afirmación sobre `lot.isOptional`, pero fuera del bloque QC-80;
  - **línea 1111:** pasa de «no hay `@@unique` sobre `lot`, es QC-81» a «sí lo hay».

  Las dos son consecuencia directa de R7 y R11 (sin invertirlas la ficha no puede cumplirse) y el implementer las declaró en la bitácora. No las considero un cambio de alcance escondido, pero no están en el texto de la aprobación.
- **La fecha:** la cabecera nueva del bloque dice «ACTUALIZADO EL **2026-09-13** con la aprobacion del humano en F1.4», y esa aprobación fue el **2026-09-15**.
- **Qué falta:** que el leader lleve las líneas 433 y 1111 al humano para un visto bueno explícito, y corregir la fecha del comentario.

**m3 (menor). En R4, «señalando el campo `purchaseDate`» solo llega al log.**
- **Qué pasa:** la fecha futura sale como `ValidationError` con un `diagnostic` que nombra `purchaseDate`. Ese diagnóstico va al log del servidor y nunca a quien llama: el borde devuelve el código `invalid_input` y su mensaje, sin campo.
- **Por qué no es regresión:** el argumento del implementer es correcto. El contrato de errores del borde no tiene ruta de campo para ningún `invalid_input` (tampoco R6 llega con campo desde el caso de uso), y `design.md §4.1` ya decía `ValidationError`.
- **Por qué sigue siendo hallazgo:** la redacción de R4 promete algo que quien llama no puede ver.
- **Qué falta:** anotarlo como herencia explícita para QC-103 (que pinte el rechazo en el campo, o que cambie el contrato), o precisar la redacción de R4 en el spec.

**m4 (menor). Un lote tecleado de dieciocho nueves bloquea para siempre la generación en esa empresa.**
- **Cómo pasa:** el máximo se lee con la expresión de 1 a 18 dígitos, tanto en `resolveLot` como en el relleno.
  1. Alguien teclea 999999999999999999.
  2. El siguiente generado es 1000000000000000000 (19 dígitos), y es correcto.
  3. Pero ese valor ya no entra en la expresión: la siguiente alta vuelve a leer como máximo los dieciocho nueves, propone **otra vez** 1000000000000000000, choca, agota los 3 intentos y falla.
- **Por qué importa:** desde entonces **falla toda alta con lote generado de esa empresa**, y como R32 no deja editar ni borrar lotes, no hay arreglo desde la aplicación. En ese caso concreto se incumple el «NO DEBE proponer nunca un valor que ya existe» de R16.
- **Por qué es menor:** el disparador es muy estrecho (exactamente diez a la dieciocho menos uno), el fallo es ruidoso y no corrompe datos.
- **Qué falta:** una de dos:
  - anotarlo en `design.md §9 Límites conocidos`, junto al coste del «9000» que D6 ya acepta;
  - leer el máximo con `numeric` en lugar de `bigint`, para que la serie no tenga techo.

**m5 (menor). El test de la carrera oculta su propia causa cuando falla.**
- **Qué pasa:** en `product-batch-lot.int.test.ts:476-504`, si una alta rechaza, `Promise.all` corta y el `finally` ejecuta `dropFixture` mientras las demás altas siguen escribiendo. La limpieza choca con una FK (`prisma.presentation.deleteMany`, línea 195) y ese es el error que se ve, no el `P2002` agotado. Lo vi en mi mutación: el test se puso rojo, pero el mensaje apuntaba a la limpieza.
- **Por qué importa:** quien depure una regresión real de R14 leería una FK del fixture.
- **Además:** el test solo tiene sentido si el pool de Prisma permite más de una conexión. Con `connection_limit=1`, las 8 altas se serializarían en el pool y pasaría sin lock. En este entorno sí muerde.
- **Qué falta:** esperar con `Promise.allSettled` antes de afirmar y limpiar, y relanzar el primer rechazo. Opcionalmente, un comentario sobre el requisito del pool.

**m6 (menor). Docblock desfasado en `db/schema.prisma:642`.**
- **Qué pasa:** el docblock general de `ProductBatch` sigue diciendo «su numero de lote (`lot`, OPCIONAL)», mientras el párrafo QC-81 que viene después (líneas 683-697) dice lo contrario.
- **Qué falta:** quitar «OPCIONAL» de esa línea.

## 7. Resumen para el leader

- **Veredicto: OK (APROBADO), 0 mayores y 6 menores (m1-m6).** Ninguno bloquea.
- **Antes del `./init.sh` completo:** hay un rojo ajeno, de QC-95, en `tests/unit/identity/usuarios/scope.test.ts` (R45). No está en el baseline, así que el gate lo contará como nuevo.
- **Para cerrar:**
  - marcar T12 después del gate;
  - correr `check-trazabilidad.mjs` desde el árbol principal (desde el worktree no ve QC-81);
  - llevar m2 al humano.
- **Base de desarrollo compartida:** no la toqué. Aplicar la migración sigue siendo el paso manual de F2.3, cuando QC-101 libere la base.

---

# Segunda revisión (2026-09-15)

> Reviewer. Rango **`51621e7..d7b6a22`** (HEAD): `e10f626` (m2, m4, m5, m6), `c697bc0` (enmienda del
> spec: D13, R34-R36, m1, m3), `61220c4` (T13, T14) y `d7b6a22` (P1 = D, T15 no aplica). Antes de
> empezar, `git status` en el worktree: `specs/` limpio; solo este informe sin commitear.
> La primera revisión, arriba, queda intacta.

## S0. Veredicto

**RECHAZADO. 1 mayor nuevo (B1) y 2 menores nuevos (n1, n2).**

Todo lo que se pidió verificar **cumple**: m1-m6 están cerrados de verdad, D13 y R34-R36 están bien
implementados y sus tests muerden, la trazabilidad R1..R36 está completa y sin R37, y las decisiones
humanas se cumplen tal cual. **El único bloqueante es de comentarios** (punto 9 del rol,
`docs/conventions.md > Comentarios`, regla del 2026-09-15). Lo marco bloqueante porque así lo
define el rol del reviewer, **sin excepciones**. La sección S6 explica que esa regla todavía **no está
commiteada** y que **choca con el texto aprobado de T13**. Quien debe resolver ese conflicto es el
humano, no yo.

## S1. Qué ejecuté yo

| Qué | Resultado |
|---|---|
| `git diff --stat 51621e7..HEAD` | 13 archivos: 4 de producción (`product-batch-input.ts`, `product-prisma.ts`, `migration.sql`, `schema.prisma`), 6 de tests, 3 del spec y la bitácora. **Nada** bajo `app/`, `components/`, `e2e/`, `package.json` ni `pnpm-lock.yaml` |
| `git diff --stat` desde el merge-base, sobre `e2e`, `app`, `components`, `package.json` y `pnpm-lock.yaml` (la rama entera) | solo `e2e/aislamiento-inventario.spec.ts`, **+4**, igual que en la primera revisión |
| `pnpm exec vitest run --project node --project ui` (**la suite unitaria completa**, por la lección de QC-101: `migration.sql` y `schema.prisma` los leen tests de disco) | 404 archivos: **403 verdes y 1 rojo**, el **mismo** rojo ajeno de la primera revisión (`tests/unit/identity/usuarios/scope.test.ts`, R45 de QC-66, causado por QC-95). 5840 pasan, 1 falla y 74 se saltan. Son 8 tests más que en `51621e7`: 7 de `product-batch-input` y 1 de `create-product` |
| `pnpm exec vitest run --project integration tests/integration/inventario/product-batch-lot.int.test.ts --reporter=verbose` | **17/17 en verde**, contra `qct_qc81_75ea7fee_mu30giq5_l50`, copia de `qct_tpl_a365fb82c2bf`, que ya estaba construida con la migración de m4. La base se borró al terminar |
| `scripts/check-trazabilidad.mjs` del árbol principal, **corrido con el worktree como cwd** (su `feature_list.json` ya tiene QC-81) | «1916 requisitos mapeados en 58 feature(s)», exit 0. Además, con la misma expresión `DECLARA` solo sobre QC-81: **36 declarados y 36 en el mapa; no falta ni sobra ninguno** |
| **M1**: `refine` desactivado (siempre verdadero) | **rojo**: 4 fallan (los tres R34 del esquema y el R34 de `create-product`) y 74 pasan. Los dos R35 siguen en verde, que es lo esperado |
| **M2**: quitado `abort: true` del `max` | **rojo**: «R34: 61 digitos cobran UN solo issue», con «expected [...] to have a length of 1 but got 2» |
| **M3**: `resolveLot` vuelto a `::bigint` sobre la cota antigua de 1 a 18 dígitos | **rojo**: el caso R16 de los 18 nueves falla con la causa real, «ultimo lote intentado 1000000000000000000, 3 intentos», y `P2002` con target `company_id, lot` como `cause` |
| **M4**: lock cambiado por `num_nonnulls` | **rojo**: R14 falla con «ultimo lote intentado 4, 3 intentos», y `P2002` como `cause`. **Ninguna FK de la limpieza**: m5 cerrado |
| Restauración de M1-M4 | cada vez desde una copia con `cp` + `cmp` idéntico. Al final, `git diff --quiet lib` y `git status` limpios |
| Coordinación con el leader | antes de mutar, esperé a que terminara el `./init.sh --rapido` del leader en este worktree (PID 27756), para no falsear su gate |
| Base compartida `QuimiCloude` | no la toqué |

## S2. m1-m6: cerrados de verdad

| # | Qué pedía la primera revisión | Qué hay ahora | Estado |
|---|---|---|---|
| m1 | que el spec diga «conjunto de columnas» y no «nombre del índice» | `design.md §3.3` (bloque «Cómo se reconoce el choque», con Prisma 6.19.3 y el precedente de `unit-write-prisma.ts`), `§4.4` (`isDuplicateBatchLot` por conjunto exacto de columnas company_id y lot) y `tasks.md T6` enmendados. El código no cambió en esto | cerrado |
| m2 | visto bueno a las líneas 433 y 1111, y corregir la fecha | la cabecera dice «ACTUALIZADO EL 2026-09-15» y nombra las dos inversiones como aprobadas por el humano el 2026-09-15, citando la aserción además de la línea. **Ninguna aserción cambia**: la línea 436 sigue afirmando `lot.isOptional === false`, la 1122 también y la 1166 es el `@@unique` | cerrado, conforme a la decisión humana |
| m3 | precisar R4 o anotarlo como herencia | R4 reescrito: `invalid_input` sin campo para quien llama, y el motivo con `purchaseDate` en el diagnóstico. R6 lleva la precisión simétrica. `design.md §9.5` lo hereda a QC-103 con las opciones (a) y (b). El test de R6 sobre la validación de entrada ya afirmaba el campo `purchaseDate` (`product-batch-input.test.ts:224`) | cerrado |
| m4 | sin techo en la serie | `resolveLot`: `max(lot::numeric)::text` sobre el patrón de solo dígitos **sin cota**, y la suma sigue en `BigInt`. `migration.sql` paso 4: el mismo criterio. **El lote 007 sigue dando 8**: el caso R9 está en verde en mi corrida. **Existe el test de los 18 nueves**, está en verde y **M3 lo pone rojo** con la causa correcta. Hay además un caso de relleno con 18, 19 y 40 dígitos, y el test estático exige `::numeric`, rechaza `::bigint` y cualquier cota de dígitos, con dos mutaciones sintéticas | cerrado |
| m5 | `allSettled`, rojo con causa real y comentario del pool | `Promise.allSettled` por ronda, el primer rechazo se relanza tal cual antes de afirmar y de limpiar, y está el comentario del requisito de pool de más de una conexión. **M4 lo pone rojo con el `P2002` agotado, sin FK** | cerrado |
| m6 | quitar «OPCIONAL» de `schema.prisma:642` | quitado | cerrado |

## S3. D13 y R34-R36

- **Un solo error con `abort: true`: cumple.** Con 61 dígitos sale 1 issue, `too_big`, en el campo
  `lot`, y sin `abort` salen 2 (M2). Con 60 dígitos sale 1 issue `custom` en el campo `lot` con el
  texto exacto «Un lote de solo números puede tener hasta 59 caracteres.» (`product-batch-input.test.ts`,
  constante `MENSAJE`).
- **Se acepta lo que debe aceptarse: cumple.** 59 dígitos se aceptan y llegan tal cual. 60 caracteres
  con una letra, un guion o una L inicial también. Un lote de 60 con ceros a la izquierda o rodeado de
  espacios se rechaza, porque cuenta el valor recortado y los caracteres, no la magnitud.
- **59 nueves y lo que viene después: cumple.** Por el caso de uso y con el repositorio real, se escriben
  59 nueves; después se genera 1 seguido de 59 ceros y luego 1, 58 ceros y 1, **de 60 caracteres cada
  uno**, con una sola `prisma.$transaction` por alta y sin `23514` del `CHECK` `product_batches_lot_length`.
  Después, 60 dígitos tecleados dan `ValidationError`, `invalid_input`, **cero** transacciones y cero
  filas nuevas. Verde en mi corrida.
- **La mutación muerde: cumple** (M1, y M2 para `abort`).
- **Ni export nuevo, ni `CHECK`, ni cambios en app: cumple.**
  - No hay ninguna línea de export añadida en el diff de `lib/`, e `index.ts` no se tocó.
    `NUMERIC_LOT_PATTERN` y `MESSAGE_LOTE_NUMERICO_LARGO` son constantes de módulo.
  - `migration.sql` solo lo tocó `e10f626` (m4), y sus restricciones siguen siendo las dos de antes
    (`product_batches_lot_not_blank` y `product_batches_lot_length`): no hay `CHECK` para D13.
  - `module-contract.test.ts` y `qc81-alcance.test.ts` están en verde dentro de la suite completa.
- **`zod` 4.4.3**: `abort` en `max` es API de v4, y el precedente `purchaseDateSchema` ya la usaba.

## S4. Decisiones humanas: comprobado que se cumplen tal cual

| Decisión | Comprobación | Estado |
|---|---|---|
| m2 aprobado, incluidas las líneas 433 y 1111 | S2, fila m2 | cumple |
| Los seis menores se arreglan | S2 | cumple |
| D13, R34-R36, el texto del mensaje, sin `CHECK` y la precisión de R6 | S3; R6 en `requirements.md` con «la validación de entrada DEBE señalar el campo purchaseDate» | cumple |
| P1 = D y T15 cancelada | `requirements.md > P1` cerrada con D y la respuesta textual; `tasks.md` con T15 tachada como «NO APLICA»; `design.md §9.6` como límite aceptado. Ningún R37 declarado: solo aparece en frases que dicen que no nace. `migration.sql` sin sentencia nueva desde la enmienda | cumple |
| Excepción de R29 acotada a `e2e/aislamiento-inventario.spec.ts` | la rama entera sigue con ese único archivo, +4 | cumple |
| `batch_duplicate_lot` | ni `error-codes.ts` ni `error-catalog.ts` están en el rango; sus tests, en verde en la suite | cumple |
| T13 y T14 marcadas | `tasks.md:188` y `:220`. T12 sigue sin marcar, como condición de cierre del leader | cumple |

## S5. Trazabilidad R1..R36, una fila por requisito

Las leyendas son las de la sección 4. «Ejecutado» significa que el test corrió en verde **en esta
segunda revisión**, en la suite unitaria completa o en `lot-int`.

| R | Test | ¿Cambió en el rango? | Resultado |
|---|---|---|---|
| R1 | `schema` (`purchaseDate` con `@db.Date`, obligatorio); `lot-int` R18/R20 (`schemaState`) | no | verificado, ejecutado |
| R2 | `cp` «pasa al puerto la fecha civil UTC del now inyectado...»; `lot-int` «R3, R2: por el caso de uso» | no | verificado, ejecutado |
| R3 | `lot-int` «R3: una fecha escrita llega identica» | no | verificado, ejecutado |
| R4 (enmendado) | `cp` «QC-81 R4 — la fecha de compra futura se rechaza sin tocar el puerto»: código `invalid_input`, `diagnostic` con `purchaseDate` y puerto intacto | el texto del requisito sí, el test no | verificado, ejecutado. **La redacción nueva coincide ahora con lo que afirma el test**: código sin campo para quien llama y `purchaseDate` en el diagnóstico |
| R5 | `cp` «acepta hoy y una fecha de meses atras» | no | verificado, ejecutado |
| R6 (enmendado) | `input` «rechaza la fecha sin forma YYYY-MM-DD» y «...que no existe» (issue en `purchaseDate`); `cp` las dos filas «QC-81 R6» del `it.each` (`invalid_input` y puerto intacto) | el texto sí, el test no | verificado, ejecutado. La validación de entrada señala `purchaseDate` y el caso de uso da el código sin campo, que es exactamente la redacción nueva |
| R7 | `lot-int` «R7: lot vacío y de solo espacios los rechaza product_batches_lot_not_blank (23514) y NULL da 23502»; `schema` | no | verificado, ejecutado |
| R8 | `lot-int` «R8, R9» (los dos caminos); `input` «R8: el lote ausente o en null sigue siendo valido», **nuevo** y como regresión | se añade un test | verificado, ejecutado (`product-batch-write.int.test.ts` no lo repetí; `lot-int` basta) |
| R9 | `lot-int` «R9: ACME-2026-07 no altera la serie y 007 cuenta como 7, asi que el siguiente es 8» | no | verificado, ejecutado; **sigue valiendo con `numeric`** |
| R10 | `cp` «pasa el lote escrito tal cual, recortado»; `retry`; `lot-int` R13 | no | verificado, ejecutado |
| R11 | `lot-int` «R11: un duplicado ... 23505»; `mig`; `schema` | no | verificado, ejecutado |
| R12 | `lot-int` «R12, R27» | no | verificado, ejecutado |
| R13 | `lot-int` «R13, R25»; `retry`; `catalogo.test.ts`; `actions` | no | verificado, ejecutado |
| R14 | `lot-int` «R14, R15: 3 rondas de 8 altas...», ahora con `allSettled` | sí (m5) | verificado, ejecutado; **M4 rojo con la causa real** |
| R15 | `retry` (reintento, 3 intentos y `P2002` ajeno) | no | verificado, ejecutado |
| R16 | `lot-int` «R16: con 50 tecleado...» y «R16: con 999999999999999999 tecleado ... sin techo y sin chocar», **nuevo** | se añade un test | verificado, ejecutado; **M3 rojo**. La reserva m4 de la primera revisión queda levantada |
| R17 | `mig` «R17»; `lot-int` sandbox con el DOWN real | no | verificado, ejecutado |
| R18 | `lot-int` «R18, R19: numera las filas sin lote...» y «R18: el relleno continua SIN TECHO...», **nuevo**; `mig` `fillsLotBySeriesPerCompany`, ahora con `::numeric` y las mutaciones `conCota` y `conBigint` | sí (m4) | verificado, ejecutado. El predicado estático cambió **a la vez** que el SQL, y las dos vueltas atrás dan `false` |
| R19 | `lot-int` «R18, R19»; `mig` «R19 y R26» | no | verificado, ejecutado |
| R20 | `lot-int` «R20: con la tabla vacia» | no | verificado, ejecutado |
| R21 | `lot-int` «R21: con dos filas de la misma empresa y el mismo lote» | no | verificado, ejecutado |
| R22 | `mig` (orden, `ROW_COUNT`, paréntesis de RLS); `lot-int` R21 | no | verificado, ejecutado |
| R23 | `mig` «R23: el down no contiene ningun UPDATE» | no; `down.sql` no está en el rango | verificado, ejecutado |
| R24 | `cp` «rechaza a un actor con UnauthorizedError...», 4 variantes | no | verificado, ejecutado |
| R25 | `lot-int` «R13, R25»; `retry` | no | verificado, ejecutado |
| R26 | `mig` «R26»; `schema`; `lot-int` | no | verificado, ejecutado |
| R27 | `lot-int` «R12, R27»; `guard-ambito-empresa-inventario.test.ts`; `company-scope.test.ts` | no | verificado, ejecutado |
| R28 | `alcance` «R28» | no | verificado, ejecutado; coincide con mi `git diff --stat`, sin cambios en app |
| R29 | `alcance`, los 3 casos de R29 | no | verificado, ejecutado; con la excepción aprobada |
| R30 | `alcance`, los 2 casos de R30 | no | verificado, ejecutado |
| R31 | `alcance`, los 4 casos de R31 | no | verificado, ejecutado |
| R32 | `alcance`, los 3 casos de R32; `module-contract.test.ts` | no | verificado, ejecutado; ningún export nuevo |
| R33 | `lot-int` completo | se amplía | verificado, ejecutado, 17/17 |
| **R34** (nuevo) | `input`: «R34: 60 digitos se rechazan con UN solo issue en lot, de codigo custom y con su mensaje», «R34: 60 digitos con ceros a la izquierda...», «R34: 60 digitos rodeados de espacios...» y «R34: 61 digitos cobran UN solo issue...»; `cp` «R34: con un lote de 60 digitos lanza ValidationError (invalid_input) y el repositorio recibe cero llamadas»; `lot-int` «R35, R36, R34: por el caso de uso...», paso 4 | nuevo | verificado, ejecutado. **Cubre cada cláusula**: `invalid_input` (`cp` y `lot-int`); ni producto ni lote escritos (conteos en `lot-int` y puerto intacto en `cp`); no se sustituye por un generado (cero transacciones y ninguna llamada al puerto); un solo rechazo en `lot` (`input`, incluido el borde de 61). **M1 y M2 rojos.** El texto en pantalla no lo afirma ningún test: ver S7 (a) |
| **R35** (nuevo) | `input` «R35: 59 digitos se aceptan y llegan tal cual» y «R35: 60 caracteres con una letra o un guion se aceptan y llegan tal cual»; `lot-int` paso 1 (59 nueves escritos tal cual en la base) | nuevo | verificado, ejecutado. Que el de 60 con letras se **guarda** tal cual contra la base descansa en R10, que ya estaba probado; el esquema lo deja pasar sin tocarlo |
| **R36** (nuevo) | `lot-int` «R35, R36, R34...», pasos 2 y 3 | nuevo | verificado, ejecutado. Valores exactos de 60 caracteres, `toHaveLength(60)`, 1 transacción por alta (sin reintento) y escritos sin error: el `CHECK` de largo no muerde en la frontera |

**Resultado: 36 de 36 verificados, y ninguno sin verificar.** Ningún requisito anterior se quedó sin
test: los únicos tests que se **modificaron** fueron R14 (m5) y el predicado estático de R18 (m4), y los
dos siguen afirmando lo mismo, más fuerte. No hay ningún R37 declarado.

## S6. Hallazgos nuevos

**B1 (BLOQUEANTE). Los comentarios de producción del rango citan requisitos, fichas y `design.md`, contra
`docs/conventions.md > Comentarios`.**

- **Qué pasa.** Solo en las líneas **añadidas** en este rango:
  - `lib/modules/inventario/domain/product-batch-input.ts`: el docblock de `NUMERIC_LOT_PATTERN`,
    «(QC-81 D13, R34)» y «(R9)»; y el de `lotSchema`, «(D13, R34)», «(R36)», «(R35)», «(R34)» y
    «design.md > 4.6».
  - `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`: el docblock de `resolveLot`,
    «(R9)», «(R16 roto)», «design.md > 6 F», «Desde QC-81 R34 (D13)», «requirements.md > P1» y
    «design.md > 9.6».
  - `migration.sql` paso 4 y ese mismo docblock cuentan además la historia de la revisión («hallazgo m4
    de la revision, decision del humano del 2026-09-15»). Es historia, no un porqué.
  - Los dos docblocks superan con creces las ~5 líneas: el de `resolveLot` crece a unas 40.
- **La regla exige además limpiar el archivo entero** al tocarlo, en un commit `chore` aparte. Líneas
  que hoy tienen cita en los cuatro archivos de producción del rango:
  - `product-batch-input.ts`: 40 de 244;
  - `product-prisma.ts`: 122 de 1040;
  - `migration.sql`: 39 de 241;
  - `schema.prisma`: 244 de 1221. Lo tocó solo m6, una palabra.
- **Qué falta para cumplir.**
  1. Quitar de esos comentarios toda cita a QC-n, R-n, `design.md` y `requirements.md`, junto con la
     historia de la revisión. Deben quedar solo los porqués que el código no muestra y en corto:
     - por qué el patrón escribe los dígitos como rango 0-9 y no con la clase de dígito;
     - por qué `abort: true`;
     - por qué `numeric` y `BigInt`;
     - el límite de los 60 nueves.
  2. Hacerlo en los archivos enteros, en commits «chore(QC-81): limpia comentarios de archivo» que no
     cambien código.
  3. Correr después la suite unitaria: `qc81-alcance.test.ts` R31 recorre `lib/modules/inventario`
     «sin comentarios», y los tests estáticos de `migration.sql` quitan comentarios con `executable()`,
     así que en principio no dependen de ellos, pero hay que confirmarlo.
- **Contexto que el leader tiene que pesar, porque no es un defecto de ejecución del implementer:**
  1. **La regla no está commiteada en ninguna rama.** Está sin commitear en el árbol principal:
     `docs/conventions.md` es de las 13:15:33, y `.claude/agents/reviewer.md` y `backend_dev.md`, de
     las 13:15:42. **No existe en el `docs/conventions.md` de este worktree.** `61220c4` es de las
     13:29, y no puedo saber si el prompt con el que se lanzó el implementer ya la traía.
  2. **Choca con el spec aprobado.** `tasks.md > T13`, aprobada el 2026-09-15, ordena: «El docblock de
     lotSchema cita D13 y R34. En resolveLot, el LÍMITE CONOCIDO pasa a decir que desde R34 [...] y
     remite a P1». El implementer hizo lo que le ordenaba la task.
  3. **Toda la rama tiene el mismo problema fuera de este rango**, en archivos que ya aprobé en la
     primera revisión antes de que la regla existiera: `create-product.ts` (46 líneas con cita),
     `product-actions.ts` (46), `error-codes.ts` (33), `error-catalog.ts` (22), `errors.ts` (16),
     `index.ts` (14), `product-batch.ts` (13) y `down.sql` (7). Si la regla se aplica a esta ficha,
     se aplica ahí también antes del PR.
  - **Decisión que corresponde al humano:** o la regla vale para QC-81 (y entonces B1 se corrige como
    dice arriba, en toda la rama), o se declara que no aplica a fichas cuyo spec se aprobó antes de la
    regla (y entonces esta revisión queda en **0 mayores y 2 menores**). Por el rol, yo la aplico.

**n1 (menor). El «LIMITE CONOCIDO» de `migration.sql:163-164` es impreciso.**
- Dice que con un lote de 60 nueves «el CHECK product_batches_lot_length aborta la migracion ENTERA».
  Eso solo ocurre si la empresa **además** tiene alguna fila sin lote. Sin filas que rellenar, la
  migración pasa y el problema se traslada al alta, como dicen `requirements.md > P1` («Con 60 nueves
  y ninguna fila sin lote, la migración pasa») y `design.md §9.6`.
- Un comentario con un motivo incompleto invita a leer mal el riesgo.
- **Qué falta:** decir la condición completa en una línea, sin citar nada. Va en la limpieza de B1.

**n2 (menor). Los comentarios nuevos de los tests citan requisitos y hallazgos.**
- Hay 12 líneas de comentario añadidas en `tests/` que citan R-n, QC-n o «hallazgo m4/m5 de la
  revision»; por ejemplo, la cabecera de `lot-int` («R34, R35, R36 (T14)») y los párrafos de m4 y m5.
- `docs/conventions.md` aplica a los tests la misma regla para comentarios: R-n va en el **nombre del
  caso**, y ahí ya está. No es bloqueante porque el punto 9 del rol lo exige solo en producción.
- **Qué falta:** quitarlas cuando se limpie B1.

## S7. Las dos notas del implementer

**(a) El mensaje de R34 en pantalla solo se comprobó leyendo código. Veredicto: herencia para QC-103, ni
mayor ni menor de QC-81.**
- **Lo leí yo.**
  - `product-form.tsx:309-318` valida el alta con `createProductWithFirstBatchSchema`.
  - `:327-332` reparte por el primer elemento de la ruta del issue.
  - `fieldMessage` (`:198-208`) devuelve el mensaje del issue cuando es `custom`, y el `refine` lo es.
  - `:573` pasa `fieldErrors.lot` como error del campo.

  La cadena es correcta, y el test del esquema fija los tres eslabones que dependen de QC-81: la ruta
  `lot`, el código `custom` y el texto exacto.
- **Por qué no es hallazgo.** R34 no exige nada de la pantalla: exige que la validación de entrada señale
  `lot` con un solo rechazo, y eso está probado. D10 y R28 dejan la pantalla fuera y prohíben tocar
  app, que es donde viviría un test de UI. `design.md §9.5` ya dice que QC-103 «hereda el texto del
  lote numérico».
- **Qué pido:** que la herencia de QC-103 diga **explícitamente** que falta un caso en
  `product-page.test.tsx` que afirme el texto en el campo del lote, y no solo «revisar la redacción».
  Es trabajo del leader al refinar QC-103, no un cambio en esta rama.

**(b) El comentario de `migration.sql:163-164` no cita D13, R34 ni P1 = D. Veredicto: correcto que no los
cite.**
- La decisión humana de P1 = D dice textualmente que el comentario del paso 4 «sigue diciendo LIMITE
  CONOCIDO, que es exactamente lo que ahora es, y **no** se toca en esta enmienda».
- Además, citarlos sería justo lo que B1 prohíbe.
- Lo único que tiene es la imprecisión de **n1**.

## S8. Checklist, solo lo que cambia respecto a la primera revisión

- [x] Spec: la enmienda está aprobada y reflejada en los tres archivos; R1-R36 en EARS; D13 en la tabla; P1 cerrada.
- [ ] Tasks: T0-T11, T13 y T14 marcadas y T15 no aplica. **T12 sigue sin marcar**: condición de cierre del leader (gate completo).
- [x] Trazabilidad: 36/36 en el script oficial y 36/36 por juicio (S5).
- [ ] Suite completa: **sigue el rojo ajeno** de QC-95 (5.2 de la primera revisión). Hay que resolverlo o llevarlo al baseline antes del `./init.sh` completo.
- [x] UI multiplataforma: no aplica, porque no se toca app.
- [x] Dependencias: ninguna nueva.
- [x] Aislamiento por empresa: sin modelos nuevos; el correlativo sigue tomando la empresa del ámbito (R27, en verde).
- [x] RLS, secretos, capas: sin cambios. `domain/` sigue sin Prisma; el `refine` vive en `domain/`.
- [ ] **Comentarios (`docs/conventions.md > Comentarios`): falla, B1.**
- [x] Base compartida intacta.

## S9. Resumen para el leader

- **RECHAZADO: 1 mayor (B1, comentarios) y 2 menores (n1, n2).** Todo lo demás cumple:
  - m1-m6 cerrados;
  - D13 y R34-R36 bien implementados, y las cuatro mutaciones muerden;
  - 36/36 trazados;
  - decisiones humanas respetadas.
- **B1 depende de una decisión humana** (S6): la regla de comentarios no está commiteada y contradice el
  texto aprobado de T13. Si aplica, la limpieza alcanza a toda la rama, no solo a este rango. Si el
  humano decide que no aplica a QC-81, el veredicto de esta segunda revisión pasa a **OK, con 0 mayores
  y 2 menores**.
- **Siguen pendientes:** T12, con el `./init.sh` completo, y el rojo ajeno de QC-95 en `scope.test.ts`.
- **Para QC-103:** la herencia debe pedir un test de UI del texto de R34 en el campo del lote (S7 a).

---

# Tercera revisión (2026-09-15)

> Reviewer. Rango **`d7b6a22..80176b5`** (HEAD). En curso: si esta sección acaba aquí, la revisión se
> cortó. Registro de mutaciones (copia previa en el scratchpad del reviewer, restauración con `cmp`):

- M5 (en curso): `db/schema.prisma`, quito la línea `/// @module identity` de `CredentialSetupToken` y de `RevokedSession`. Copia: `scratchpad/schema.prisma.orig`.
- M6 (en curso): `db/schema.prisma`, cambio y muevo el texto de los comentarios de esos dos modelos sin tocar el `@module`. Misma copia.
- M5: rojo (2 fallan, 56 pasan) y restaurado con `cmp` idéntico. M6: verde (58/58) y restaurado con `cmp` idéntico.
- M7 (en curso): `product-prisma.ts`, quito ` FOR NO KEY UPDATE` de `addBatchToAlive`. Copia: `scratchpad/product-prisma.ts.orig`.
- M7: rojo (unitario: 2 R37 fallan; integración: los 2 R37 fallan con «el alta no espero a la fila» y «el borrado no espero al alta») y restaurado con `cmp` idéntico y `git diff --quiet lib`.
- Sin mutación: repetición del caso 2 de R37 para medir el flake (solo lectura de código, escribe en la base de la corrida).

**Las cuatro mutaciones quedaron restauradas y comprobadas con `cmp`; `git status` solo tiene este
informe sin commitear.** La revision NO se corto: sigue completa mas abajo.

## T0. Veredicto

**RECHAZADO. 1 mayor nuevo (B2) y 3 menores nuevos (n3, n4, n5).**

**B1 de la segunda revision queda CERRADO**, y cerrado de verdad: lo comprobe archivo por archivo con
un comprobador propio, no con el del implementer. El bloqueante nuevo **no es de codigo ni de
comportamiento**: T16 y R37 estan bien hechos y sus cuatro tests muerden. Es que **R37 no esta en el
mapa `R<n> -> test` de la bitacora** en una forma que cuente, y el script oficial **no lo detecto
porque hoy salta QC-81 entera**. Se cierra con una linea en `progress/impl_`; no vuelve codigo al
implementer.

## T1. Que ejecute yo

| Que | Resultado |
|---|---|
| `git status` en el worktree, antes de nada | `specs/` limpio y todo commiteado; solo este informe sin seguir. HEAD = `80176b5` |
| **Comprobador propio de solo-comentarios** (scratchpad, con el `typescript` del worktree: comparo el `printFile` sin comentarios para TS/TSX, el SQL sin comentarios respetando comillas y bloques de dolar, y el `.prisma` sin `//`; ademas cuento directivas y `/// @module`) sobre **los 34 commits `chore` del rango** | **34 de 34: el codigo no cambia.** 33 dan identico a la primera; el unico DISTINTO fue `migration.sql`, y al mirarlo a mano es un **falso positivo mio**: mi separador no quita los comentarios de dentro del bloque `DO`. El `git diff` de ese commit **no tiene ni una linea no-comentario** |
| El mismo comprobador: directivas y `/// @module` | Directivas iguales en 33 de 34. En `catalogo.test.ts` cambia el **texto** de tres `@ts-expect-error` (les quitaron la cita), no su numero ni su posicion: siguen pegados a la linea que deben marcar. `/// @module` de `schema.prisma`: **20 antes y 20 despues, y cada uno sigue pegado a su `model`** (los compare uno a uno) |
| **Barrido de citas en comentarios** (no en codigo) de los **34 archivos** que la rama toca frente al merge-base `f777c56`, con extraccion de comentarios por AST | **3 citas en total, y son exactamente las tres exceptuadas por el humano**: `error-codes.ts:6` y `:7`, y `down.sql:4` (la de R23). Ningun otro `QC-<n>`, `R<n>`, `design.md`, `requirements.md` ni decision cerrada en ningun comentario |
| `check-trazabilidad.mjs` del arbol principal, con el worktree como cwd | 1916 requisitos mapeados en 58 feature(s), exit 0 — **pero sin mirar QC-81**: ver B2 |
| **M5** (mutacion): quito `/// @module identity` de `CredentialSetupToken` y de `RevokedSession` | **rojo**: los dos tests fallan con expected null to be identity. 2 fallan, 56 pasan |
| **M6** (mutacion): dejo el `@module` y **cambio** el texto de los comentarios de esos dos modelos, metiendo dos lineas `///` nuevas entre el `@module` y el `model` | **verde, 58/58**: el re-anclado **no depende del texto del comentario** |
| **M7** (mutacion): quito ` FOR NO KEY UPDATE` de `addBatchToAlive` | **rojo por partida doble**: unitario, los 2 casos R37 (expected ... to contain FOR NO KEY UPDATE); integracion, los 2 casos R37 con **su propio mensaje**, el alta no espero a la fila y el borrado no espero al alta |
| Restauracion de M5, M6 y M7 | con copia previa en el scratchpad y `cmp` identico cada vez; al final `git diff --quiet lib` y `git status` limpio |
| `product-batch-lot.int.test.ts` entero, sin mutar | **19/19 en verde** |
| El caso 2 de R37 (con el alta llegando antes) **repetido 6 veces seguidas** | **6 de 6 en verde** |
| **Suite unitaria, partida por carpetas** (la leccion de QC-101: la limpieza toco comentarios que leen guardias y tests de disco) | `tests/unit/inventario` 35 archivos/558 tests; `tests/unit/errores` 2/30; `tests/unit/identity` 84 archivos, **1 rojo** (el ajeno de QC-95, abajo) y 1542 pasan; unidades, recetas, recetas-ui, proveedores y proveedores-ui 79/1048; el resto de carpetas 151/2149; `tests/ui` mas los sueltos de `tests/unit` 21/199 |
| `tests/guards` | **33 archivos, 343 tests, 5 saltados, cero rojos** |
| `git diff --stat` del rango sobre `app`, `components`, `hooks`, `middleware.ts`, `package.json`, `pnpm-lock.yaml` | **vacio**. En la rama entera, `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` tampoco cambian |
| Base compartida QuimiCloude | no la toque. Las integraciones corrieron contra la base efimera de la corrida |

**El unico rojo de toda la suite es el ajeno de QC-95** (`tests/unit/identity/usuarios/scope.test.ts`,
R45 de QC-66): protesta por `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts`,
que **no esta en el diff de la rama** (lo comprobe: 0 coincidencias) y que no esta en
`tests/baseline-rojos.json`. Es la misma deuda que ya señale en las dos revisiones anteriores.
No vi ningun corte de base de datos ni ningun timeout en mis corridas.

## T2. B1 cerrado: las cuatro comprobaciones que pedia el encargo

**1. Ninguna cita fuera de las tres exceptuadas: CUMPLE.** Barrido por AST de los 34 archivos
(produccion y tests) contra el merge-base. Las tres que quedan son las aprobadas, y las tres siguen
siendo **necesarias hoy**, lo verifique en el test que las exige:

- `catalogo.test.ts:183-187` afirma con `toContain` la frase de la sexta enmienda con su fecha y la de
  la aprobacion humana en la puerta F1.4; `error-codes.ts:6-7` las conserva **textualmente y solo esas
  dos lineas**: el resto de la cabecera esta limpio (93 a 17 lineas de comentario).
- `product-batch-lot-migration.test.ts:308-315` (`downHeaderStatesItsLimits`) exige la cita de R23 junto
  a NO VACIA NINGUN lot, SI PIERDE y `purchase_date`; `down.sql:4` conserva la cita **dentro de la
  frase que ya explicaba el limite**, y el archivo baja de 52 a 8 lineas de comentario. El caso `:561`
  comprueba ademas que sin esa cabecera el predicado da `false`, asi que la excepcion **esta viva**.

**2. Solo cambiaron comentarios en los commits `chore`: CUMPLE, comprobado por mi.** 34 commits, un
archivo cada uno, codigo identico por AST o por tokens en los 34. Lo unico que cambia ademas del
comentario es el **texto descriptivo** de tres `@ts-expect-error` (n3).

**3. `/// @module` intacto: CUMPLE**, y ahora esta **protegido**: M5 rojo, M6 verde.

**4. Los porques que quedan: en general CUMPLEN.** Lei las ~250 lineas de comentario que quedan en los
11 archivos de produccion. Son cortos, explican lo que el codigo no muestra y los que pude cruzar con
el codigo o con la documentacion son ciertos: el lock como sentencia aparte por READ COMMITTED,
`numeric` y `BigInt` por el techo de 2^53, `executeRaw` porque `pg_advisory_xact_lock` devuelve void,
`meta.target` por columnas, el reintento fuera de la transaccion, el parentesis de RLS de la migracion,
el AT TIME ZONE UTC y el desempate por `id`. Dos reservas menores en n4.

**Citas que siguen en CODIGO (fuera del alcance de la regla), anotadas como pedia el encargo.** No son
hallazgo; las dejo por escrito para que el leader decida si algun dia las toca:

- `migration.sql`, cuatro mensajes de `RAISE EXCEPTION` que empiezan por QC-81 y citan requisitos
  (`:30` R21, `:57` R22, `:87` R18 y R22, `:96` R7 y R22);
- los `toContain` de los tests que tienen que coincidir con esos mensajes, incluido el de QC-49 down;
- `MIGRACION_QC34` en `recipe-route-contract.test.ts` y los nombres de caso con `R<n>`, que la regla
  permite expresamente.

## T3. Los motivos falsos que se quitaron, y si se perdio alguno verdadero

Revise los comentarios **eliminados** de los archivos de produccion buscando un porque verdadero que
protegiera algo. **No se perdio ninguno** que yo pueda sostener; lo que se fue es historia, repeticion
del codigo y, en algunos casos, datos falsos. Verifique a mano cinco afirmaciones del implementer:

| Afirmacion de la bitacora | Mi comprobacion | Veredicto |
|---|---|---|
| El motivo del corrimiento de dia estaba **al reves** (decia zona negativa) | Con una cadena de fecha sin zona, la medianoche local de una zona **negativa** (UTC-5) cae el **mismo** dia en UTC; el que se corre al dia anterior es el de una zona **positiva**. El comentario nuevo (`product-prisma.ts:275`) ya no da el signo | correcto quitarlo |
| El docblock de `addBatchToAlive` decia que la transaccion impedia el borrado | Era falso, y es justo lo que T16 ha tenido que arreglar. El comentario nuevo (`:529`) dice lo contrario y es cierto | correcto, y ademas destapo D14 |
| `z.number().int()` aceptaria NaN | `zod` 4.4.3 en `node_modules`; el porque que **se conservo** (`product-actions.ts:48`: sin el patron pasarian notaciones como 1e3 o 0x10) si se sostiene | correcto |
| El motivo de `Object.setPrototypeOf` no se sostiene con target ES2017 | `tsconfig.json:3` declara ES2017, donde una clase que extiende Error conserva la cadena de prototipos. **La linea de codigo sigue ahi** (`errors.ts:17`), que era lo importante | correcto |
| Los seis datos corregidos de `schema.prisma` | Comprobe dos: la ruta del esquema esta en `prisma.config.ts:30` y no en `package.json`; y el seed **si** hace `findFirst` antes del `create` (`initial-access-repository-prisma.ts:42`) | correctos |

**Lo que si se fue y merece una nota**, no un hallazgo: la cabecera de `migration.sql` perdio el
inventario de LO QUE ESTA MIGRACION NO HACE y el parrafo de la trampa del superusuario en local. Eran
largos y citaban el spec, que es lo que la regla condena, pero contenian dos hechos que no estan en
ningun otro sitio del archivo: que ninguna sentencia hace INSERT ni DELETE, y que en local, conectando
como `postgres`, el parentesis de RLS no se observa. Los dos siguen escritos en `design.md` (2.1 y 9.4)
y vigilados por los tests de esquema, asi que no los cuento como perdida.

## T4. T16 y R37

**El lock, en el sitio y con el alcance correcto: CUMPLE.** `product-prisma.ts:529-540`: el `findFirst`
paso a `tx.$queryRaw` con un `SELECT "id" FROM "products"` acotado por `id`, por `company_id` y por
`deleted_at IS NULL`, con `FOR NO KEY UPDATE`, y la empresa sale de `companyScopeColumns(scope)`. Es la
**primera** sentencia de la transaccion; despues `resolveBatchLot()` y despues el `INSERT`.
`createWithFirstBatch` no se toco (lo comprobe en el diff de `6d6ff4d`: solo `addBatchToAlive` y su
tipo de fila). Sin fila, devuelve `null` con cero `executeRaw` y cero `create`.

**Que el borrado tome ese mismo lock: verificado, no supuesto.** `softDeleteAliveProduct:122-128` es un
`updateMany` de `deleted_at` y `updated_at`. Busque en las migraciones: **`products` no tiene ningun
indice unico** (solo los btree de `company_id`, `presentation_id` y `unit_id`, y los parciales de
busqueda), asi que ninguna columna que escriba el borrado es clave y Postgres toma exactamente
`FOR NO KEY UPDATE`. El comentario del codigo es cierto.

**Los dos ordenes de R37, con su desenlace: CUMPLEN.**

- Orden (a): el caso 1 de integracion deja el borrado sin confirmar, espera a ver al alta bloqueada,
  confirma, y afirma `null` mas lotes identicos a antes mas un solo lote en el producto. El
  `product_not_found` que exige R37 (a) **lo pone el caso de uso**, y tiene su test:
  `create-product.test.ts:402-414`, rechaza si el producto dejo de estar vivo entre la consulta y la
  escritura, con `ProductNotFoundError` y con `createWithFirstBatch` y `create` sin llamar, que es
  tambien el sin crear ningun producto del requisito.
- Orden (b): el caso 2 afirma que el borrado **espera** (lo prueba viendolo bloqueado en
  `pg_stat_activity`), que el lote queda escrito y que el producto queda borrado.

**Deterministas y muerden: CUMPLE.** 19/19 sin mutar, el caso 2 seis veces seguidas, y M7 los pone
rojos a los dos con mensajes propios. `fileParallelism: false` para el proyecto de integracion
(`vitest.config.mts:92`), asi que el sondeo de `pg_stat_activity` acotado a `current_database()` no
puede confundirse con el bloqueo de otro archivo.

**Los tres juicios que me pedia el encargo:**

1. **El aviso del implementer sobre el caso 2 (flake latente?). Lo sostiene el lock casi del todo, y la
   asercion que sobra es la del orden. Lo dejo como menor (n5), no como bloqueante.**
   - Lo que R37 (b) exige, que el borrado espere, **ya esta demostrado sin depender de ningun orden de
     respuestas**: el test ve al backend del borrado bloqueado en `transactionid` o `tuple` mientras el
     alta tiene la fila, y si no lo ve, falla con su mensaje. Eso si lo garantiza el lock.
   - Lo que **no** garantiza el lock es la asercion de que el orden de asentamiento sea alta y luego
     borrado, porque mide el orden en que **el cliente** ve resolverse las dos promesas. Postgres libera
     los locks del alta dentro de su commit y solo despues le responde; el borrado todavia tiene que
     re-evaluar la fila, escribir y confirmar antes de responder, asi que la ventana para una inversion
     es pequeña pero **no nula**, y son dos conexiones distintas resolviendose en el bucle de eventos.
   - Medido: 6 de 6 verdes, mas las 12 o mas corridas del implementer. No lo vi invertirse nunca.
   - Es un riesgo aceptable y anotado, no un defecto de R37.
2. **El timeout de Prisma (5.000 ms) frente a la espera del lock: correcto y con margen, con un limite
   anotado.** Verifique que el cliente se crea sin opciones y que `writeBatchWithLotRetry` llama a
   `prisma.$transaction(cb)` sin opciones, asi que rige el timeout por defecto de 5 s para el cuerpo,
   que ahora **incluye** la espera del lock de fila. La cota de sondeo del test (3.000 ms) queda por
   debajo, asi que un test atascado falla con su mensaje y no con un abort de Prisma. En produccion, un
   borrado que tardara mas de unos 5 s haria que el alta abortara por timeout en vez de esperar; el
   borrado es un `UPDATE` suelto, asi que hoy no es alcanzable. Esta escrito en la bitacora y en
   `design.md` 10.6. **De acuerdo.**
3. **Las claves del lock de aviso copiadas en el test: aceptable.** El test repite el 81 y el prefijo
   `product_batches_lot:` porque el adaptador no los exporta y T16 acotaba el cambio de produccion a
   `addBatchToAlive`. Si algun dia cambian, el caso 2 **falla** por su cota con el mensaje de que el
   alta no espero al lock de aviso del correlativo: se rompe ruidosamente, no en silencio. No es
   hallazgo.

**Interbloqueo con el lock del correlativo: no lo hay, y lo comprobe recorriendo los caminos, no
leyendo el diseño.** El orden en `addBatchToAlive` es fila, despues aviso, despues `INSERT`. Ninguna
otra transaccion pide el lock de aviso y **despues** bloquea una fila de `products` existente:
`createWithFirstBatch` pide el aviso pero solo inserta filas nuevas, que nadie mas ve; el borrado y la
edicion solo tocan su fila; las lineas de receta y de catalogo toman `FOR KEY SHARE`, compatible; y el
`INSERT` del lote toma `FOR KEY SHARE` sobre la fila que la propia transaccion ya tiene. **No se forma
ningun ciclo.**

## T5. Trazabilidad R1..R37, una fila por requisito

Las filas R1 a R36 conservan el juicio de la segunda revision, y puedo sostenerlo porque el rango **no
cambio ni un test de esas filas**: los `chore` solo tocan comentarios y lo comprobe archivo por archivo.
Ejecutado significa que el test volvio a correr en verde **hoy**, en la suite unitaria por carpetas, en
las guardias o en `product-batch-lot.int.test.ts` (19/19).

| R | Test | Cambio en el rango? | Resultado |
|---|---|---|---|
| R1 | `inventario-schema` (`purchaseDate` con `@db.Date`, obligatorio); `lot-int` R18 y R20 | solo comentarios | verificado, ejecutado |
| R2 | `create-product` pasa al puerto la fecha civil UTC del now inyectado; `lot-int` R3 y R2 | solo comentarios | verificado, ejecutado |
| R3 | `lot-int` una fecha escrita llega identica | solo comentarios | verificado, ejecutado |
| R4 | `create-product` la fecha futura se rechaza sin tocar el puerto: `invalid_input`, diagnostico con `purchaseDate` y puerto intacto | solo comentarios | verificado, ejecutado |
| R5 | `create-product` acepta hoy y una fecha de meses atras | solo comentarios | verificado, ejecutado |
| R6 | `product-batch-input` rechaza la fecha sin forma y la que no existe; `create-product`, las dos filas de R6 | solo comentarios | verificado, ejecutado |
| R7 | `lot-int` lote vacio y de solo espacios (23514) y NULL (23502); `inventario-schema` | solo comentarios | verificado, ejecutado |
| R8 | `lot-int` R8 y R9; `product-batch-input` el lote ausente o nulo sigue siendo valido | solo comentarios | verificado, ejecutado |
| R9 | `lot-int` un lote no numerico no altera la serie y 007 cuenta como 7 | solo comentarios | verificado, ejecutado |
| R10 | `create-product` pasa el lote escrito tal cual, recortado; `retry`; `lot-int` R13 | `retry` cambio por T16: dobla `queryRaw` en vez de `findFirst` | verificado, ejecutado; lo que afirma no cambio |
| R11 | `lot-int` un duplicado da 23505; `mig`; `inventario-schema` | solo comentarios | verificado, ejecutado |
| R12 | `lot-int` R12 y R27 | solo comentarios | verificado, ejecutado |
| R13 | `lot-int` R13 y R25; `retry`; `catalogo`; `product-actions` | `retry`, por T16 | verificado, ejecutado |
| R14 | `lot-int` 3 rondas de 8 altas simultaneas | solo comentarios | verificado, ejecutado |
| R15 | `retry`: reintento, 3 intentos y P2002 ajeno | `retry`, por T16 | verificado, ejecutado |
| R16 | `lot-int` con 50 tecleado, y con 18 nueves tecleados, sin techo | solo comentarios | verificado, ejecutado |
| R17 | `mig` R17; `lot-int` sandbox con el DOWN real | solo comentarios | verificado, ejecutado |
| R18 | `lot-int` numera las filas sin lote y el relleno sigue sin techo; `mig` `fillsLotBySeriesPerCompany` | solo comentarios | verificado, ejecutado |
| R19 | `lot-int` R18 y R19; `mig` R19 y R26 | solo comentarios | verificado, ejecutado |
| R20 | `lot-int` con la tabla vacia | solo comentarios | verificado, ejecutado |
| R21 | `lot-int` dos filas de la misma empresa con el mismo lote; `mig` R21, con su mutacion | solo comentarios | verificado, ejecutado |
| R22 | `mig` orden, ROW_COUNT y parentesis de RLS; `lot-int` R21 | solo comentarios | verificado, ejecutado |
| R23 | `mig` el down no contiene ningun UPDATE, mas `downHeaderStatesItsLimits` | `down.sql` y su test, **solo comentarios** | verificado, ejecutado; la excepcion de cita sigue siendo la que el test exige |
| R24 | `create-product` rechaza a un actor sin permiso, 4 variantes | solo comentarios | verificado, ejecutado |
| R25 | `lot-int` R13 y R25; `retry` | `retry`, por T16 | verificado, ejecutado |
| R26 | `mig` R26; `inventario-schema`; `lot-int` | solo comentarios | verificado, ejecutado |
| R27 | `lot-int` R12 y R27; `guard-ambito-empresa-inventario`; `company-scope` | solo comentarios | verificado, ejecutado (guardias 343/343) |
| R28 | `qc81-alcance` R28 | solo comentarios | verificado, ejecutado; coincide con mi `git diff`: nada bajo `app/` |
| R29 | `qc81-alcance`, 3 casos | solo comentarios | verificado, ejecutado; la excepcion sigue siendo un unico `e2e/aislamiento-inventario.spec.ts` |
| R30 | `qc81-alcance`, 2 casos | solo comentarios | verificado, ejecutado; sin cambios en `package.json` ni en el lock en toda la rama |
| R31 | `qc81-alcance`, 4 casos | solo comentarios | verificado, ejecutado |
| R32 | `qc81-alcance`, 3 casos; `module-contract` | solo comentarios | verificado, ejecutado; ningun export nuevo |
| R33 | `lot-int` completo | se amplia con los 2 casos de R37 | verificado, ejecutado, 19/19 |
| R34 | `product-batch-input`, 4 casos (60 digitos, ceros a la izquierda, espacios y 61 digitos); `create-product` con un lote de 60 digitos lanza ValidationError; `lot-int` paso 4 | solo comentarios | verificado, ejecutado |
| R35 | `product-batch-input` 59 digitos se aceptan y 60 caracteres con una letra o un guion tambien; `lot-int` paso 1 | solo comentarios | verificado, ejecutado |
| R36 | `lot-int` R35, R36 y R34, pasos 2 y 3 | solo comentarios | verificado, ejecutado |
| **R37** (nuevo) | `retry`: bloquea la fila con FOR NO KEY UPDATE antes del lock del correlativo, y sin fila viva devuelve null con la lectura bloqueante como unica sentencia; `lot-int`: los dos ordenes; y el `product_not_found` de R37 (a) en `create-product.test.ts:402` | nuevo (T16) | **verificado y ejecutado**: los cuatro en verde, y los cuatro rojos con M7. **Pero no esta en el mapa de la bitacora: B2** |

**Resultado: 37 de 37 verificados por juicio, ninguno sin verificar.** Lo que falla es el **registro**
del 37, no su test.

## T6. Hallazgos nuevos

**B2 (BLOQUEANTE). R37 no figura en el mapa R -> test de `progress/impl_`, y el script oficial no lo
vio porque hoy salta QC-81 entera.**

- **Que pasa.** La bitacora cierra la tanda 8 con una frase en prosa: Adenda al mapa R -> test: R37, lo
  cubren los dos unitarios y los dos casos de integracion de arriba. El mapa de verdad, la tabla de
  filas `| R<n> | test |`, **no tiene fila para R37**, y ninguna linea del archivo **abre** con R37.
- **Por que eso no basta.** `scripts/check-trazabilidad.mjs:93-101` solo cuenta lo que **abre** linea
  (fila de tabla, item de lista o negrita al principio), y su propio comentario dice por que: la
  bitacora nombra requisitos tambien en prosa, asi que un parrafo que los cite todos habria bastado
  para pasar sin que existiera el mapa. `CHECKPOINTS.md:13` exige que el mapa lo contenga.
- **Por que el script salio en verde igual.** Con el worktree como cwd, el `feature_list.json` **de este
  worktree** trae QC-81 con estado `spec_ready` (el del arbol principal dice `in_progress`), y el script
  solo mira `done` e `in_progress` (linea 56). Y aunque el estado fuera el bueno, tampoco la miraria:
  con T12 sin marcar hay una task pendiente y el script salta la feature a proposito (lineas 69-76).
  **O sea: el verde del script de hoy no dice nada sobre QC-81.** Reproduje su logica exacta, sus dos
  expresiones regulares y sin el salto, sobre los dos archivos: **37 declarados, 36 mapeados, falta
  R37**.
- **Que falta para cumplir.** Una linea en `progress/impl_QC-81-lote-y-fecha-de-compra.md`: añadir la
  fila de R37 a la tabla del mapa, con sus cuatro tests. Nada de codigo.
- **Consecuencia para el leader:** en cuanto marque T12 y ponga QC-81 en `in_progress`, el gate completo
  se pondra **rojo** por esto. Mejor arreglarlo antes.

**n3 (menor). La limpieza cambio el texto descriptivo de tres `@ts-expect-error`.**

- En `tests/unit/errores/catalogo.test.ts`, los tres comentarios de directiva pasaron a decir lo mismo
  sin la cita. La directiva, su numero y su posicion no cambian, y el archivo esta en verde (30/30),
  asi que el efecto es nulo.
- Lo anoto porque **el comentario de un `@ts-expect-error` no es un comentario cualquiera**: es lo unico
  que dice al siguiente lector que error se espera. Quitar la cita es lo que manda la regla; lo que
  pido es que la bitacora lo diga, en vez de contarlo como solo comentarios sin distinguirlo.

**n4 (menor). Dos comentarios que quedan rozan lo que la regla desaconseja.**

- `product-prisma.ts:542-543` afirma que el orden fila y luego lock de aviso no puede formar un ciclo
  con el borrado, que solo toma la fila. Es **cierto**, lo verifique, pero es una afirmacion sobre
  **todo el sistema** hecha desde un archivo: el dia que otra transaccion pida el aviso y despues una
  fila, este comentario seguira ahi diciendo que no hay ciclo. La regla que lo protege vive en
  `design.md` 10.3, y ahi no puede citarse. Sugerencia: dejar el comentario en lo que este archivo
  controla, que por eso la fila va antes del aviso, y no en la conclusion global.
- `migration.sql:63`, el arreglo de n1: dice la condicion completa y es correcto, pero es la unica linea
  de comentario del archivo que pasa de 110 caracteres. Cosmetico.
- No hay ningun bloque de mas de unas 5 lineas en produccion: el mas largo que queda es de 4.

**n5 (menor). El caso 2 de R37 afirma un orden de respuestas que el lock no garantiza.**

- La asercion de que el orden de asentamiento sea alta y luego borrado mide el orden en que **el
  cliente** ve resolverse las dos promesas. Lo que R37 (b) exige, y lo que el lock garantiza, es que el
  borrado **espere**, y eso ya lo afirma la espera sobre `pg_stat_activity` de la linea anterior, que
  ademas es la que se pone roja con M7.
- Riesgo real: bajo. No lo vi en 6 corridas ni el implementer en 12 o mas. Si algun dia parpadea, esta
  es la causa, y la salida es sustituir esa asercion por una prueba del lado del servidor, nunca por un
  `sleep`.
- Ya esta anotado en la bitacora como riesgo teorico, que es lo correcto; lo dejo como menor para que
  quede tambien en el informe.

## T7. Checklist de CHECKPOINTS.md, punto por punto

- [x] `requirements.md` con EARS numerados: R1 a R37, y la segunda enmienda no cambia ningun texto anterior.
- [x] `design.md` con alternativas descartadas y su porque: 6 G, H e I (FOR SHARE, disparador y subir el aislamiento), las tres con motivo.
- [ ] **`tasks.md` con todas las tasks marcadas: NO.** Queda T12 (`tasks.md:350`), que es el cierre con el gate y le toca al leader. T16 esta marcada.
- [ ] **Cada R mapea a un test concreto: si por juicio (T5, 37 de 37), pero el mapa de la bitacora no lo registra. B2.**
- [ ] **`progress/impl_` contiene el mapa R -> test: incompleto, falta R37. B2.**
- [x] `typecheck` y `lint`: los corrio el implementer en verde y el leader en su `--rapido`; no los repeti, porque desde entonces no cambio codigo.
- [ ] La suite en verde: **queda el rojo ajeno de QC-95** (`scope.test.ts`, R45), que no esta en `tests/baseline-rojos.json`. Es deuda de `dev`, no de esta rama, pero **hoy pondria rojo el `./init.sh` completo**.
- [x] E2E de flujo critico: excepcion consciente ya aprobada (diferido a QC-103), anotada en `design.md` 8 y en la bitacora.
- [x] UI multiplataforma: no aplica, la rama no toca `app/`, `components/` ni `hooks/` (comprobado en el diff de la rama entera).
- [x] Dependencias: ninguna nueva en toda la rama (`package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` sin cambios).
- [x] **Comentarios de produccion sin citar fichas, requisitos ni el spec, y la limpieza en commit aparte: CUMPLE** (T2), con las tres excepciones aprobadas por el humano y exigidas por dos tests.
- [x] Aislamiento por empresa: sin modelos nuevos; el lock nuevo va **acotado a la empresa** (`company_id` de `companyScopeColumns`), y R27 y las guardias de ambito estan en verde.
- [x] Permiso validado en el service y con test (`requirePermission` en `create-product.ts:81`, R24 en verde).
- [x] RLS: sin tablas nuevas; el parentesis NO FORCE y FORCE de la migracion sigue cerrado y vigilado por su test.
- [x] El acceso a datos pasa solo por el repositorio; `domain/` sigue sin Prisma; ningun `use server` reexportado.
- [x] `/// @module` en todos los modelos: 20 de 20, y ahora con mutacion que muerde (M5 y M6).
- [x] Migracion versionada con su `down.sql` y su test.
- [x] Sin secretos ni hardcode de contexto; sin webhooks.
- [ ] `./init.sh` completo en verde, veredicto OK y entrada en `progress/history.md`: pendientes del leader (T12).

## T8. Resumen para el leader

- **RECHAZADO: 1 mayor (B2) y 3 menores (n3, n4, n5).**
- **B1 esta cerrado de verdad**, comprobado con mi propio comprobador y no con el del implementer: 34
  commits `chore` que no tocan ni una linea de codigo, 3 citas en comentarios en toda la rama y son
  exactamente las tres exceptuadas, `@module` intacto y ahora **protegido** por un ancla que no depende
  del texto (M5 rojo, M6 verde).
- **T16 y R37 estan bien**: el lock va donde debe, acotado a la empresa y antes del correlativo;
  `createWithFirstBatch` intacto; los dos ordenes probados con su desenlace; los cuatro tests mueren sin
  el lock (M7); no hay interbloqueo posible; y el timeout de Prisma no aprieta. n1 y n2 quedaron
  arreglados.
- **El unico bloqueante es una linea de bitacora**: añadir R37 al mapa R -> test. No vuelve codigo al
  implementer.
- **Dos cosas que conviene saber antes de cerrar:**
  1. El `feature_list.json` **de este worktree** tiene QC-81 en `spec_ready` mientras el del arbol
     principal la tiene en `in_progress`. Con esa copia, `check-trazabilidad` **ni mira la feature**.
  2. Sigue el rojo ajeno de QC-95 en `tests/unit/identity/usuarios/scope.test.ts`, que no esta en
     `tests/baseline-rojos.json` y pondra rojo el `./init.sh` completo.
