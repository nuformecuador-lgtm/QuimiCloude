# QC-52 — separar-producto-de-catalogo-de-proveedor · revisión (F3)

> Reviewer. Worktree `.worktrees/QC-52-separar-producto-de-catalogo-de-proveedor`,
> rama `feature/QC-52-separar-producto-de-catalogo-de-proveedor`, base `QuimiCloude_QC52`.
> Fecha: **2026-09-04**. Commits revisados: `5a22663`, `624ced1`, `14457c9`.
>
> No se editó ni una línea de código. Todo lo de abajo es verificación ejecutada o lectura
> del diff `origin/dev...HEAD`.

## Veredicto

**OK.** 0 hallazgos mayores, 6 menores. Trazabilidad R1–R34 **completa y comprobada uno a
uno**: los 34 tienen test, los tests existen con el nombre que dice la bitácora, y los que
se leyeron a fondo afirman de verdad lo que promete el requisito.

---

## 1. Checklist de `CHECKPOINTS.md`

### Especificación
- [x] `requirements.md` con R1–R34 en EARS, más Alcance, 16 decisiones cerradas y P4/P5/P6
      cerradas por el humano en F1.4.
- [x] `design.md` con `## 10. Alternativas descartadas`.
- [x] `tasks.md` T0–T19 todas marcadas. **T13 dice `[x, CON SALVEDAD]`**, no `[x]` a secas
      (menor 3).

### Trazabilidad
- [x] Cada `R<n>` mapea a al menos un test concreto. Verificado **contra el disco**, no
      contra la bitácora: se buscaron las 33 cadenas distintivas de nombres de test del mapa
      y **todas** aparecen en un archivo real de `tests/`. Cero ausencias.
- [x] `progress/impl_QC-52-...md` contiene el mapa de requisito a test.

### Calidad de código
- [x] `typecheck` y `lint`: verdes en el gate completo del leader.
- [x] Tests: re-corrido por el reviewer `tests/unit/{inventario,proveedores}` +
      `tests/integration/{inventario,proveedores}` → **36 archivos / 433 tests verdes**.
      Guardias: **12 archivos / 123 tests verdes**.
- [x] Flujo crítico (permisos) con E2E: `e2e/inventario.spec.ts` cubre el camino del
      Administrador y el rechazo del que no lo es, verde en Chromium y WebKit según bitácora.
- [x] Multiplataforma: la feature toca UI (`product-form.tsx`, `product-columns.ts`) pero
      **solo por sustracción**. Grep sobre las líneas AÑADIDAS del diff de `app/`: cero
      `100vh`, cero `:hover`, cero alturas fijas, cero `font-size` bajo 16px, ninguna
      librería nueva. No hace falta excepción en `design.md`.
- [x] Dependencias: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` **sin un solo
      cambio** en `origin/dev...HEAD` (R34). Nada que declarar.

### Datos y seguridad
- [x] **Autorización en el SERVICE, las nueve operaciones, con test.** `requireAdmin(actor)`
      es la primera línea de los 5 casos de uso del producto y de los 4 de la línea
      (comprobado archivo por archivo). `tests/unit/proveedores/authorization.test.ts` barre
      los nueve con **entrada válida** (para que no sea un error de validación el que tape la
      falta de permiso), con **dobles que explotan si alguien los llama**, y contra siete
      actores no autorizados incluidos «rol que contiene el autorizado» y «otra caja». Además
      un caso deriva la lista de casos de uso de `readdirSync(domain/)`: si aparece un décimo
      sin cubrir, el test cae. `tests/unit/inventario/authorization.test.ts` hace lo propio
      con las cinco del producto.
- [x] **RLS habilitada y forzada**, comprobado **contra la base**, no contra el SQL:
      `products` y `supplier_catalog_lines` con `relrowsecurity=true` y
      `relforcerowsecurity=true`. La migración no contiene ninguna sentencia de RLS.
- [x] Acceso a datos solo por Prisma. En `lib/modules/proveedores/**` los únicos modelos
      tocados son `prisma.supplier` y `prisma.supplierCatalogLine`.
- [x] Migración versionada y reversible, con `down.sql`. Apply/rollback/re-apply ejecutados
      por el implementer con censo comparado; el reviewer verificó el estado final de la base.
- [x] Sin secretos hardcodeados. Sin webhooks.

### Módulos hexagonales
- [x] `domain/` y `ports/` puros; cableado solo en `lib/composition`; barrel sin `use server`.
      Guardias verdes.
- [x] Marca de módulo en los dos modelos tocados; ningún módulo consulta modelo ajeno.

### Permisos y configuración
- [x] Server Actions para mutaciones, ningún route handler nuevo (`scope.test.ts` lo afirma).
- [x] Nada dependiente de entorno hardcodeado.

---

## 2. Los tres puntos con lupa que pidió el leader

### 2.1 La migración `20260904123854_split_product_and_supplier_catalog`

**(a) El `down.sql` revierte al esquema exacto anterior — CORRECTO.** Comparado línea a línea
contra las migraciones originales:

- `products.cost DECIMAL(14,4)` anulable, `min_purchase INTEGER NOT NULL DEFAULT 0` **no
  anulable**, `delivery_time INTEGER` anulable: idénticos a
  `20260902005510_products_and_presentations` (líneas 31-33).
- Los dos CHECK (`products_cost_non_negative`, `products_min_purchase_non_negative`) se
  **recrean a mano** con su definición literal, porque el `DROP COLUMN` del up se los llevó y
  el `ADD COLUMN` no los devuelve. A `delivery_time` **no** se le inventa un CHECK, que es lo
  correcto (QC-14 decisión 7).
- `product_id UUID NOT NULL` con su FK `RESTRICT` / `CASCADE`, su índice de lado hijo y su
  índice único **TOTAL** (no parcial). Correcto: en QC-42 la línea no tenía `deleted_at`.
- Dos guardas `RAISE EXCEPTION` (imagen escrita, tabla no vacía) que paran en vez de destruir
  en silencio. La cabecera declara honestamente lo que el down **no** puede: los valores de
  las tres columnas no vuelven, y `product_id` es irreconstruible por diseño de la ficha.

**(b) No borra lo que no debe — CORRECTO, comprobado contra la base.** Censo de
`pg_constraint` sobre `products` tras la migración: `products_created_by_fkey`,
`products_updated_by_fkey`, `products_presentation_id_fkey`, **`products_unit_id_fkey`**,
`products_stock_non_negative`, `products_qty_alert_non_negative`, `products_pkey`. Los diez
`DROP CONSTRAINT` de más de QC-43 no se repitieron: aquí Prisma propuso **quince** y las
quince están fuera del SQL. El único `DROP CONSTRAINT` del archivo es
`supplier_catalog_lines_product_id_fkey`, legítimo. Las dos FK de auditoría de
`supplier_catalog_lines` hacia `users` siguen en pie.

**(c) La unicidad de la línea — CORRECTA y con el patrón de QC-42/QC-20.** En la base:
`CREATE UNIQUE INDEX supplier_catalog_lines_name_presentation_unique ON
public.supplier_catalog_lines USING btree (supplier_id, name_normalized, presentation_id)
WHERE (deleted_at IS NULL)`. Parcial, sobre nombre normalizado más presentación, por
proveedor. El orden con `supplier_id` primero es deliberado y está razonado en el SQL. No hay
`SELECT` previo de comprobación: la garantía es solo del índice, como pide R15.

**(d) RLS — CORRECTA.** Ver el checklist. La migración no la menciona.

**Nada que objetar en la parte cara.** El SQL está auditado, comentado sentencia a sentencia y
respaldado por dos suites de guardia sobre el texto del archivo
(`inventario-split-migration.test.ts`, 212 líneas nuevas; `proveedores-migration.test.ts`, 619
líneas nuevas) que la bitácora demuestra que muerden: siete rondas de degradación del
`down.sql`, todas rojas, con el caso concreto identificado en cada una.

### 2.2 Independencia real de las dos tablas — CONFIRMADA

- **En la base:** `supplier_catalog_lines` no tiene columna `product_id` ni ninguna FK hacia
  `products`. `products` no tiene nada hacia la línea.
- **En el esquema Prisma:** `SupplierCatalogLine` no declara relación hacia `Product`,
  `Presentation`, `Unit` ni `User`. Su única relación es `supplier`, dentro de su módulo.
  `presentationId`, `unitId`, `createdBy` y `updatedBy` son escalares. Un
  `include: { presentation: true }` desde `proveedores` es **inexpresable**.
- **En el código:** grep de `inventario` y de `product` sobre todo
  `lib/modules/proveedores/**` devuelve **solo comentarios**. Cero imports.
  `ProductNotFoundError` y su código borrados del módulo y del barrel. `lib/composition` deja
  de pasar `products: productCatalog` a las dos factories, y `productCatalog` se conserva
  porque `recetas` lo usa (correcto).
- **Probado, no solo grepeado:** `catalog-line.int.test.ts` da de baja **y luego borra
  físicamente** un producto con una línea viva delante, y afirma que la fila de la línea queda
  idéntica y que sigue apareciendo en el listado de su proveedor. Ese es el test que hace
  cierto R19, y es de los buenos.

### 2.3 Autorización en el service — CORRECTA

Ver el checklist. Añado que la comprobación es de igualdad exacta contra `ROLE_ADMINISTRADOR`
importado del barrel de `identity` (sin literal propio, sin `includes`, sin normalización), y
que **consultar también pasa por ahí**: `listCatalogLines` y `getSupplier` llaman a
`requireAdmin` igual que las mutaciones.

---

## 3. Los dos puntos abiertos: mi lectura (no son hallazgos míos, no bloquean)

### 3.1 T13 y el `meta.field_name` de Prisma 6.19.3 — la salida es honesta

Leídos el clasificador, su test unitario y el de integración. **No esconde nada, y por tres
razones concretas:**

1. El hallazgo está escrito **tres veces y en los tres sitios donde se lee**: en la cabecera
   de `fieldNameOf` en el adaptador, en la cabecera de `catalog-line-fk.test.ts` y en el
   bloque de T13 de `tasks.md`. Nadie puede tocar esa función sin tropezarse con el aviso.
2. El test de integración afirma **lo que ocurre** (la base rechaza con 23503 y el adaptador
   relanza el `P2003` crudo), no lo que el diseño quería que ocurriera. Eso es lo contrario de
   esconder: el test que afirmara `invalid_input` sería el que mentiría.
3. La alternativa —traducir a ciegas todo `P2003` de la tabla a `invalid_input`— le diría
   «entrada inválida» al usuario cuando el fallo fuera del autor. `design.md > 6.2` prohíbe
   esa mentira en el otro sentido; cometerla en este habría sido peor que no traducir.

**Lo que sí queda como consecuencia real, y conviene que el humano la vea al decidir:** hoy un
`presentation_id` o un `unit_id` inexistente sale del adaptador como `P2003` **crudo**, o sea
sin código de dominio estable, y la Server Action no lo convierte en
`{ status: 'error', code }`. R32 pide que cada fallo lleve un código estable; este no lo
lleva. **No lo cuento como incumplimiento de R32** porque (i) es exactamente el estado
preexistente de `inventario` con `products.presentation_id`, que esta ficha no viene a
arreglar, y (ii) no hay hoy ninguna vía de usuario que lo alcance: la pantalla del catálogo es
QC-44 y no existe. Pero es deuda con nombre, y la opción (b) del implementer —mover de versión
de Prisma— la cerraría para los dos módulos a la vez. La opción (c), el pre-`SELECT` de
existencia, reabriría justo la dependencia que esta ficha corta: yo la descartaría.

### 3.2 El `fill` de `qtyAlert` en el E2E — la afirmación del implementer es CIERTA

Verificado, no aceptado de palabra:

- `git show origin/dev:app/(private)/inventario/components/product-form.tsx` ya trae
  `required` en el campo `qtyAlert` (línea 389). QC-52 **no** lo añadió: en `HEAD` está en la
  línea 329 y el diff de ese archivo son solo borrados.
- El `required` lo introdujo `b4822de feat(inventario): formulario y tabla de producto
  acotados, con ayuda e imagen`, ya en `dev`.
- `./init.sh` **no corre Playwright** (grep de `e2e` y `playwright` en `init.sh`: sin
  coincidencias), así que el E2E pudo quedarse roto en `dev` sin que ningún gate lo dijera.

Conclusión: **no es una tirita sobre una regresión de QC-52**. Es un segundo fallo preexistente
que QC-52 destapó al quitar el primero. El `fill` es la corrección correcta —el alta exige el
campo, luego el recorrido tiene que rellenarlo— y está comentado en el spec diciendo por qué.
Yo lo dejaría donde está.

---

## 4. El rojo del baseline: comparto el análisis del leader

Reproducido en esta rama:

```
FAIL tests/unit/recetas-ui/recipe-route-contract.test.ts
  > la feature no toca lib/modules/recetas ni db/
AssertionError: ningun archivo de db/ deberia estar en el diff: expected [ ...(3) ] to deeply equal []
+ [ "db/migrations/20260904123854_.../down.sql", ".../migration.sql", "db/schema.prisma" ]
```

**Sí: falla por una razón distinta de la que documenta el baseline.** El motivo escrito en
`tests/baseline-rojos.json` es que en `dev` el rango `origin/dev...HEAD` está vacío. Aquí el
rango **no** está vacío y el caso llega a la aserción real: la guardia R44 de QC-26 —«esta
feature no toca `db/`»— muerde a QC-52, que por su naturaleza tiene que tocar `db/`.

**Es deuda de arnés, no algo que QC-52 tenga que arreglar.** Una guardia de alcance escrita
para *una* rama concreta y evaluada sobre `origin/dev...HEAD` se dispara contra *cualquier*
otra rama, porque no tiene forma de saber qué feature está midiendo. Ficha aparte vía
`/afinar-regla`. Dos observaciones para esa ficha:

- El caso hermano de `tests/unit/recetas/module-contract.test.ts` **pasa** en esta rama
  (QC-52 no toca `lib/modules/recetas/`), así que el problema no es el patrón entero: es
  específicamente el `tocaDb` de R44.
- La cura que el propio `baseline-rojos.json` ya propone —«que el caso se auto-salte cuando el
  rango está vacío»— **no arregla esto**: aquí el rango existe. Hace falta que la guardia sepa
  a qué feature pertenece (leer la rama o el `feature_list.json`, o vivir bajo `specs/QC-26/`),
  o retirarla ahora que QC-26 está mergeada, que es lo más simple.

Mientras tanto el coste ya documentado sigue: al estar el archivo entero en el baseline, sus
otros 19 casos no protegen nada vía gate en ninguna rama.

---

## 5. Hallazgos

### Mayores (bloqueantes): **ninguno**

### Menores

**menor 1 — 15 archivos convertidos a CRLF, y el diff se vuelve ilegible.**
`git diff origin/dev...HEAD` marca 497 líneas cambiadas en `product-actions.ts`; con
`--ignore-cr-at-eol` son **6 añadidas y 13 borradas**. Lo mismo en
`inventario-constraints.int.test.ts` (1785 → 170/97) y en `product-page.test.tsx` (2191 →
46/49). Afectados: los cuatro de `lib/modules/inventario/`, los seis de
`tests/unit/inventario/`, los dos de `tests/integration/inventario/` y los dos de
`tests/integration/recetas/`. El repo **no tiene `.gitattributes`**. Esto ya costó caro una
vez —el conflicto de 686 líneas de `presentation-uniqueness.int.test.ts` que describe el
apéndice A.2 era exactamente esto— y hay dos sesiones vivas en paralelo (QC-34, QC-55) que se
lo van a comer al mergear. No bloquea porque ninguna regla del arnés lo prohíbe hoy y el
contenido es correcto; **pero la regla que falta es justo la que debería existir**: un
`.gitattributes` con `* text=auto eol=lf` es candidato claro a `/afinar-regla`.

**menor 2 — `nameNormalized` se deriva en el adaptador driven, no en el caso de uso.**
`writableFields()` de `supplier-catalog-line-prisma.ts` llama a `normalizeSupplierName`. El
precedente hermano del mismo módulo, `create-supplier.ts`, lo hace **en el dominio** (línea
47), y T12 listaba `create-catalog-line.ts` y `update-catalog-line.ts` entre los archivos a
tocar. El adaptador razona la desviación (el tipo `CatalogLineFields` que fija
`design.md > 7` no lleva `nameNormalized`, y es columna derivada) y el comportamiento
observable es idéntico y está probado contra Postgres. Aun así: «qué cuenta como el mismo
nombre» es una regla de negocio y hoy vive en la capa de persistencia de un módulo que ya la
tiene escrita en su dominio. Se anota, no bloquea.

**menor 3 — T13 está marcada `[x, CON SALVEDAD]`, que literalmente no es `[x]`.**
`CHECKPOINTS.md > Especificación` pide todas las tasks en `[x]`. La salvedad está bien puesta y
bien argumentada, y el leader indicó no contarla como bloqueante; pero mientras el humano no
decida entre (a), (b) y (c), la marca sigue siendo condicional. Al cerrar la decisión hay que
reescribir el «hecho cuando» de T13 y dejar la marca limpia.

**menor 4 — el `P2003` de `presentation_id`/`unit_id` escapa sin código de dominio.**
Consecuencia de la salvedad de T13, detallada en la sección 3.1. Hoy inalcanzable desde la UI
(QC-44 no existe) y heredada de `inventario`. Se anota para que la decisión del humano se tome
sabiendo que no es solo cosmética.

**menor 5 — `tests/baseline-rojos.json` documenta un motivo que ya no es el que ocurre.**
Detallado en la sección 4. La entrada de `recipe-route-contract.test.ts` explica el fallo del
rango vacío en `dev`; en las ramas de feature falla por otra cosa. Debería decir las dos.
Deuda de arnés, ficha aparte.

**menor 6 — el E2E de inventario estaba roto en `dev` y ningún gate lo decía.**
Detallado en la sección 3.2. `./init.sh` no corre Playwright. No es de QC-52 —al contrario,
QC-52 es quien lo destapa y lo arregla— pero conviene que quede escrito: entre que se hizo
`qtyAlert` `required` y hoy, el recorrido de alta estuvo rojo sin que nadie se enterase.

---

## 6. Lo que falta para cerrar la feature (no es del implementer)

- Decisión humana sobre T13 (sección 3.1) y sobre el `fill` de `qtyAlert` (sección 3.2; mi
  recomendación: se queda).
- `./init.sh` completo antes del PR: ya corrido por el leader, `== init OK ==`, con el único
  rojo del baseline analizado en la sección 4.
- Entrada en `progress/history.md` y desmontaje del worktree (`./scripts/wt.sh done`), o su
  HOLD anotado en `progress/current.md > Deudas y cosas abiertas`.

---

## Veredicto final

**OK.** Sin hallazgos mayores. La feature cumple los 34 requisitos con tests que muerden, la
migración es de las mejor auditadas del repo, la independencia entre las dos tablas es real
—no solo de imports— y la autorización está donde `CHECKPOINTS.md` la exige, con la prueba de
que ningún puerto se toca antes. Los seis menores son deuda anotada, y cinco de ellos ni
siquiera son de esta ficha.
