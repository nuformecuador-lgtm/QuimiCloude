# QC-123 — el-total-del-pedido-decidir-donde-vive-el-precio · review

> Revisor: `reviewer`. Fecha 2026-09-18. Rama `feature/QC-123-...`, tip `80d18e37`.
> Worktree `.worktrees/QC-123-el-total-del-pedido-decidir-donde-vive-el-precio`.
> Diff revisado: `git diff origin/dev...HEAD` (tres puntos; el de dos puntos arrastra QC-109/QC-129,
> que ya estan en `dev` y NO son de esta ficha: 69 archivos reales, no 90).

## Veredicto

**RECHAZADO**, por **dos comentarios de produccion que citan ficha/requisito** en lineas que la
rama escribe (`docs/conventions.md > Comentarios`: «Sin excepciones»; «Quien lo verifica: el
reviewer, como bloqueante»).

Dicho sin ambiguedad: **el fondo de la feature esta bien**. Los 26 requisitos tienen test y los
cuerpos prueban lo que dicen; las decisiones cerradas se respetan una por una; el gate rapido sale
verde sobre el tip; no entra ninguna dependencia. Lo que falla son dos lineas de comentario y el
cierre formal de T11. Es una vuelta corta, no un rediseno.

## Checklist

### Especificacion
- [x] `requirements.md` con `R1`-`R26` en EARS, cada uno citando su `[D<n>]`.
- [x] `design.md` con seis alternativas descartadas y su porque (`> 8`).
- [ ] `tasks.md` con **todas** las tasks `[x]`: **T11 sigue sin marcar** (`tasks.md:157`).
      Ver menor 1.

### Trazabilidad
- [x] Los 26 `R<n>` mapean a un test que **existe**, se **llama** como dice el mapa y cuyo
      **cuerpo prueba el requisito**. Verificados uno a uno leyendo el cuerpo, no el nombre:
  - R1 `tests/unit/pedidos/order-view.test.ts:136` (cuatro nombres de precio declarados ausentes
    por tipo) + `tests/unit/pedidos/order-cost.test.ts:57`.
  - R2 `order-cost.test.ts:71`: 10 x 200 = 2.000, el ejemplo literal de `[D2]`.
  - R3 `order-cost.test.ts:84` y `:101` (el lote nuevo y carisimo NO se toca porque el primero ya
    cubre) + `tests/unit/inventario/product-catalog-costing.test.ts:68` (`stock: { gt: 0 }`).
  - R4 `order-cost.test.ts:118`: el array llega en orden inverso al de compra y aun asi gana el
    mas antiguo; `CostingBatch` ni siquiera declara vencimiento.
  - R5 `order-cost.test.ts:138`: 55 (simple), y el test **nombra** el 19 ponderado que no debe
    salir.
  - R6 `order-cost.test.ts:155`: 2 kg -> 2.000 g y 5/kg -> 0,005/g.
  - R7 `:169`; R8 `:181`, `:193`, `:205`, `:211` + `order-ingredients-cost.int.test.ts:388`;
    R9 `:234`.
  - R10 `tests/unit/pedidos/create-order.test.ts:273` (argumento 4 del puerto = `'60.0000'`) +
    `int:301`.
  - R11 `tests/unit/pedidos/update-order.test.ts:286` + `int:323` (recalcula a otro numero Y a
    `NULL`).
  - R12 `tests/unit/pedidos/list-orders.test.ts:620` (por tipo **y** con un Proxy que explota si
    algo LEE `products`/`units`) + `int:357`.
  - R13 `tests/unit/pedidos/schema/orders-ingredients-cost-migration.test.ts:99`, con tres
    mutaciones de sensibilidad (`NOT NULL`, `UPDATE` de relleno, `DEFAULT 0`) + `int:388`.
  - R14 `tests/unit/pedidos/order-service.test.ts:321` (ficha Y listado) + `int:446`.
  - R15 `tests/unit/asignaciones/list-assigned-orders.test.ts:374` (lista CERRADA de claves),
    `get-assigned-order-execution.test.ts:276` (`@ts-expect-error` sobre el tipo + forma completa
    de la vista), `tests/unit/identity/permissions.test.ts:193` (quince, Operador en dos).
  - R16 `tests/unit/pedidos/schema/pedidos-schema.test.ts:680`.
  - R17 `list-orders.test.ts:654`: poda **y** anotacion en el log, para `sort` y para filtro.
  - R18 `tests/unit/pedidos-ui/order-columns.test.tsx:322`: lista blanca + valor delator que no
    aparece en ninguna celda pintable sin contexto.
  - R19 `order-cost.test.ts:265`; R20 `pedidos-schema.test.ts:660` +
    `orders-ingredients-cost-migration.test.ts:131`.
  - R21 `int:427` (control positivo con el ambito propio, vacio con el ajeno y el MISMO id) +
    `int:446`.
  - R22 `int:470` (foto serializada de `product_batches` e `inventory_movements` antes del alta y
    despues de alta y edicion) + `product-catalog-costing.test.ts:89`.
  - R23 `create-order.test.ts:320` y `update-order.test.ts:353`, con dobles `explota(...)` en los
    cuatro puertos: si alguno se llamara, el `rejects.toBeInstanceOf(UnauthorizedError)` caeria.
  - R24 `order-cost.test.ts:280` + `create-order.test.ts:340` (el alta se completa y el puerto
    recibe `null`) + `int:504` (fila creada, `ingredients_cost` NULL, sin 22003).
  - R25 `order-cost.test.ts:293` ('9' antes que '10') y `:310` ('A10' antes que 'A9').
  - R26 `order-cost.test.ts:327` (20.000/bidon de 20 L = 1.000/L) y `:341` (promedio 1,5 y no el
    330,0000 del promedio en bruto).
- [x] **Busqueda propia de mas desalineaciones rotulo/cuerpo**, el defecto que esta ficha ya
      demostro tener y que `80d18e37` corrigio en R9: repasado el mapa entero. Queda **una**, y
      es menor (menor 2).
- [x] `progress/impl_QC-123.md` trae el mapa `R<n> -> test` con los nombres reales.

### Calidad de codigo
- [x] `./init.sh --rapido` **corrido por mi** sobre el tip `80d18e37`: typecheck verde, lint verde,
      `203/203` archivos y `3100` tests pasados (6 skipped), `47/47` guardias verdes (588 tests).
      **No se reprodujo el flake de `tests/unit/configuracion-ui/user-table.test.tsx`.**
- [x] El `./init.sh` completo antes del PR queda declarado para el leader.
- [ ] E2E para flujo con importes (`CHECKPOINTS.md:19-20`): **no hay**. Cubierto por la decision
      cerrada `[D15]`, tomada por el humano antes del codigo, con motivo escrito (esta ficha no
      tiene pantalla) y ficha destino QC-122, mismo criterio que QC-68. **No lo cuento como
      hallazgo.**
- [x] Multiplataforma: **no aplica**, la ficha no anade ni toca ningun componente. El unico archivo
      de UI del diff es un test, y lo que prueba es que NO se pinta.
- [x] **Ninguna dependencia nueva**: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` no
      aparecen en `git diff --name-only origin/dev...HEAD`. `design.md > 2.1` explica por que la
      aritmetica va a mano con `BigInt` y no con `Prisma.Decimal` (`domain/` no puede importar
      `@prisma/client`), que es justo lo que pide `docs/architecture.md > Anti-patrones`.

### Datos y seguridad
- [x] **No nace tabla**: una columna opcional en `orders`, que ya tiene `company_id`, RLS y borrado
      logico. `guard-empresa-en-esquema.test.ts` no cambia y sigue verde.
- [x] Aislamiento por empresa en la consulta nueva: `findAliveBatchesWithStock` compone
      `batchCompanyScope(scope)` en un `AND` aparte, y el rechazo cruzado tiene test real
      (`int:427`, con control positivo).
- [x] Permiso validado en el service y con test: `pedidos.modificar` antes de cualquier lectura
      (R23); `pedidos.consultar` para leerlo (R14).
- [x] Migracion versionada con su `down.sql`; el gate confirma «todas las migraciones tienen
      down.sql». El DOWN destructivo esta declarado en `design.md > 3`.
- [x] Sin secretos, sin webhooks, sin cliente de Supabase.

### Modulos hexagonales
- [x] **No nace puerto `pedidos -> inventario`**: `inventario` amplia su `ProductCatalog` ya
      publicado, lo implementa su adaptador driven y lo cablea `lib/composition`. Es la via que
      `recetas` y `asignaciones` ya usan.
- [x] **Sin rutas profundas**: los imports de `pedidos` a otros modulos van todos al barrel
      (`@/lib/modules/inventario`, `/recetas`, `/unidades`). El unico import profundo es el de
      `lib/composition`, que es su trabajo y ya lo hacia para `findProductRefs`.
- [x] `guard-arquitectura-modulos` y las otras 46 guardias, verdes.
- [x] La logica de negocio vive en `domain/order-cost.ts`, no en la Server Action.

### Comentarios (`docs/conventions.md > Comentarios`)
- [ ] **Dos citas de ficha/requisito en lineas que la rama escribe.** Ver bloqueantes.
- [x] El resto del diff SI aplica la regla, y se nota: `order-view.ts` **borro** una cita (`R47`,
      `design.md > 13`) y la sustituyo por texto sin cita, y el bloque de `pedidos` de
      `lib/composition/index.ts` se reescribio sin citar QC-35bis. Por eso las dos que quedan son
      un descuido, no un criterio distinto.

---

## Hallazgos

### BLOQUEANTE 1 - comentario de produccion que cita una ficha, en linea nueva

`lib/modules/pedidos/domain/update-order.ts:14-15`

    /** Recupera `products` y `units`, que la edicion necesita para recalcular el importe en cada
     *  escritura (QC-35bis, 2026-09-07, se los habia quitado al salir la unidad del pedido). */

La rama **reescribe ese docblock entero** (antes decia otra cosa), asi que son lineas suyas, y el
texto nuevo cita `QC-35bis`. `docs/conventions.md > Comentarios`: «Nunca se cita una ficha ni un
requisito en un comentario de produccion: ni `QC-<n>`, ni `R<n>`, ni `design.md`, ni "decision
cerrada". **Sin excepciones**». El porque es legitimo y merece quedarse; lo que sobra es el
identificador.

### BLOQUEANTE 2 - comentario de produccion que cita un requisito, en linea modificada

`lib/modules/pedidos/ports/order-repository.ts:101`

    /** Edicion como REEMPLAZO COMPLETO (R20). No puede escribir `CANCELADO` ni motivo.

La cita `R20` es preexistente, pero la rama **toca esa linea** al extender el bloque con el parrafo
de `ingredientsCost`, y la regla dice «al tocar un archivo se limpian los comentarios de **las
lineas que toca la rama**». Se arrastro en vez de limpiarse.

**Alcance de los dos.** No pido limpiar el archivo entero ni los comentarios preexistentes que el
diff no toca (eso es limpieza por modulo, en fichas del board): solo estas dos lineas. Si la
limpieza abultara, iria en su propio commit `chore(QC-123): limpia comentarios de <archivo>`,
separada del cambio de codigo.

---

### menor 1 - `T11` sin marcar en `tasks.md`

`tasks.md:157`: `## T11 - Cierre` es la unica sin `[x]`, y `CHECKPOINTS.md:9` exige que **todas** lo
esten. Es coherente con la bitacora («T11 queda al leader: el `./init.sh` completo y el PR no son
mios»), asi que no es trabajo perdido: se marca cuando el leader cierre con el gate completo. Queda
escrito para que la ficha no se cierre con la casilla en blanco.

### menor 2 - el caso de R9 dice «los cinco casos» y prueba otros cinco

`tests/unit/pedidos/order-cost.test.ts:234`. Los cinco de `R8`/`R9` son: existencia insuficiente,
unidad no convertible, receta sin ingredientes, **pedido anterior a la columna** y desbordamiento.
El caso ejercita los cuatro primeros **menos** «anterior a la columna», y mete en su lugar «producto
sin lotes», que no es un caso de la lista sino una variante del primero. No es un agujero real
(«anterior a la columna» no es alcanzable desde el dominio puro y lo cubre `int:388`), pero es
exactamente la desalineacion rotulo/cuerpo que esta ficha ya demostro tener.
Mismo desliz en la docstring de `lib/modules/pedidos/domain/order-cost.ts:186-187`: anuncia «los
cinco casos» y enumera **cuatro**.

### menor 3 - `INTERNAL_SCALE` duplica `CONVERSION_SCALE` y nada avisa si divergen

`lib/modules/pedidos/domain/order-cost.ts:28` declara `INTERNAL_SCALE = 12`; el valor vive en
`lib/modules/unidades/domain/convert-quantity.ts:34` (`CONVERSION_SCALE = 12`), que el barrel
`lib/modules/unidades/index.ts` **no exporta** (solo lo menciona en un comentario, `:54`).

Juicio, que es lo que se me pide: **si, puede romperse en silencio, y el codigo NO lo advierte.** No
hay enlace de tipos, no hay test que compare las dos constantes, y el comentario de
`order-cost.ts:23-27` (que afirma que son la misma) es justo el tipo de motivo que deja de ser
cierto sin que nada se ponga rojo. Lo acoto tambien, para no exagerarlo: el dano seria **perdida
silenciosa de precision**, no un numero disparatado (si `CONVERSION_SCALE` subiera, `toInternal`
truncaria la salida de `convertQuantity` a 12 decimales), y el redondeo final a 4 decimales se lo
come en la practica totalidad de los casos. Por eso es **menor** y no bloqueante. La ficha que
exporte la constante por el barrel y anada el test de igualdad es la salida correcta.

### menor 4 - el motivo del importe en blanco no va a ningun log

Confirmado: `calculateIngredientsCost` devuelve `null` por cinco caminos y ninguno deja rastro.
**No incumple ningun `R<n>`**: R9 solo exige que la salida sea indistinguible (y lo es), y ningun
requisito ordena registrar el motivo. `design.md > 4` punto 4 lo da como opcional («el motivo **si
puede** ir al registro del servidor»). Lo unico que chirria es `design.md > 10.1`, que lo escribe en
indicativo («el diagnostico **va** al registro del servidor»): el diseno promete algo mas de lo que
el codigo hace. Se arregla con una linea de diseno o una ficha de seguimiento, no aqui.

### menor 5 - el test de R22 en unidad es debil

`tests/unit/inventario/product-catalog-costing.test.ts:89` comprueba R22 pasando un regex de nombres
sobre un objeto construido a mano en el propio test: si manana naciera una escritura y nadie la
anadiera a ese objeto, el caso seguiria verde. El archivo lo declara con honestidad en su cabecera
y la garantia real la da `int:470`. No pido cambiarlo; lo anoto para que nadie lo lea como la
prueba de R22.

---

## Las cuatro cosas que se me pidio mirar con lupa

**1. Las dos guardias cerradas sin cambiar su criterio (`959a54f7`, `aff9e441`).**
`guard-ambito-empresa-inventario`: **respeta la guardia, no la esquiva**, y no es opinion mia sino
el texto de la propia guardia, que admite explicitamente el camino usado: exige que el `scope`
«llega hasta una de las envolturas del punto unico (`./company-scope`), **directamente o a traves de
un ayudante del mismo archivo al que se le pasa**». Ademas el patron es **preexistente y del mismo
archivo**: `findProductRefs` ya publica `companyId: string` y delega en
`findAliveProducts(ids, scope: InventoryScope)` desde QC-50; `findCostingBatches` hace exactamente
lo mismo con `findAliveBatchesWithStock`. La funcion que toca `prisma.` declara `InventoryScope` y
compone `batchCompanyScope`. Cambiar la firma publica a `InventoryScope` habria contradicho
`design.md > 1.1` y metido un tipo de `inventario` en la firma que consume `pedidos`. Correcto.
Los dos censos (`tests/guards/guard-identificador-de-request.test.ts:222-225` y
`tests/integration/aislamiento.json:159-163`) piden por escrito que los actualice la ficha que trae
la migracion o el test sin transaccion, y se actualizaron con su motivo redactado, no con un
comodin. Correcto.

**2. `CONVERSION_SCALE` duplicada.** Juicio en menor 3: **si puede romperse en silencio y el codigo
no lo advierte**; el dano acotado es perdida de precision por debajo del redondeo final.

**3. El motivo sin log.** No incumple ningun `R<n>` (menor 4). Lo que hay que corregir es la frase
de `design.md > 10.1`, no el codigo.

**4. `pedidos` recupera `unidades`, pero NO la unidad del pedido.** Verificado en el diff:
- `db/schema.prisma`: la unica linea que gana `Order` es `ingredientsCost`. Ninguna columna de
  unidad vuelve.
- `NewOrder` no declara unidad (ni el importe); `order-input.ts` no anade ningun campo de unidad al
  esquema de alta ni al de edicion.
- `OrderRow` y `OrderView` ganan **solo** `ingredientsCost`, no `unitId` ni `unitName`.
- Lo que vuelve es la **dependencia** `units: UnitCatalog` en `CreateOrderDeps` y `UpdateOrderDeps`
  y `convertQuantity` importado por el barrel en `order-cost.ts`: consecuencia directa de `[D6]`,
  aprobada por el humano y escrita en `design.md > 5.3`.

## Detalles del calculo verificados a mano (no son hallazgos)

- **La guarda de desbordamiento esta en el dominio, antes de escribir**
  (`order-cost.ts:208-211`), y `MAX_OUTPUT_UNSCALED = 10^14 - 1` es exactamente el maximo de
  `Decimal(14,4)`. **Busque un `catch` del `22003` en el adaptador y NO existe**:
  `order-prisma.ts` no menciona `22003` por ninguna parte. Es lo que `[D17]` y `design.md > 10.1`
  exigen.
- **El pedido se crea igual aunque el importe no quepa**: probado en unidad
  (`create-order.test.ts:340`) y contra la base (`int:504`).
- **Nunca 0 ni parcial**: `calculateIngredientsCost` devuelve `null` en cuanto **una** linea falla
  (`:202-204`) y no entrega lo acumulado. Las dos entradas validan `quantity` mayor que cero
  (`order-input.ts:42-47`, `recetas/domain/recipe-input.ts:18-23`), asi que el `return ZERO` de
  `calculateLineCost:133` (linea de cantidad cero) no es alcanzable por los casos de uso.
- **Desempate de lote**: `compareLots` compara como `BigInt` solo si **ambos** son solo digitos, y
  como texto si no. Es `[D18]` literal.
- **Se convierte la cantidad Y el coste unitario**: `:154-155` convierte la existencia a la unidad
  de la linea y calcula el factor inverso para el coste; el promedio se hace sobre costes ya
  normalizados (`:171`, `:182`). Es `[D19]` literal, con su test de contraste.
- **Se recalcula en cada edicion y no al leer**: el recalculo va en `update-order.ts:81-90`,
  despues de `requirePermission`, del zod, del `findAliveById`, de `assertTransition` y del chequeo
  de receta. `GetOrderDeps` y `ListOrdersDeps` **no declaran** `products` ni `units`, y el test lo
  vigila por tipo y por Proxy.
- **Solo se LEEN lotes**: el contrato nuevo no tiene metodo de escritura, y `int:470` compara
  `product_batches` e `inventory_movements` serializados y ordenados por id, antes del alta y
  despues de alta y edicion. **Si afirma lo que dice que afirma.**

## Para levantar el rechazo

1. Quitar la cita `QC-35bis` de `lib/modules/pedidos/domain/update-order.ts:14-15`, conservando el
   porque.
2. Quitar la cita `R20` de `lib/modules/pedidos/ports/order-repository.ts:101`.
3. (Recomendado, menor 2) Alinear el rotulo de `order-cost.test.ts:234` y la docstring de
   `order-cost.ts:186-187` con los cinco casos reales, o decir que el quinto vive en integracion.
4. `./init.sh --rapido` verde, y marcar `T11 [x]` cuando el leader cierre con el gate completo.

Nada de esto toca el diseno, la trazabilidad ni la aritmetica. Con 1 y 2 hechos, el veredicto es
**OK**.
