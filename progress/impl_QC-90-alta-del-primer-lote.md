# QC-90 — alta-del-primer-lote · bitacora de implementacion

> La escribe el `implementer`. Coordina, no escribe codigo de produccion: cada tanda la ejecuta un
> subagente (`backend_dev` / `frontend_dev`) y aqui se consolida lo que devolvieron.
> Worktree: `.worktrees/QC-90-alta-del-primer-lote`, rama `feature/QC-90-alta-del-primer-lote`.

## Estado

| Tanda | Tasks | Estado | Gate |
|---|---|---|---|
| 0 (extra) | T0 | cerrada | `./init.sh --rapido` verde |
| 1 | T1, T2, T3 | cerrada | `./init.sh --rapido` verde |
| 2 | T4, T5 | cerrada | typecheck rojo a proposito hasta T7 |
| 3 | T6, T7, T8 | cerrada | typecheck de vuelta en verde |
| 4 | T9, T10, T11, T12 | cerrada | `./init.sh --rapido` verde |
| 5 | T13, T14 | cerrada | `./init.sh` COMPLETO verde, exit 0 |

## Tanda 0 — T0, deuda de la rama (no sale de `requirements.md`)

`pnpm run typecheck` estaba en rojo al recibir la rama:

```
app/(private)/inventario/components/product-form.tsx(423,11): error TS2322:
  Property 'helper' does not exist on type 'IntrinsicAttributes & PresentationSelectProps'.
```

El commit `ec0daa3` del formulario pasa `helper` a `PresentationSelect`, y ese prop **no existia**
en la version commiteada del componente: venia de un cambio sin commitear de otra sesion. Con el
typecheck en rojo ninguna task siguiente puede darse por hecha, asi que se anadio a `tasks.md` como
**T0** y se hizo primero. **No cubre ningun `R<n>` de QC-90.**

- `components/shared/presentation-select.tsx` — prop `helper?: ReactNode`, **opcional y aditiva**.
  El componente lo comparten inventario y proveedores: ningun consumidor actual cambia. Replica el
  patron de ayuda de `ProductField` — `Tooltip` cuyo disparador es un `<button type="button">` con
  `aria-label="Qué es Presentación"` y `data-testid="presentation-helper"`, contenido con
  `data-testid="presentation-helper-text"`. `type="button"` no es cosmetico: el panel entero es un
  `<form>` y un boton sin tipo lo enviaria.
- `tests/unit/shared/presentation-select-helper.test.tsx` (nuevo, 3 casos): sin `helper` no se
  pinta ningun disparador; con `helper` el disparador existe, es `type="button"` y lleva su
  `aria-label`; al activarlo sale el contenido. Ademas comprueba que la etiqueta sigue nombrando al
  combobox con el icono al lado.

Verificado: `pnpm run typecheck` verde (el TS2322 desaparece), `pnpm run lint` verde,
`vitest related --run components/shared/presentation-select.tsx` → 11 archivos / 166 tests,
`vitest run tests/unit/proveedores-ui/catalog-line-sheet.test.tsx tests/unit/inventario/product-page.test.tsx`
→ 2 archivos / 51 tests. Ningun consumidor roto.

## Tanda 1 — dominio puro (T1, T2, T3)

Creados:
- `lib/modules/inventario/domain/unit-cost.ts` — `deriveUnitCost(totalCost, stock)`, **`BigInt`
  nativo**, redondeo mitad arriba a 4 decimales, `null` cuando redondea a `0.0000`.
  Ninguna dependencia nueva: `design.md > 5` descarto la libreria de decimales con argumento y
  `package.json` no cambia.
- `lib/modules/inventario/domain/product-batch.ts` — `NewProductBatch`. No menciona `Prisma` ni
  `Date`.
- `lib/modules/inventario/domain/product-batch-input.ts` — `createProductWithFirstBatchSchema`,
  `strictObject`, importes como **cadena decimal**, `superRefine` con `path` explicito para R8
  (`['stock']`), R9 (`['totalCost']`) y R11 (los dos campos de costo).
- `tests/unit/inventario/unit-cost.test.ts`, `tests/unit/inventario/product-batch-input.test.ts`.

Modificados:
- `lib/modules/inventario/domain/product-input.ts` — se extrae `productFieldsShape` con los cuatro
  campos de hoy; `createProductSchema` pasa a `z.strictObject({ ...productFieldsShape })`, misma
  semantica. La edicion (R26) no cambia. Precedente: `catalogLineFieldsShape` de `proveedores`.
- `lib/modules/inventario/index.ts` — reexporta `createProductWithFirstBatchSchema`,
  `CreateProductWithFirstBatchInput`, `PRODUCT_BATCH_LOT_MAX_LENGTH` y `NewProductBatch`. Sigue
  client-safe (sin `next/*`, sin `'use server'`, sin Prisma) y **sin ninguna operacion de listar,
  editar o borrar lotes** (R30).

### Dos cosas medidas que conviene no volver a descubrir

1. **`target: ES2017` en `tsconfig.json` prohibe los literales `0n`/`10n`** (TS2791). `unit-cost.ts`
   construye sus constantes con `BigInt(...)`. La aritmetica es igual de exacta y no se toco el
   `target`, que es decision del repo entero.
2. **zod v4 ejecuta el `superRefine` aunque un campo ya haya fallado, y con el valor crudo**: un
   `totalCost: '0'` cobraba DOS issues. El esquema sale temprano si un importe presente no pasa su
   patron/no-cero o si `stock` no es entero, para que cada error se pinte una sola vez. Y el issue
   de `strictObject` es `code: 'unrecognized_keys'` con `path: []` y la lista en `issue.keys`.

Verificado: `typecheck` verde, `lint` verde, los cinco archivos pedidos 5/5 y 49 tests,
`vitest run tests/unit/inventario` 24 archivos / 307 tests, `test:guardias` 26 archivos / 263 tests.

### Gate de cierre de las tandas 0 y 1

`./init.sh --rapido` → `== init OK ==`. `test:rapido` selecciono 5 archivos del diff vs `origin/dev`
(4 archivos / 95 tests) mas las 26 guardias (263 tests, 4 skipped).

## Mapa `R<n> -> test` de las tandas 0 y 1

El mapa consolidado y completo de los 32 requisitos esta **al final del archivo** (T14).

| R | Test |
|---|---|
| R2 | `tests/unit/inventario/product-batch-input.test.ts` :: «rechaza la presentacion ausente o sin forma de uuid senalando presentationId» |
| R4 | `product-batch-input.test.ts` :: «acepta el importe con la forma de decimal(14,4) y rechaza cualquier otra»; `unit-cost.test.ts` :: «no convierte ningun importe a numero de coma flotante en el codigo fuente» |
| R5 | `product-batch-input.test.ts` :: «rechaza el importe de todos ceros senalando el campo del importe recibido» |
| R7 | `unit-cost.test.ts` :: «divide el costo total entre la existencia...», «redondea a cuatro decimales una division periodica», «redondea la mitad exacta hacia arriba» |
| R8 | `product-batch-input.test.ts` :: «rechaza el alta con solo costo total y existencia 0 senalando el campo de la existencia» |
| R9 | `unit-cost.test.ts` :: «devuelve null cuando el costo unitario derivado redondea a cero»; `product-batch-input.test.ts` :: «...en totalCost» |
| R10 | `product-batch-input.test.ts` :: «acepta el alta con LOS DOS costos y no los compara entre si» |
| R11 | `product-batch-input.test.ts` :: «rechaza el alta sin ninguno de los dos costos senalando LOS DOS campos» |
| R12 | `product-batch-input.test.ts` :: «acepta el lote y la fecha de expiracion cuando vienen, y tambien cuando vienen en nulo» |
| R14 | `product-batch-input.test.ts` :: «recorta el lote y rechaza el que pasa de 60 caracteres una vez recortado» |
| R24 | `product-batch-input.test.ts` :: «rechaza un campo desconocido en vez de ignorarlo en silencio» |
| — | T0 (deuda de rama): `tests/unit/shared/presentation-select-helper.test.tsx`, 3 casos |

## Tanda 2 — puerto y caso de uso (T4, T5)

- `lib/modules/inventario/ports/product-repository.ts` — `findAliveIdByName`,
  `createWithFirstBatch` y `addBatchToAlive`. Los cinco metodos de hoy no cambian de firma. El
  puerto no importa `@prisma/client` ni framework.
- `lib/modules/inventario/domain/create-product.ts` — reescrito con el **orden fijo** de
  `design.md > 3`: `requirePermission(actor, 'inventario.modificar')` **primera linea** → zod con
  `createProductWithFirstBatchSchema` → derivacion del costo → `findAliveIdByName` → escritura.
- Tests: `tests/unit/inventario/create-product.test.ts` (nuevo, 24 casos) y los dobles del puerto
  completados en `product-service.test.ts`, `authorization.test.ts`, `list-use-cases.test.ts` y
  `product-input.test.ts`. **Ningun caso se borro.** Dos cambiaron de medida, con el motivo escrito
  en el propio archivo: el alta ya no pasa por `create` sino por `createWithFirstBatch`, y quien
  decide el homonimo es ahora el puerto.

### `addBatchToAlive` devuelve `null`: que se hace

**Lanza `ProductNotFoundError`; no cae al camino de creacion.** El motivo, escrito en el codigo y
en su test: por el camino de «producto que ya existe», R18 declara **ignorados** el nombre, la
existencia y la alerta del panel. Caer a crear los escribiria en silencio, justo lo que quien los
tecleo ya sabe que no se guarda. Con el rechazo, el reintento vuelve a pasar por
`findAliveIdByName` —que ya dira `null`— y crea por la via normal, con la entrada revalidada. R1 se
mantiene: no se escribio ningun producto, asi que no queda ninguno sin lote.

### Verificacion

`lint` verde. `vitest run tests/unit/inventario` → 26 archivos / 348 tests.
`test:guardias` → 26 / 263 + 4 skipped. `vitest run tests/unit/composition` → 5 / 5.
`typecheck` con **un solo error, el esperado**: `lib/composition/index.ts(229,7) TS2739`, que cierra
T7 en la tanda siguiente. Se dejo abierto a proposito en vez de tocar un archivo fuera de alcance.

## Tanda 3 — persistencia (T6, T7, T8), 2026-09-10

### Archivos

- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` (modificado) — T6.
  Bloque QC-90 al final: `findAliveIdByName`, `createWithFirstBatch`, `addBatchToAlive`, mas
  `toBatchUnitCost`, `toBatchExpiryDate`, `toBatchCreateData` y la traduccion de la FK. Vuelve a
  importar UN error de dominio (`ValidationError`) y el docblock de cabecera lo explica: la FK de
  `presentation_id` es la unica que este archivo puede volver a violar. Sigue siendo el unico
  archivo del modulo que importa `@prisma/client` y sigue sin tocar `users` (la autoria se escribe
  como escalar).
- `lib/composition/index.ts` (modificado) — T7. `productRepository` gana las tres funciones. Nada
  mas cambia: `createProduct: createCreateProduct({ products: productRepository })` sigue igual.
  Con esto cierra el `TS2739` que la tanda 2 dejo abierto.
- `tests/integration/inventario/product-batch-write.int.test.ts` (nuevo) — T8, 10 casos.

### Desviacion declarada respecto de `tasks.md` (T8)

`tasks.md` pedia «cada caso dentro de `prisma.$transaction` con ROLLBACK». **No se sigue al pie de
la letra, y el motivo esta escrito en la cabecera del propio archivo de test**: las tres funciones
del adaptador llaman al cliente Prisma **global**, no a un `tx` inyectado, asi que no participan de
la transaccion del test y el ROLLBACK no desharia su escritura — seria un aislamiento de mentira.
Se sigue el patron que de verdad usa `tests/integration/inventario/product-crud.int.test.ts`, que
documenta exactamente esto: cada caso siembra sus datos, afirma solo sobre los ids que el mismo
creo (ninguna afirmacion global tipo «hay N productos») y limpia en un `finally`, en orden de FK.
La estrategia de transaccion + `SAVEPOINT` + ROLLBACK **si** se usa donde tiene sentido: el caso
del `CHECK (unit_cost > 0)`, que ejercita la BASE con SQL crudo y no al adaptador.

### Dos decisiones de implementacion que conviene no volver a discutir

1. **`addBatchToAlive` no usa `product: { connect: { id, deletedAt: null } }`.** Habria puesto la
   vida en el `where` de un solo viaje, pero obliga al `create` «checked» de Prisma y entonces
   `presentation_id` tendria que ir tambien como `connect`: una presentacion inexistente dejaria de
   ser un `P2003` y pasaria a ser un `P2025` indistinguible del producto borrado, o sea que el
   adaptador devolveria `null` («producto no vivo») ante una presentacion invalida. Se usa
   `$transaction` con `findFirst({ where: { id, deletedAt: null } })` + `create` con `productId`
   escalar: `deleted_at IS NULL` viaja al SQL igual, y lo que se mira despues es si la consulta
   devolvio fila — el mismo gesto que `findAliveProductById` (`row === null`) y
   `updateAliveProduct` (`count === 1`). Lo prohibido por la regla del archivo es traer la fila y
   leerle `deletedAt` en el lenguaje; eso aqui no pasa.
2. **La FK del lote se traduce por codigo y sin mirar la columna.** `product_batches` tiene cuatro
   FK y el conector no dice cual fallo (hallazgo empirico ya documentado en
   `supplier-catalog-line-prisma.ts`: `meta.constraint` llega `null`). No hace falta distinguir:
   `product_id` se escribe con un producto recien creado en la misma transaccion o recien leido
   vivo, y `created_by`/`updated_by` salen del actor de la sesion. La unica FK alimentada por un
   campo del formulario es `presentation_id`. El razonamiento esta escrito en el docblock para que
   no se lea como un atajo.

### Verificacion

`pnpm run typecheck` verde (sin salida). `pnpm run lint` verde (sin salida).
`pnpm exec vitest run tests/unit/inventario` → 26 archivos / 348 tests, todos verdes (incluido
`product-page.test.tsx`). `pnpm run test:guardias` → 26 archivos / 263 tests + 4 skipped.
`vitest run tests/unit/composition tests/integration/inventario` → 8 archivos / 73 tests, verdes,
contra la base real `QuimiCloude_QC90`.

### Mapa `R<n> -> test` de esta tanda

| R | Test |
|---|---|
| R5 (lado base) | `product-batch-write.int.test.ts` :: «el CHECK product_batches_unit_cost_positive rechaza el 0 con 23514» |
| R7 (lado base) | `product-batch-write.int.test.ts` :: «guarda el derivado de total/existencia tal cual, sin perder decimales» |
| R12 (lado base) | `product-batch-write.int.test.ts` :: «deja lot y expiry_date en NULL cuando no vienen» |
| R13 | `product-batch-write.int.test.ts` :: «guarda la misma fecha civil que se escribio» |
| R18 | `product-batch-write.int.test.ts` :: «deja name, stock, qty_alert y updated_at del producto intactos» y «devuelve null -y no escribe lote- si el producto ya no esta vivo» |
| R19 | `product-batch-write.int.test.ts` :: «devuelve null cuando todos los homonimos estan borrados logicamente» |
| R20 | `product-batch-write.int.test.ts` :: «elige el de creacion mas antigua y desempata por identificador ascendente» |
| R21 | `product-batch-write.int.test.ts` :: «un fallo del lote no deja ningun producto escrito» |
| R22 | `product-batch-write.int.test.ts` :: «escribe created_by y updated_by con el identificador del actor» |

## Tanda 4 — borde y pantalla (T9, T10, T11, T12)

### T9 — Server Action (`adapters/driving/product-actions.ts`)

`buildProductCandidate` se parte en **tres**: `buildProductFields` (lo compartido),
`buildCreateProductCandidate` (los cuatro del producto + los cinco del lote, todos con
`readOptionalFormString`, **cadenas sin convertir**) y `buildUpdateProductCandidate` (solo el
producto).

**Por que separar y no un flag (R26).** `updateProductSchema` es `strictObject` sin ningun campo de
lote: un candidato de edicion con los cinco campos moriria con `invalid_input` en **cada** edicion.
Con dos constructores distintos eso es estructuralmente imposible — no hay rama que equivocar ni
parametro que invertir. R26 no pide «no mandarlos por defecto», pide que la edicion **no envie
ninguno**.

`CreateProductFormState` no cambia de forma. La action sigue sin decidir nada: ni
`requirePermission` ni ninguna regla, solo `FormData` → candidato y error → estado, con el traductor
unico de `@/lib/modules/errores`.

Efecto colateral declarado: el caso ya existente «los campos que el producto perdio no cruzan la
Server Action» afirmaba que `presentationId` no llega **ni en alta ni en edicion** —venia del
2026-09-09, cuando la presentacion se mudo a `product_batches`—. El alta vuelve a enviarla, ahora
como campo **del lote**, asi que el caso pierde `presentationId` y gana un comentario; la parte de
la edicion la fija el caso nuevo de R26. `cost`, `minPurchase` y `deliveryTime` siguen prohibidos en
los dos caminos.

El test de «ningun importe por coma flotante» no puede prohibir `Number(` a secas —
`readOptionalFormInt` lo usa legitimamente para `stock`/`qtyAlert`—: quita comentarios primero (el
archivo **nombra** las funciones prohibidas al explicar por que no las usa, y si no se cazaria a si
mismo), prohibe `parseFloat`/`parseInt`/`toFixed`, exige que `Number(` aparezca **exactamente una
vez** y sea `return Number(trimmed);`, y comprueba que ninguna linea que mencione
`unitCost`/`totalCost` los convierta. **Se comprobo que muerde**: envolviendo `unitCost` en
`Number(...)` caen 3 casos.

### T10 — Formulario (`app/(private)/inventario/components/product-form.tsx`)

La validacion previa pasa a `createProductWithFirstBatchSchema` en el alta y `createProductSchema`
en la edicion. **Se borra** el bloque entero de validacion manual del lote (`presentationId` vacio,
`parseDecimal` de los dos costos, la regla del par de costos, el largo del lote y el `Date.parse` de
la caducidad), la funcion `parseDecimal` y la constante `LOT_MAX_LENGTH`. Menos codigo, no mas.

`FIELD_MESSAGES.unitCost`/`.totalCost` pasan de «0 o mas» a **«mayor que 0»** (R27, R5): el
`CHECK (unit_cost > 0)` existe desde el 2026-09-09 y el front **aceptaba el 0** — era la deuda que
el `requirements.md` declaraba y queda saldada.

El reparto de errores por campo no se toca: el formulario ya mapea `issue.path[0]` a su campo, y por
eso el issue de R8 —que el `superRefine` cuelga de `['stock']`— se pinta **en la existencia** sin
una linea nueva de reparto. **Se verifico, no se supuso**: el test comprueba ademas que **no** se
marca ningun costo.

Un cambio no pedido, y se señala: el guardian de salida pasa de
`if (Object.keys(fieldErrors).length > 0)` a `if (!parsed.success || Object.keys(...).length > 0)`,
para que un `unrecognized_keys` —que trae `path: []` y no tiene campo donde pintarse— no termine
llamando a la Server Action en silencio.

**Multiplataforma**: no entra ningun control nuevo. Los dos costos siguen `type="text"` con
`inputMode="decimal"` —lo que ademas evita el `type="number"` sobre un importe—, los objetivos
tactiles en `min-h-11` y el texto de campo en `text-base`. **No hay excepcion de escritorio que
declarar** (`CHECKPOINTS.md`, `docs/architecture.md > Componentes`).

### T11 — Limites de alcance (`tests/unit/inventario/module-contract.test.ts`, nuevo)

Archivo nuevo y no ampliacion de uno existente, con motivo: `scope.test.ts` mide el alcance de
QC-20 sobre el **arbol de archivos** y `product-route-contract.test.ts` es el contrato de la
**ruta**; R30 pregunta por el contrato del **modulo**, y el precedente del repo para eso ya tiene
nombre propio (`tests/unit/recetas/module-contract.test.ts`).

R30 se mide sobre `Object.keys(import * as inventario)`, **no sobre texto**, y la regla es
estructural en vez de lista negra: un export infringe si sus palabras juntan una de lote
(`batch`/`lote`/`lot`…) con un verbo de listar/editar/borrar. `create` queda fuera a proposito —
`createProductWithFirstBatchSchema` y `PRODUCT_BATCH_LOT_MAX_LENGTH` deben pasar, y son a la vez el
ancla anti-vacuidad del test. R31 muerde por dos vias: un tipo condicional que pone rojo el
`typecheck` si `ProductView` recupera la presentacion, y la lectura del mapeo del picker.

### T12 — Que no hay migracion (`tests/unit/inventario/schema/inventario-schema.test.ts`)

El caso del censo compara contra `git merge-base origin/dev HEAD` con **tres puntos** y **se salta
con motivo** (`ctx.skip`) tanto si no hay merge-base como si el rango existe pero esta vacio: un
«cero migraciones agregadas» ahi seria verde vacuo. **Es justo la correccion que
`docs/verification.md > Rojos heredados` deja pendiente para las cuatro entradas del baseline**, que
estan ahi por esta misma clase de guardia colgada de un diff. Un segundo caso compara el **arbol de
trabajo** contra `git ls-tree <base>:db/migrations`, que caza una migracion recien creada y todavia
sin commitear — el momento exacto en que R29 se violaria sin que el diff de commits lo viera.

### Las tres guardias se probaron por mutacion, no solo por su caso verde

`docs/verification.md > Probar que muerde, no que pasa`. Cada mutacion se restauro con `cp` desde
una copia, **nunca con `git checkout`** (hay cambios sin commitear de otras sesiones).

| Que se rompio | Caso que cayo | Mensaje |
|---|---|---|
| `export { ... as deleteProductBatch }` en el barrel | R30 | «el contrato publico de inventario expone operaciones de lote que R30 prohibe: deleteProductBatch…» |
| `readonly presentationId` en `ProductView` | R31 | «ProductView volvio a declarar presentacion: eso es la alternativa B de design.md > 10…» + `TS2322` en el typecheck |
| `presentationId` en el mapeo del picker | R31 | «el picker esta poblando la presentacion desde el listado…» |
| Carpeta `db/migrations/29990101000000_falsa/` | R29 | «R29: db/migrations/ gano carpetas que no estan en el merge-base con dev…» |
| `origin/dev` → una rama inexistente | R29 | **skipped, no failed**: «no hay merge-base…: este caso NO ha comprobado nada» |
| `CHECK (unit_cost > 0)` borrado y `FORCE` → `CREATE POLICY` | R29 | no casa el patron del `ADD CONSTRAINT` |
| Columna `currency` añadida a `ProductBatch` | R29 | «ProductBatch gano o perdio columnas: cualquiera de las dos cosas necesita migracion (R29)» |

### El flake de saturacion, medido otra vez

Al cerrar esta tanda, `./init.sh --rapido` dio **un** rojo:
`tests/unit/inventario/product-page.test.tsx` :: «un guardado rechazado por un campo muestra el
error en linea y no cierra el panel», con expiracion en un `findByTestId` tras teclear 121
caracteres. Corrida completa: 143 s.

Se aplico el diagnostico barato que `docs/verification.md` prescribe —**correr el archivo solo**—:
**36/36 en verde, 82 s**. Es el flake de saturacion, no una regresion. `./init.sh --rapido`
repetido salio en verde entero. **El archivo NO esta en `tests/baseline-rojos.json`** (su entrada se
retiro en QC-58 al arreglar la causa), asi que esto queda como observacion y **no** se añade al
baseline: la nota del propio baseline advierte que crecer con cada feature es exactamente lo que no
debe pasar.

### Verificacion

`typecheck` verde sin ningun error. `lint` verde. `vitest run tests/unit/inventario` → 26 archivos /
**360 tests** (eran 307 al empezar la ficha). `test:guardias` → 26 / 263 + 4 skipped.
`./init.sh --rapido` → `== init OK ==`.

## Tanda 5 — camino completo y cierre (T13, T14)

### T13 — E2E (`e2e/inventario.spec.ts`)

**Un caso preexistente habia que arreglarlo, no duplicarlo.** «el Administrador entra, da de alta un
producto con una presentacion nueva y lo ve en la lista» —de QC-22— rellenaba nombre, existencia y
alerta y **ningun costo**; desde QC-90 R11 ese alta ya no puede pasar. Se le añade el **costo
unitario**, que es el camino que **no** deriva nada, para no duplicar el recorrido de R32.

Dos casos nuevos:
1. `el alta con presentacion y solo costo total deja el lote con el costo unitario derivado (QC-90
   R32, R7)` — `stock=7`, `totalCost=8000.05`, unitario **vacio** (con aserto explicito).
   `8000.05 / 7 = 1142.86428571…`: el quinto decimal es `8`, asi que el caso **distingue redondeo
   (`1142.8643`) de truncado (`1142.8642`)**. El importe se lee de vuelta con
   `SELECT b.unit_cost::text`, **nunca como `number`** ni por «el ultimo lote».
2. `elegir un producto que ya existe le agrega un lote y no crea otro producto (QC-90 R17, R18)` —
   dos altas por UI sobre el mismo producto, la segunda **eligiendolo del autocomplete** y con
   existencia y alerta distintas a proposito. Queda **un** producto vivo, su fila
   `{id,name,stock,qtyAlert}` identica, y **dos** lotes.

**La limpieza gana `product_batches`, y no es un detalle**: su FK a `products` es `RESTRICT`, asi
que los lotes se borran **antes** que los productos o el borrado revienta y deja basura en una base
compartida. El `afterAll` pasa de `try/finally` anidados —iban a ser seis niveles— a una lista de
pasos que corren todos y relanzan el primer fallo. Comprobado tras la corrida: cero filas `qc22_e2e_*`.

Trampa encontrada y documentada en el archivo: el nombre de presentacion tiene `.max(60)` y el
prefijo con `RUN_ID` ya gasta 54, asi que un sufijo `_repetido` hacia fallar el alta en linea con un
rojo que no hablaba de QC-90. Sufijos de una letra.

```
Running 8 tests using 6 workers
  ✓ [chromium] ... da de alta un producto con una presentacion nueva y lo ve en la lista (23.9s)
  ✓ [chromium] ... solo costo total deja el lote con el costo unitario derivado (QC-90 R32, R7) (24.1s)
  ✓ [webkit]   ... solo costo total deja el lote con el costo unitario derivado (QC-90 R32, R7) (29.3s)
  ✓ [chromium] ... elegir un producto que ya existe le agrega un lote y no crea otro producto (29.3s)
  ✓ [webkit]   ... da de alta un producto con una presentacion nueva y lo ve en la lista (29.6s)
  ✓ [webkit]   ... elegir un producto que ya existe le agrega un lote y no crea otro producto (13.1s)
  ✘ [chromium] ... un usuario que no es Administrador acaba fuera y no ve el catalogo (R4) (1.1m)
  ✘ [webkit]   ... un usuario que no es Administrador acaba fuera y no ve el catalogo (R4) (1.1m)
  2 failed
  6 passed (1.6m)
```

### El rojo E2E que NO es de QC-90, verificado y no tocado

`un usuario que no es Administrador acaba fuera y no ve el catalogo (R4)` es un caso de **QC-22** y
falla **tambien en aislamiento**, sin carga:

```
TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
  waiting for navigation until "load"
  navigated to "http://localhost:3117/inventario"
```

Causa comprobada en el codigo, no supuesta: `login-action.ts` manda al usuario al **primer item
visible de su menu** (`firstVisibleNavHref(filterNavItemsByPermissions(...))`), con `/dashboard`
solo de respaldo. El Operador tiene permiso de inventario, asi que aterriza en `/inventario` y el
`waitForURL(DASHBOARD_ROUTE)` del test no se cumple nunca. Y ya no lo echa nadie de ahi: **QC-75
retiro la regla ruta→rol** —`lib/modules/identity/domain/route-access.ts` lo dice literalmente: «Esta
funcion ya NO evalua ningun rol ni ningun permiso… se retiro entera (QC-75 R16)»— y el corte paso a
ser un 404 por `requirePagePermission` en cada pantalla.

O sea: **la premisa que ese caso afirma la derogo QC-75, que ya esta en `dev`.** Verificado ademas
que esta rama no toca `lib/modules/identity/**`, ni la navegacion, ni `route-access.ts`
(`git diff --name-only <merge-base>...HEAD`).

**No se arregla aqui, y el motivo no es pereza**: no es retocar un `await`. Hay que decidir **que
afirma ahora** ese caso —un 404 a quien no tenga `inventario.consultar`, con un usuario que no lo
tenga— y eso es decision de spec, no de implementacion. **Queda para el leader como ficha aparte.**

Lo que **si** conviene corregir de la lectura del subagente: `./init.sh` **no corre Playwright**
—no hay ninguna invocacion de `playwright` ni de `e2e` en el script—, asi que este rojo **no
enrojece el gate completo**. Es deuda visible solo al correr `pnpm run e2e` a mano.

### T14 — Gate completo

```
✓ regla max-2-por-zona respetada (in_progress=2)
✓ specs presentes para features sdd en vuelo
✓ worktrees bajo control (5 ademas del principal)
✓ .env cargado en el entorno del gate
✓ typecheck paso
✓ lint paso

 Test Files  302 passed (302)
      Tests  3866 passed | 18 skipped (3884)
   Duration  156.81s

aviso: 5 archivo(s) del baseline ya pasan; toca limpiarlos:
  tests/integration/inventario/product-crud.int.test.ts
  tests/unit/recetas-ui/recipe-route-contract.test.ts
  tests/unit/recetas/module-contract.test.ts
  tests/unit/unidades/modulo-intacto.test.ts
  tests/unit/unidades/unidades-convenciones.test.ts
✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 5); 5 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

`exit 0`. **Cero rojos**, no «cero rojos nuevos»: la suite entera pasa. Entre lo verde va la guardia
`package.json no gano dependencias respecto al merge-base con dev`, que es la que hace cumplir que
QC-90 no instalo nada — la derivacion del costo va con `BigInt` nativo, como decidio `design.md > 5`.

**El aviso de los 5 del baseline NO se atiende aqui, y es deliberado.** Los cinco pasan *en esta
rama* justo por lo que sus propios `motivo` explican: cuatro son guardias colgadas de un rango
`git` que **en `dev` no existe** y aqui si, y la quinta es el flake de saturacion de QC-83, que en
esta corrida no se disparo. Borrarlos desde una rama de feature pondria el gate de `dev` en rojo el
lunes siguiente. Es una decision del arnes, no de esta ficha: **queda anotado para el leader**.

## Mapa consolidado `R<n> -> test` (T14)

Los **32** requisitos tienen test. Rutas relativas a la raiz del worktree; los nombres entre «» son
los del caso.

| R | Test |
|---|---|
| R1 | `tests/unit/inventario/create-product.test.ts` :: «R1 — ningun camino escribe un producto sin lote» |
| R2 | `create-product.test.ts` :: «rechaza el alta sin presentacion (R2)» y «…con una presentacion que no es uuid (R2)»; `product-batch-input.test.ts` :: «rechaza la presentacion ausente o sin forma de uuid senalando presentationId» |
| R3 | `create-product.test.ts` :: «R3 — existencia cero > crea el lote igualmente, con stock 0»; `product-batch-input.test.ts` :: «acepta la existencia 0 mientras venga el costo unitario» |
| R4 | `unit-cost.test.ts` :: «no convierte ningun importe a numero de coma flotante en el codigo fuente»; `product-batch-input.test.ts` :: «acepta el importe con la forma de decimal(14,4) y rechaza cualquier otra»; `create-product.test.ts` :: «el caso de uso no convierte ningun importe a numero en su codigo fuente»; `product-actions.test.ts` :: «pasa los importes como cadena, con sus decimales intactos, y nunca como number (R4)» y «no convierte ningun importe a numero de coma flotante en el codigo fuente (R4)»; `product-page.test.tsx` :: «el alta rechaza en su campo un importe con mas de 4 decimales o escrito con coma» |
| R5 | `product-batch-input.test.ts` :: «rechaza el importe de todos ceros senalando el campo del importe recibido»; `create-product.test.ts` :: «rechaza el alta con un costo de cero (R5)»; `product-batch-write.int.test.ts` :: «el CHECK product_batches_unit_cost_positive rechaza el 0 con 23514»; `product-page.test.tsx` :: «el alta rechaza un costo de 0 en SU campo y no llama a la operacion» |
| R6 | `create-product.test.ts` :: «R6 — guarda el costo unitario recibido tal cual, con sus cuatro decimales» |
| R7 | `unit-cost.test.ts` :: «divide el costo total entre la existencia y devuelve el unitario con sus cuatro decimales», «redondea a cuatro decimales una division periodica», «redondea la mitad exacta hacia arriba»; `create-product.test.ts` :: «R7 — con solo el costo total, escribe el unitario DERIVADO»; `product-batch-write.int.test.ts` :: «guarda el derivado de total/existencia tal cual, sin perder decimales»; `e2e/inventario.spec.ts` :: el caso de R32 |
| R8 | `product-batch-input.test.ts` :: «rechaza el alta con solo costo total y existencia 0 senalando el campo de la existencia»; `create-product.test.ts` :: «rechaza solo-costo-total con existencia 0 (R8) y con un total insuficiente (R9)»; `product-page.test.tsx` :: «con solo costo total y existencia 0 el rechazo se pinta en el campo de la EXISTENCIA» |
| R9 | `unit-cost.test.ts` :: «devuelve null cuando el costo unitario derivado redondea a cero»; `product-batch-input.test.ts` :: «rechaza el alta con solo costo total cuyo unitario derivado redondea a cero, en totalCost»; `create-product.test.ts` :: idem R8 |
| R10 | `product-batch-input.test.ts` :: «acepta el alta con LOS DOS costos y no los compara entre si»; `create-product.test.ts` :: «R10 — con los dos costos, guarda el unitario e ignora el total sin rechazar» |
| R11 | `product-batch-input.test.ts` :: «rechaza el alta sin ninguno de los dos costos senalando LOS DOS campos»; `create-product.test.ts` :: «rechaza el alta sin ninguno de los dos costos (R11)» |
| R12 | `product-batch-input.test.ts` :: «acepta el lote y la fecha de expiracion cuando vienen, y tambien cuando vienen en nulo»; `create-product.test.ts` :: «R12 — los guarda en null cuando no vienen»; `product-batch-write.int.test.ts` :: «deja lot y expiry_date en NULL cuando no vienen»; `product-actions.test.ts` :: «hace llegar un campo del lote vacio como ausente, no como cadena vacia (R12)» |
| R13 | `product-batch-write.int.test.ts` :: «guarda la misma fecha civil que se escribio» (fecha `2026-01-01`: con zona negativa el corrimiento cambiaria el **año**, no solo el dia); `product-batch-input.test.ts` :: «rechaza la fecha de expiracion que no es una fecha civil YYYY-MM-DD»; `create-product.test.ts` :: «…y la fecha como texto civil (R13)» |
| R14 | `product-batch-input.test.ts` :: «recorta el lote y rechaza el que pasa de 60 caracteres una vez recortado»; `create-product.test.ts` :: «…con el lote recortado (R14)…» |
| R15 | `create-product.test.ts` :: «busca por el nombre ESCRITO y crea producto y lote en una sola operacion del puerto» |
| R16 | `create-product.test.ts` :: «escribe LA MISMA existencia en el producto y en el lote» |
| R17 | `create-product.test.ts` :: «R17 — le agrega el lote y NO crea otro producto»; `e2e/inventario.spec.ts` :: «elegir un producto que ya existe le agrega un lote y no crea otro producto (QC-90 R17, R18)» |
| R18 | `create-product.test.ts` :: «R18 — el candidato del producto NO viaja al puerto»; `product-batch-write.int.test.ts` :: «deja name, stock, qty_alert y updated_at del producto intactos»; `e2e/inventario.spec.ts` :: el mismo caso de R17 |
| R19 | `create-product.test.ts` :: «R19 — el nombre solo coincide con productos borrados > crea un producto nuevo»; `product-batch-write.int.test.ts` :: «devuelve null cuando todos los homonimos estan borrados logicamente» |
| R20 | `product-batch-write.int.test.ts` :: «elige el de creacion mas antigua y desempata por identificador ascendente»; `create-product.test.ts` :: «R20 — usa el identificador que el puerto devuelve, sea cual sea» |
| R21 | `product-batch-write.int.test.ts` :: «un fallo del lote no deja ningun producto escrito»; `create-product.test.ts` :: «…en una sola operacion del puerto» |
| R22 | `create-product.test.ts` :: «R22 — escribe el identificador del actor de la sesion en el lote» y «tambien por el camino del producto que ya existe»; `product-batch-write.int.test.ts` :: «escribe created_by y updated_by con el identificador del actor» |
| R23 | `create-product.test.ts` :: «R23 — rechaza a un actor %s sin una sola llamada al repositorio» (4 actores × 8 metodos) y «rechaza por permiso ANTES que por entrada invalida»; refuerzo en `authorization.test.ts`. **Es el test que `CHECKPOINTS.md > Permisos` exige: el permiso se valida en el SERVICE y se comprueba que el repositorio no recibe una sola llamada.** |
| R24 | `product-batch-input.test.ts` :: «rechaza un campo desconocido en vez de ignorarlo en silencio»; `create-product.test.ts` :: bloque «R24 — la entrada invalida se rechaza sin tocar el puerto» |
| R25 | `product-actions.test.ts` :: «hace llegar los cinco campos del lote al caso de uso, tal cual, como cadenas (R25)»; `product-page.test.tsx` :: «el alta hace viajar los CINCO campos del primer lote en el FormData» |
| R26 | `product-actions.test.ts` :: «la edicion no envia ningun campo de lote aunque el FormData los traiga (R26)»; `product-page.test.tsx` :: «la edicion no envia ningun campo del lote» y «la edicion no pide nada del lote: ni presentacion, ni costos, ni caducidad» |
| R27 | `product-page.test.tsx` :: «el alta rechaza un costo de 0 en SU campo y no llama a la operacion» y «con solo costo total y existencia 0 el rechazo se pinta en el campo de la EXISTENCIA» |
| R28 | `product-page.test.tsx` :: «un rechazo del servidor deja el panel abierto y conserva los cinco campos del lote» |
| R29 | `tests/unit/inventario/schema/inventario-schema.test.ts` :: «el rango de la rama no agrega ningun archivo bajo db/migrations/», «db/migrations/ no gana ninguna carpeta respecto del merge-base, incluido lo no commiteado», «ProductBatch conserva las columnas que le dio 20260909120000_product_batches», «la migracion de product_batches conserva sus dos CHECK y su RLS ENABLE+FORCE sin policies» |
| R30 | `tests/unit/inventario/module-contract.test.ts` :: «ningun export del contrato denota listar, editar ni borrar lotes» (+ ancla anti-vacuidad «el barrel se pudo cargar y publica exports de valor») |
| R31 | `module-contract.test.ts` :: «ProductView sigue sin declarar presentacion» y «la opcion del autocomplete de nombre llega sin presentationId poblado desde el listado» |
| R32 | `e2e/inventario.spec.ts` :: «el alta con presentacion y solo costo total deja el lote con el costo unitario derivado (QC-90 R32, R7)», en **Chromium y WebKit** |

**Ningun requisito queda huerfano.**

## Lo que queda abierto, y no lo cierra esta ficha

1. **Las tres preguntas abiertas del `requirements.md` siguen abiertas**, tal como las dejo el spec:
   la **moneda del costo** (la cierra la primera ficha de aislamiento por empresa), la
   **trazabilidad por lote a medias** —esta ficha *guarda* lote y vencimiento, pero **nada los
   consume**: no hay pantalla que los liste, ni consumo que elija de que lote sale lo que se
   despacha, ni aviso por vencimiento— y **que pasa con un lote cuyo producto se borra**.
2. **La carrera en el alta de un nombre nuevo** (`design.md > 11`): entre `findAliveIdByName` y el
   `INSERT` no hay candado, asi que dos altas simultaneas del mismo nombre nuevo crean dos
   productos. Es el comportamiento de **hoy** —`products.name` no es unico— y cerrarlo pide un
   indice unico, o sea migracion, o sea **QC-81**.
3. **El aislamiento por empresa no entra** y es deuda registrada: `products` y `product_batches` no
   tienen `company_id`, y saldarlo es **QC-49**. Esta ficha no añade tabla nueva, asi que la
   exigencia de `CHECKPOINTS.md` («toda tabla de operacion nueva lleva su columna de empresa») no
   se dispara, y no se puede filtrar por una columna que no existe.
4. **El rojo E2E de QC-22** descrito arriba: la premisa la derogo QC-75 y decidir que afirma ahora
   ese caso es trabajo de spec. No enrojece `./init.sh`.
5. **El aviso de los 5 archivos del baseline** que ya pasan en esta rama: limpiarlos desde aqui
   pondria el gate de `dev` en rojo. Decision del arnes, no de la ficha.

## Ronda de correcciones tras el rechazo del reviewer (2026-09-10)

`progress/review_QC-90-alta-del-primer-lote.md` rechazo la ficha por **un** hallazgo mayor. Lo que
el reviewer dio por bueno no se toco: coma flotante, el 0 rechazado en el cliente, el permiso antes
de zod, la atomicidad y el producto existente intacto.

### M1 (bloqueante) — el objetivo tactil de 24x24 px

El disparador de ayuda que **T0** metio en `components/shared/presentation-select.tsx` llevaba
`size-6` —24x24 px— cuando `docs/architecture.md > Componentes > Regla: multiplataforma` exige
**44x44**, y el `design.md` no declaraba excepcion. El propio archivo ya definia la constante
correcta, `TOUCH_TARGET = 'min-h-11 min-w-11'`, trescientas lineas mas arriba.

**Decision del humano: se cumple la regla, no se declara excepcion, y se agrandan LOS DOS.** El
atenuante que el reviewer señalo —el bloque replica literalmente el de `ProductField`, que ya esta
en `dev` y que la regla de alcance eximiria por ser anterior— es justo el motivo de subir tambien
ese: los dos iconos de ayuda viven en el **mismo panel** y dejarlos con tamaños distintos seria peor
que el problema que se venia a arreglar.

- `components/shared/presentation-select.tsx` y
  `app/(private)/inventario/components/product-field.tsx`: fuera `size-6`, entra la constante
  `TOUCH_TARGET` de cada archivo mas `shrink-0`. **El area pulsable mide 44x44 de verdad**, sin
  margenes negativos ni overflow que la maquillen —la via del margen negativo se descarto porque el
  boton invadia por arriba el `Input` de abajo—. El icono dibujado sigue en `size-4`; lo que crece
  es el blanco de toque. La etiqueta no se descoloca: el boton conserva
  `flex items-center justify-center` y el padre es `items-center` con `gap-1.5`.
- **Los dos llevan caso de test del tamaño**, con el patron de
  `tests/unit/shared/data-table-header-menu.test.tsx` (`toHaveClass('min-h-11')` /
  `toHaveClass('min-w-11')`): el de `PresentationSelect` en
  `tests/unit/shared/presentation-select-helper.test.tsx` (sus 3 casos intactos) y el de
  `ProductField` en **`tests/unit/inventario/product-field.test.tsx` (nuevo)**. Va en archivo propio
  y no en `product-page.test.tsx` porque lo que se afirma es una propiedad **del componente**, no de
  la pantalla: alli cada caso monta la pantalla entera, abre el panel y espera al formulario —es el
  archivo de los 36 casos y el que `docs/verification.md` señala por saturacion—, asi que dos
  `expect` costarian segundos. Montado solo tarda milisegundos.
- **Comprobado que muerden**: devolviendo los dos disparadores a `size-6` caen los dos casos con
  `expect(element).toHaveClass("min-h-11")`. Restaurado con `cp`, nunca con `git checkout`.

### m2 — `design.md > 8` afirmaba lo contrario de lo que pasaba

El parrafo de multiplataforma decia «no entra ningun control nuevo … no hay excepcion de escritorio
que declarar». Era cierto cuando se escribio y **dejo de serlo con T0**. Reescrito: dice lo que de
verdad entro, que se cumple la regla en vez de declarar excepcion, y deja anotada la leccion —**una
task añadida fuera del plan no pasa por la revision que si pasaron las del plan**, porque el parrafo
que la habria cazado ya estaba dado por bueno—.

### m3 — el caso de R19 era indistinguible del camino por defecto

Se elige la salida **(b)** del reviewer, y el motivo es de fondo: **(a) no es honestamente posible
en un test de dominio con dobles**. El caso de uso llama `findAliveIdByName(name)` y decide sobre un
`string | null`; el `deleted_at IS NULL` vive **entero en el adaptador** (R15), asi que «el unico
homonimo esta borrado» y «no hay homonimo» **son el mismo valor devuelto**. Un doble que respondiera
distinto segun el nombre estaria reescribiendo dentro del test la semantica del adaptador: afirmaria
la premisa en vez de medirla.

Asi que el caso **dice ahora lo que de verdad mide** —«R19 — sin id del puerto, el alta crea
producto nuevo»— y lleva un comentario que declara explicitamente que **no es el test principal de
R19** y remite por ruta y por nombre al que si lo es:
`tests/integration/inventario/product-batch-write.int.test.ts` :: «devuelve null cuando todos los
homonimos estan borrados logicamente», contra Postgres y con el homonimo sembrado y borrado a
proposito. Ninguna asercion cambio.

### m4 — punto y coma en `module-contract.test.ts`

Alineado con el estilo del directorio. **Solo estilo**: ni una asercion, ni un nombre de caso, ni un
comentario. R29, R30 y R31 siguen midiendo exactamente lo mismo.

### m1 — la implementacion se commitea

Era el hallazgo mas barato de arreglar y el mas caro de ignorar: en un worktree cuya pila de stash
es **compartida**, 24 archivos sueltos estan a un `git checkout` ajeno de desaparecer. Commiteado en
`feature/QC-90-alta-del-primer-lote`, en seis commits por **motivo** y no por archivo.

**`feature_list.json` se queda fuera a proposito.** Su cambio —las fichas QC-90, QC-91 y QC-92— es
del **leader**, no de la implementacion: entro al importar el board y estaba ya sin commitear cuando
recibi la rama. Commitearlo en la rama de la feature seria firmar trabajo ajeno. **Queda anotado
para el leader**, que es quien tiene que decidir si va aqui o a `dev`.

### Gate de la ronda de correcciones

`./init.sh` completo, **exit 0**:

```
✓ typecheck paso
✓ lint paso

 Test Files  303 passed (303)
      Tests  3869 passed | 18 skipped (3887)
   Duration  168.01s

✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 5); 5 por limpiar
✓ todas las migraciones tienen down.sql
== init OK ==
```

Un archivo y tres tests mas que en el gate anterior (302 / 3866): el archivo nuevo de `ProductField`
y los dos casos de objetivo tactil, mas el caso de R19 renombrado. Cero rojos.
