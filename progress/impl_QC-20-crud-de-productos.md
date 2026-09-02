# QC-20 — crud-de-productos · bitacora de correcciones puntuales

> Esta tanda NO es una task de `tasks.md`: son tres correcciones que decidio el leader
> sobre el trabajo ya commiteado del Grupo A (T1, T2, T3), mas T15 adelantada. No se toco
> nada de `.env` ni se corrio ninguna migracion contra base de datos.

## Correccion 1 — FK de auditoria a `ON DELETE RESTRICT`

Archivos:
- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-20-crud-de-productos\db\migrations\20260902170759_product_audit_and_presentation_uniqueness\migration.sql`
- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-20-crud-de-productos\tests\unit\inventario\schema\inventario-audit-migration.test.ts`

`products_created_by_fkey` y `products_updated_by_fkey` pasan de `ON DELETE SET NULL` a
`ON DELETE RESTRICT` (`ON UPDATE CASCADE` sin cambios). Razon documentada en el comentario
de la migracion: convencion del repo (las tres FK existentes usan Restrict+Cascade sin
excepcion), `users` tiene borrado logico asi que el DELETE fisico no ocurre por ningun
camino de la app, y R7 exige referencia real — SET NULL la rompe en silencio, RESTRICT la
rompe con ruido. Decision del leader, el spec no la fijaba.

`down.sql` no cambio: el DROP CONSTRAINT no depende de la accion ON DELETE.

## Correccion 2 — alcance de QC-14 se estrecha, QC-20 hereda con `scope.test.ts`

Archivos:
- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-20-crud-de-productos\tests\unit\inventario\schema\inventario-schema.test.ts`
- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-20-crud-de-productos\tests\unit\inventario\scope.test.ts` (nuevo, T15 adelantada)

Se quitaron del test de QC-14 las tres clausulas que ya no podian ser verdad (adaptadores
driving vacios, domain vacio, contrato `export {};` sin re-exports), se le cambio el
nombre a `la feature no anade ninguna ruta HTTP de productos ni presentaciones bajo
app/api` y se dejo comentario explicando el traspaso. El bucle que comprueba la ausencia
de `app/api/products`, `app/api/presentations` y `app/api/inventario` sigue vivo sin
tocar. `readdirSync` quedo sin uso en ese archivo y se saco del import.

`scope.test.ts` es nuevo, con los dos nombres exactos de la tabla de trazabilidad de
`tasks.md`:
- `las mutaciones del catalogo son Server Actions y no hay ningun route handler bajo app/api` (R29)
- `no existe ninguna pantalla, pagina ni componente de productos, ni spec E2E nuevo` (R34)

### Tabla de falsabilidad (una por una, con archivo temporal, comando y resultado)

| # | Aserción | Archivo temporal creado | Resultado en rojo | Limpieza |
| --- | --- | --- | --- | --- |
| 1 | `app/api/products` no existe | `app/api/products/route.ts` | `AssertionError: ...app\api\products no debe existir...: expected true to be false` | `rm -rf app/api/products` → verde |
| 2 | `app/api/presentations` no existe | `app/api/presentations/route.ts` | mismo `AssertionError` sobre la ruta `presentations` | `rm -rf app/api/presentations` → verde |
| 3 | `app/api/inventario` no existe | `app/api/inventario/route.ts` | mismo `AssertionError` sobre la ruta `inventario` | `rm -rf app/api/inventario` → verde |
| 4 | todo archivo en `adapters/driving/` declara `'use server'` en la primera linea | `lib/modules/inventario/adapters/driving/fake-action.ts` sin la directiva | `AssertionError: ...fake-action.ts debe declarar 'use server' en la primera linea` | `rm -f fake-action.ts` → verde |
| 5 | ninguna pantalla de catalogo bajo `app/` | `app/(private)/products/page.tsx` | `AssertionError: pantalla de catalogo encontrada bajo app/: ...products\page.tsx` (encontrado tras corregir el bug de que solo miraba `entry.name` y no la ruta completa — ver nota abajo) | `rm -rf "app/(private)/products"` → verde |
| 6 | ningun componente de catalogo bajo `components/` | `components/product-list.tsx` | `AssertionError: componente de catalogo encontrado bajo components/: ...product-list.tsx` | `rm -f components/product-list.tsx` → verde |
| 7 | ningun spec E2E de catalogo bajo `e2e/` | `e2e/productos.spec.ts` | `AssertionError: spec E2E de catalogo encontrado: ...productos.spec.ts` | `rm -f e2e/productos.spec.ts` → verde |

**Nota sobre la aserción 5:** el primer intento (mirar solo `entry.name`, el nombre del
archivo) NO se puso roja con `app/(private)/products/page.tsx` porque el nombre del
archivo es `page.tsx` (generico) y la palabra "products" esta en el nombre de la carpeta,
no del archivo. Se corrigio `matchingFiles` para comprobar la RUTA COMPLETA relativa al
directorio buscado, no solo el nombre del archivo, y ENTONCES se repitio la prueba y se
confirmo roja. Se deja constancia porque es exactamente el tipo de aserción
infalsificable-por-accidente que pide vigilar el enunciado.

Ninguna aserción quedo sin poder falsificarse.

## Correccion 3 — auditoria del diff en `inventario-constraints.int.test.ts` (de QC-14)

```
git diff origin/dev...HEAD -- tests/integration/inventario/inventario-constraints.int.test.ts
```

Resultado: **25 inserciones, 3 eliminaciones, 0 lineas con `expect(` eliminadas.**

Las 3 lineas eliminadas son las tres llamadas originales a `tx.presentation.create({...})`
en una sola linea; se reemplazaron por la misma llamada en varias lineas, anadiendo
`nameNormalized: normalizeForTest(name)` (columna `NOT NULL` nueva de QC-20). Las 25
lineas anadidas son: el helper `normalizeForTest` (14 lineas, con su comentario) y el
reformateo multi-linea de los tres `create` que ahora incluyen el campo nuevo.

Diff completo:

```diff
diff --git a/tests/integration/inventario/inventario-constraints.int.test.ts b/tests/integration/inventario/inventario-constraints.int.test.ts
index 46c3f32..d8c5713 100644
--- a/tests/integration/inventario/inventario-constraints.int.test.ts
+++ b/tests/integration/inventario/inventario-constraints.int.test.ts
@@ -117,6 +117,21 @@ async function expectRejectedByDatabase(
 // Datos de apoyo
 // ---------------------------------------------------------------------------

+/**
+ * Normalizacion minima para satisfacer `presentations.name_normalized` (QC-20, NOT NULL
+ * + indice unico) en estos tests de QC-14, que no verifican la normalizacion en si —eso
+ * lo cierra `tests/unit/inventario/presentation-name.test.ts`—. Replica los mismos cuatro
+ * pasos que `domain/presentation-name.ts` y el backfill SQL de la migracion de QC-20.
+ */
+function normalizeForTest(name: string): string {
+  return name
+    .trim()
+    .toLowerCase()
+    .normalize('NFD')
+    .replace(/[̀-ͯ]/gu, '')
+    .replace(/[^a-z0-9]/gu, '')
+}
+
 /**
  * Crea una presentacion. El nombre NO es unico (decision cerrada del humano), asi que no
  * hace falta aleatorizarlo como se hacia con `roles.name` en `identity`.
@@ -125,7 +140,10 @@ async function createPresentation(
   tx: Prisma.TransactionClient,
   name = 'Bidon 20 L',
 ): Promise<string> {
-  const presentation = await tx.presentation.create({ data: { name }, select: { id: true } })
+  const presentation = await tx.presentation.create({
+    data: { name, nameNormalized: normalizeForTest(name) },
+    select: { id: true },
+  })
   return presentation.id
 }

@@ -211,7 +229,9 @@ afterAll(async () => {
 describe('estructura de la presentacion', () => {
   it('crea una presentacion y su identificador no cambia al renombrarla', async () => {
     await inRolledBackTransaction(async (tx) => {
-      const created = await tx.presentation.create({ data: { name: 'Bidon 20 L' } })
+      const created = await tx.presentation.create({
+        data: { name: 'Bidon 20 L', nameNormalized: normalizeForTest('Bidon 20 L') },
+      })
       // R1: identificador propio, estable y no derivado de los datos de negocio.
       expect(created.id).toMatch(/^[0-9a-f-]{36}$/u)
       expect(created.name).toBe('Bidon 20 L')
@@ -736,7 +756,9 @@ describe('borrado logico y marcas de tiempo', () => {
     await inRolledBackTransaction(async (tx) => {
       // Nunca se pasan `createdAt` ni `updatedAt`: los rellenan el DEFAULT de la base y
       // el `@updatedAt` de Prisma.
-      const presentation = await tx.presentation.create({ data: { name: 'Caneca 5 L' } })
+      const presentation = await tx.presentation.create({
+        data: { name: 'Caneca 5 L', nameNormalized: normalizeForTest('Caneca 5 L') },
+      })
       expect(presentation.createdAt).toBeInstanceOf(Date)
       expect(presentation.updatedAt).toBeInstanceOf(Date)
```

Veredicto: solo se toco andamiaje (una columna `NOT NULL` nueva que obliga a pasarla en
`create`), ninguna asercion se debilito ni se elimino.

## Verificacion corrida (sin tocar base de datos)

- `pnpm run typecheck` → limpio.
- `pnpm run lint` → limpio.
- `pnpm run test:guardias` → 7 archivos, 78 tests, todos en verde.
- `pnpm exec vitest related --run tests/unit/inventario/schema/inventario-audit-migration.test.ts tests/unit/inventario/schema/inventario-schema.test.ts tests/unit/inventario/scope.test.ts db/migrations/20260902170759_product_audit_and_presentation_uniqueness/migration.sql` → 3 archivos, 36 tests, verde.
- `pnpm exec vitest run tests/unit/inventario/ tests/unit/pagination.test.ts` → 6 archivos, 60 tests, verde.
- No se corrio `pnpm test` completo ni `./init.sh`: los `*.int.test.ts` siguen rojos hasta
  que el leader aplique la migracion en la base propia del worktree. Es lo esperado, no se
  tocaron.

## Veredicto

Las tres correcciones quedaron aplicadas, con la tabla de trazabilidad de `tasks.md`
intacta (R29 y R34 ahora tienen su test real y falsable en `scope.test.ts`), y el diff
ajeno de QC-14 auditado sin hallazgos: solo andamiaje, cero aserciones perdidas.

---

# Anotaciones del implementer — cierre del Grupo A

## Decision del leader: `ON DELETE RESTRICT` en las FK de auditoria

**El spec NO fijaba esta accion.** `design.md > 2.4` solo nombra los constraints
(`products_created_by_fkey`, `products_updated_by_fkey`); ni `requirements.md` ni la tabla
`## Decisiones cerradas (no reabrir)` dicen que pasa al borrar el usuario referenciado.
`backend_dev` la resolvio por su cuenta como `ON DELETE SET NULL`; el implementer lo paro y
lo escalo, y **la decidio el leader**, no el humano. Razonamiento, para que el reviewer la
juzgue y el humano pueda revocarla:

1. **No es un dato ausente, es una convencion que el codigo ya fija.** Las tres FK que ya
   existian en `db/schema.prisma` usan `onDelete: Restrict, onUpdate: Cascade` sin ninguna
   excepcion: `users.role_id`, `users.document_type_code` y `products.presentation_id`.
2. **El caso contra el que protegia `SET NULL` hoy no ocurre.** `users` tiene borrado
   logico (`deleted_at`), asi que ningun camino de la aplicacion hace `DELETE` fisico de un
   usuario. Los dos comportamientos son equivalentes en la practica; se diferencian **solo
   en como fallan**.
3. **R7 exige «referencia real a un usuario existente».** `SET NULL` convierte esa
   referencia en `NULL` **en silencio**, que es exactamente lo que R7 prohibe. En una
   columna de auditoria eso destruye la atribucion sin avisar. `RESTRICT` hace ruidoso el
   dia que alguien escriba un script de purga, que es cuando quieres enterarte.

Verificado contra la base real (`pg_constraint.confdeltype`): las tres FK de `products`
salen `r` (RESTRICT) / `c` (CASCADE), identicas entre si.

## Alcance NO previsto por `tasks.md`

Dos trabajos que esta feature tuvo que hacer y que el `tasks.md` no contemplaba. Se anotan
como tales para el reviewer.

### 1. Estrechar el test de alcance de QC-14

`tests/unit/inventario/schema/inventario-schema.test.ts` afirmaba el alcance de QC-14 (su
R23: «esta ficha es esquema y migracion, sin dominio ni contrato»). QC-20 es por definicion
la ficha que le da contenido al modulo, asi que **tres clausulas quedaron imposibles de
cumplir**. Se quitaron esas tres y **ninguna mas**:

| Clausula retirada | Que afirmaba | Por que QC-20 la invalida | A donde pasa |
| --- | --- | --- | --- |
| `typescriptFilesIn(adapters/driving)).toEqual([])` | el modulo no tiene Server Actions | R29 exige que QC-20 cree las Server Actions del catalogo | `tests/unit/inventario/scope.test.ts` › `las mutaciones del catalogo son Server Actions y no hay ningun route handler bajo app/api` |
| `typescriptFilesIn(domain)).toEqual([])` | el modulo no tiene dominio | R31 exige que los casos de uso vivan en `inventario/domain/` | cubierto por la guardia `guard-arquitectura-modulos.test.ts` (bloques 4, 6 y 13), que vigila la *pureza* del dominio en vez de su *ausencia* |
| `contract.trim()).toBe('export {};')` + el `not.toMatch` de reexports | el contrato sigue siendo el slot vacio de QC-15 | `design.md > 1` y T11: QC-20 es quien le da contenido al contrato | guardia `guard-arquitectura-modulos.test.ts` bloque 6 (contrato limpio, cierre transitivo, incluido el reexport camuflado) |

**Lo que NO se toco de ese test:** el bucle que comprueba que no existen `app/api/products`,
`app/api/presentations` ni `app/api/inventario` sigue vivo, y el resto del archivo intacto.

Por que `--rapido` no lo habria cazado: ese test recorre el **arbol de archivos**, no el
grafo de imports, asi que `vitest related` no lo selecciona nunca. Es el caso del aviso 6
del encargo; esta vez aparecio **antes** del gate.

### 2. `tests/unit/inventario/scope.test.ts` adelantado

Es la task **T15 (Grupo D)**, adelantada al Grupo A porque es donde aterrizan las clausulas
que QC-14 pierde. Dejar el hueco entre medias habria sido dejar el alcance sin vigilar
durante tres grupos.

## Bug real cazado por la comprobacion de falsabilidad

La primera version de la asercion «no hay pantalla de productos bajo `app/`» miraba solo
`entry.name` —o sea el nombre del archivo, `page.tsx`, que es generico— en vez de la ruta
relativa completa. **No se ponia roja al crear `app/(private)/products/page.tsx`.** Era
infalsable por accidente: exactamente el fallo que el reviewer cazo en QC-8. Se detecto
porque se exigio provocar el rojo una por una, y se corrigio a comprobar la ruta completa.
Sin esa comprobacion, R34 habria quedado cerrado por un test que no podia fallar.

## Base de datos propia del worktree

La base local `QuimiCloude` esta **compartida** y tenia ya aplicada la migracion
`recipes_and_recipe_lines` de otra feature en vuelo (QC-24). Correr `db:migrate` encima
habria pisado trabajo ajeno, que es lo que en su dia obligo a QC-14 a crearse
`QuimiCloude_QC14`. Se hizo lo mismo:

- Creada `QuimiCloude_QC20` en el Postgres local. Se uso el cliente `pg` de Node y no
  `psql`, porque `psql` no esta instalado en esta maquina — misma razon por la que
  `scripts/db-rollback.ts` usa `pg`.
- `.env` del worktree apuntado a esa base (`DATABASE_URL` y `DIRECT_URL`). `.env` esta
  git-ignorado (`.gitignore:38`, patron `.env*`), asi que no ensucia el repo. Se dejo copia
  en `.env.bak-qc20`, tambien ignorada.
- Las **cinco** migraciones aplicadas desde cero con `pnpm run db:migrate`, todas en verde.

**Deuda a saldar al desmontar el worktree:** borrar la base `QuimiCloude_QC20`. Hoy el
Postgres local tiene tres: `QuimiCloude` (compartida), `QuimiCloude_QC14` y
`QuimiCloude_QC20`.

### Estado del esquema verificado contra la base real

| Objeto | Estado |
| --- | --- |
| `products.created_by` / `products.updated_by` | `uuid`, NULLABLE (`design.md > 2.1 b`) |
| `presentations.name_normalized` | `text`, NOT NULL, con backfill aplicado |
| `products_created_by_fkey` / `products_updated_by_fkey` | RESTRICT / CASCADE |
| `presentations_name_normalized_key` | `CREATE UNIQUE INDEX ... USING btree (name_normalized)` |
| RLS en `products` y `presentations` (R4) | `relrowsecurity = true` **y** `relforcerowsecurity = true` — la migracion no la desactivo |

`pnpm exec vitest run tests/integration/inventario/` → **1 archivo, 19 tests, todos verdes**
(estaban rojos antes de aplicar migraciones, por `column "name_normalized" does not exist`).

---

# Cierre del Grupo B

## Correccion aplicada al propio `design.md` (no solo aqui)

`design.md > 11.4` afirmaba que «la comprobacion previa se mantiene, pero solo para dar un
mensaje decente». **Era falso y se ha corregido en el propio documento**, no solo en esta
bitacora: un diseno que afirma algo falso es peor que uno incompleto, porque nadie va a
buscar donde el documento dice que no hay nada (leccion de QC-8, donde una correccion que se
quedo solo en la bitacora la saco el reviewer como hallazgo).

Motivo de la correccion:

1. **Era inexpresable con el diseno de la propia ficha.** El `PresentationRepository` de
   `design.md > 7` —normativo— expone `create`, `rename`, `deleteById` y `list`, y **ningun
   metodo de busqueda por `nameNormalized`**. Hacer la comprobacion previa habria exigido
   anadir un metodo al puerto: apartarse del diseno para cumplir una frase del diseno.
2. **Una comprobacion previa es una carrera.** Entre el `SELECT` y el `INSERT` cabe otra
   transaccion, asi que no garantiza nada; la garantia real es el indice unico.
3. **No aportaba el mensaje que decia aportar.** El puerto ya devuelve `'duplicate'` y el caso
   de uso lo traduce a `DuplicateNameError`: el usuario recibe el mismo error con o sin ella.

Lo implementado: `create-presentation.ts` y `update-presentation.ts` **siempre** traducen el
`'duplicate'` del puerto, sin comprobacion previa. Mutacion confirmada. D13 sigue intacta.

## El reloj (`now`) como dependencia inyectable

El puerto pide `now: Date` y **el spec no decia de donde sale**. Se resuelve con
`now?: () => Date` en las `deps`, con `() => new Date()` por defecto.

**Sigue una convencion que ya existe en el repo**, no una preferencia del implementer: es lo
mismo que hizo **QC-7 en `lib/modules/identity/domain/account-lock.ts`**, donde el reloj entra
como parametro con valor por defecto. Es lo que permite fijar el instante en el test sin reloj
falso ni `sleep`.

## Falsos verdes cazados en el Grupo B (cuarto y quinto de la jornada)

1. **Barrido estatico de R1 que media comentarios.** La mitad estatica de
   `authorization.test.ts` buscaba `next/headers` en el texto crudo de los archivos de
   `domain/`, y `create-product.ts` **documenta la prohibicion en prosa**. El comentario
   disparaba la deteccion: el test media comentarios, no codigo. Corregido a quitar comentarios
   de linea y de bloque antes de buscar.
2. **`it('R5')`, `it('R6')`, `it('R2')`…** `docs/conventions.md > Tests` exige que el nombre
   describa la conducta, no la funcion. `product-service.test.ts` y `authorization.test.ts`
   ponian la conducta en el `describe` y el numero de requisito en el `it`, que es exactamente
   el anti-patron citado en la convencion. Se le dio la vuelta: **96 tests antes, 96 despues**,
   diff de 18 inserciones / 18 eliminaciones, ninguna linea `expect(` perdida.

Los **cinco** falsos verdes de la jornada aparecieron **ejecutando o mutando; ninguno leyendo**.

## Recuento de mutaciones del Grupo B: 26

| Task | Mutaciones |
| --- | --- |
| T4 esquemas zod | 9 (incluidas `.trim()` quitado y `z.coerce.string()` en `cost`) |
| T6 casos de uso de producto | 4 |
| T7 casos de uso de presentacion | 4 |
| T8 autorizacion | **9, una por caso de uso** |

La de T8 es la que sostiene la feature: **quitar `requireAdmin` de cada uno de los nueve casos
de uso pone rojo el test**, comprobado y revertido nueve veces. Dato que lo hace necesario:
cuando se quito `requireAdmin` de `create-product.ts`, `product-service.test.ts` **siguio
verde (13/13)** —la autorizacion no es su alcance—, asi que `authorization.test.ts` es la
**unica** red de R1, R2 y R3 en toda la feature.

---

# CORRECCION de un diagnostico causal equivocado (merge con `dev`)

**Lo que esta bitacora afirmo primero, y era FALSO:** que `stripComments` de
`tests/unit/inventario/schema/inventario-schema.test.ts` era «un no-op en todo el repo»
porque los ficheros son CRLF, y que por tanto ese archivo «llevaba desde QC-14 afirmando
contra texto con comentarios incluidos». Se clasifico como el cuarto falso positivo de la
familia «el test mide comentarios en vez de codigo».

**Nada de eso se sostiene.** Medido por bytes (`tr -d -c '\r' | wc -c`), no por `grep`:

| Archivo | CR en disco | CR en `origin/dev` |
| --- | --- | --- |
| `tests/unit/inventario/schema/inventario-schema.test.ts` | 0 | 0 |
| `db/schema.prisma` (lo que ese `stripComments` procesa) | 0 | 0 |

Los dos son **LF puro**, y `core.autocrlf` es `false` sin `.gitattributes`. Sobre LF, tras
`.split('\n')` ninguna linea lleva `\r`, `$` ancla al final de la cadena y el regex original
`/\/\/.*$/` **casa perfectamente**. `stripComments` funcionaba.

## La causa real: la introduje yo

El unico archivo CRLF del conjunto era **`lib/modules/inventario/index.ts`**, y estaba CRLF
**porque lo escribi yo** al resolver el conflicto del merge: use `io.open(p,'w')` de Python
sin `newline=''`, y en Windows eso traduce cada `\n` a `\r\n`. El archivo salio del merge con
46 CR donde el repo tiene 0.

Ese archivo es justo el que la asercion lee (`contract = stripComments(readFileSync(index.ts))`),
y su cabecera documenta la prohibicion **con la cadena literal**: «Nada de `'use server'`, nada
de Prisma». Con CRLF el comentario no se quitaba, la prosa se colaba y
`expect(contract).not.toMatch(/['"]use server['"]/)` caia.

## Prueba empirica (las dos direcciones, con el regex ORIGINAL sin tocar)

| Estado | Resultado |
| --- | --- |
| regex original `/\/\/.*$/` + `index.ts` en **CRLF** | **ROJO** — `expected '// lib/modules/inventario/index.ts — …' not to match /['"]use server['"]/` |
| regex original `/\/\/.*$/` + `index.ts` en **LF** | **VERDE, 20/20** |

Queda demostrado que **el cambio de regex no arreglo nada**: lo que arreglaba el test era
devolver `index.ts` a LF. El cambio de regex estaba **enmascarando un defecto propio**.

## Que se hizo al final

1. **`lib/modules/inventario/index.ts` devuelto a LF**, que es la convencion del repo. Esta es
   la correccion de verdad.
2. **Barrido de todo lo que escribi con Python sin `newline=''`**: tambien habian quedado CRLF
   `progress/current.md` y `specs/QC-20-crud-de-productos/design.md`. Los dos devueltos a LF.
   Los archivos que si escribi con `newline=''` (`tasks.md`, esta bitacora, el test de esquema,
   el de integracion de recetas) nunca se contaminaron.
3. **El cambio de regex se conserva**, pero descrito por lo que es: **endurecimiento preventivo**
   ante saltos de linea mixtos, **no** la correccion de un fallo existente. No cambia el
   resultado de ninguna asercion sobre los archivos LF del repo.

## Recuento corregido

Son **TRES** falsos positivos de la familia «el test mide comentarios en vez de codigo», no
cuatro: el barrido estatico de R1 (Grupo B), el bloque 10 de la guardia con `prisma.user` en un
comentario (T9), y el de `use server` aqui — que ademas **no era un defecto del test**, sino un
defecto mio que el test detecto correctamente. Bien hecho por el test.

**Leccion, y es la razon de escribir todo esto:** una explicacion causal equivocada en la
bitacora es peor que no explicar nada, porque el siguiente que lea «esto pasaba por CRLF» va a
buscar en el sitio equivocado. El error aqui fue medir con `grep -c $'\r'` y con
`od -c | grep -o`, que cuentan mal, y **generalizar de un archivo a todo el repo sin comprobarlo**.

## Nota de herramienta, para quien venga detras

`io.open(ruta,'w',encoding='utf-8')` en Python sobre Windows **traduce `\n` a `\r\n`**. En este
repo, que es LF, hay que escribir **siempre** con `newline=''` (o en binario). Un archivo que
sale CRLF de una edicion automatizada ensucia el diff entero y puede romper tests que barren
texto linea a linea.

---

# Cierre del Grupo C — T12: Server Actions

## Archivos

- `lib/modules/inventario/adapters/driving/product-actions.ts` (nuevo)
- `lib/modules/inventario/adapters/driving/presentation-actions.ts` (nuevo)
- `lib/modules/inventario/adapters/driving/.gitkeep` (borrado, ya no hace falta: la carpeta
  tiene contenido)
- `tests/unit/inventario/product-actions.test.ts` (nuevo, 15 tests)
- `specs/QC-20-crud-de-productos/tasks.md` (T12 marcada `[x]`, con la nota de la divergencia
  de abajo)

## Divergencia encontrada entre `design.md`/el enunciado y el estado real del arbol

El enunciado de esta tanda y `design.md > 5` dicen que `identity.getSessionUser()` esta
cableado **hoy** al stub de QC-7 (`id: 'placeholder-user'`), y que una mutacion pasaria la
autorizacion pero moriria en la FK de R7. **Eso ya no es cierto en este arbol.** Comprobado
en disco:

- `feature_list.json` marca `QC-8` como `"status": "done"`.
- `lib/composition/index.ts` cablea `sessionProvider.getSessionUser` a
  `createResolveSessionUser({ session: sessionReader, users: sessionUserReader })`, con
  `sessionReader = { readClaims: readSessionClaims }` (`session-cookie.ts`, cookie HMAC real)
  y `sessionUserReader = { findActiveById: findActiveSessionUserById }`
  (`session-user-prisma.ts`, consulta real a `users`). No hay ningun archivo
  `session-stub.ts` en el arbol (`grep -r session-stub` no encuentra ninguno bajo `lib/`).

No invento un dato nuevo (regla 6 de `CLAUDE.md`): el `design.md` de esta ficha describe el
estado del arbol **anterior a que QC-8 mergeara**, y la sesion de esta tanda arranco
**despues** de ese merge (ver preambulo de la tarea: «la rama acaba de mergear
`origin/dev`»). No se reabre el diseno ni se reescribe `design.md` — D17 preveia exactamente
esto («QC-8 no tendra que tocar `inventario`: cambia el cableado en
`lib/composition/index.ts` y ya»), y es lo que paso. Lo que se corrige es el **comentario de
cabecera** de `product-actions.ts`, que documenta el estado real (sesion real, cableada por
QC-8) y dice explicitamente que el `design.md` describe el estado previo. Anotado tambien en
`tasks.md > T12`.

## Forma de entrada elegida por operacion, y por que

| Action | Forma de entrada | Por que |
| --- | --- | --- |
| `createProductAction`, `updateProductAction` | `FormData` (patron `useFormState`: `(prevState, formData)`) | Mutaciones que salen de un formulario (QC-22). El esquema (`createProductSchema`) vive en el caso de uso y exige `z.number()` en cinco campos; `FormData` solo entrega cadenas, asi que la action **convierte antes de validar** con `readOptionalFormInt`, que devuelve un sentinela `INVALID_NUMBER` (no `NaN`) ante una cadena no numerica, y la action rechaza sin llamar al caso de uso. Sin esto, `Number('abc')` es `NaN`, y `NaN` pasa `z.number().int()` como valor valido -R28 se incumpliria en silencio-. |
| `deleteProductAction` | `FormData` con un campo oculto `id` | Es una mutacion de formulario (un boton con un `<form>` de un solo campo, mismo patron de progressive enhancement que create/update). Sin campos numericos, no hay conversion que vigilar. |
| `getProductAction` | argumento tipado `(id: string)` | Es una consulta invocada programaticamente por un Server/Client Component que ya tiene el `id` (de la URL o de una fila ya cargada), no un envio de formulario. |
| `listProductsAction` | argumento tipado `(query: unknown)` | Es una consulta; quien llama ya tiene `{ page, pageSize }` como numeros (parseados de `searchParams`, por ejemplo). La validacion del minimo/entero la hace `pageQuerySchema` **dentro** del caso de uso (R28); la action no la repite, solo traduce. |
| Los cuatro equivalentes de `presentation-actions.ts` | mismo criterio | `createPresentationSchema`/`updatePresentationSchema` solo tienen `name` (cadena): no hay ningun campo numerico que convertir, asi que no hay sentinela `INVALID_NUMBER` en este archivo. |

**Por que no hay un archivo `*-form-state.ts` separado, a diferencia de `identity`.** Un
archivo con `'use server'` en Next.js **solo puede exportar funciones `async`** (restriccion
real del compilador, no una convencion del repo). `identity` resuelve esto con
`login-form-state.ts` **sin** `'use server'`, en el mismo directorio. Eso no es una opcion
aqui: el test de alcance de esta ficha
(`tests/unit/inventario/scope.test.ts`) exige que **todo** archivo `.ts`/`.tsx` bajo
`adapters/driving/` declare `'use server'` en la primera linea, y `design.md > 1` solo
enumera dos archivos ahi (`product-actions.ts`, `presentation-actions.ts`). Se resolvio
exportando **solo tipos** (`export type CreateProductFormState = ...`, erasable en
compilacion, permitido en un archivo `'use server'`) y **ninguna** constante `INITIAL_STATE`:
quien consuma la action (QC-22) construye el literal `{ status: 'idle' }` con el tipo
exportado.

## Traduccion de errores

`toErrorState(error)` en cada archivo: si `error instanceof InventarioError` (importado del
**barrel**, no por ruta profunda), devuelve `{ status: 'error', code: error.code, message:
error.message }` con el `code` **estable** de la clase (`unauthorized`, `not_found`,
`duplicate_name`, `presentation_in_use`, `invalid_input`), nunca el texto. Cualquier otro
error se **relanza** (`throw error`) — nada de `catch` vacios.

## Test `tests/unit/inventario/product-actions.test.ts`

Mockea `@/lib/composition` (`identity.getSessionUser`, y las nueve — aqui cinco de
producto — factories ya cableadas de `inventario`), mismo patron que
`tests/unit/identity/login-action.test.ts`/`logout-action.test.ts`. 15 tests, cubriendo las
cinco operaciones de producto:

- `la Server Action rechaza la entrada invalida antes de llamar al caso de uso` (R28, nombre
  EXACTO de `tasks.md > Trazabilidad`).
- que el actor sale de `identity.getSessionUser()` y se traduce a `{ id, roleName }` antes de
  pasarlo al caso de uso, incluido el caso sin sesion (`actor: null`, falla cerrado, R3).
- que cada clase de `InventarioError` (`UnauthorizedError`, `NotFoundError`,
  `ValidationError`) se traduce a su `code` estable, y que un error que NO es de dominio se
  relanza sin traducir.

No se duplico el mismo test para `presentation-actions.ts`: el patron de conversion, actor y
traduccion de errores es identico y ya esta demostrado; `presentation-actions.ts` no tiene
ningun camino de conversion numerica que `product-actions.ts` no cubra ya.

## Mutaciones (obligatorias, todas revertidas)

| # | Aserción que debía caer | Qué se mutó | Mensaje de fallo visto |
| --- | --- | --- | --- |
| 1 | `la Server Action rechaza la entrada invalida antes de llamar al caso de uso` (R28) | Se quitó el `if (candidate === INVALID_NUMBER) return ...` de `createProductAction`, dejando que la conversión inválida llegara igual al caso de uso mockeado | `TypeError: Cannot destructure property 'id' of '(intermediate value)' as it is undefined` — el mock por defecto de `createProductMock` no devuelve nada, y el test cayó porque `createProductMock` SÍ se llamó (rompiendo la premisa de "sin llamar al caso de uso") |
| 2 | traducción de error a `code` estable, en las 5 operaciones que la ejercitan | `toErrorState` se cambió a `throw error;` sin comprobar `instanceof InventarioError` | 5 tests caídos: `ValidationError: La entrada recibida no es valida.` / `NotFoundError: El recurso solicitado no existe.` propagándose crudos en vez de `{status:'error', code:...}` |
| 3 | que el actor sale de `identity.getSessionUser()` | `currentActor()` se cambió para devolver un actor fijo (`{ id: 'placeholder-user', roleName: 'Administrador' }`) sin llamar a `identity.getSessionUser()` | 6 tests caídos, todos con el mismo patrón: `expected "vi.fn()" to be called with arguments: [..., { id: 'user-admin-1', ... }] / Received: [..., { id: 'placeholder-user', ... }]` |

Las tres mutaciones se revirtieron (restauradas desde una copia del archivo original) y se
re-corrió la suite completa para confirmar que vuelve a verde.

## Verificación ejecutada

- `pnpm run typecheck` → limpio.
- `pnpm run lint` → limpio.
- `pnpm run test:guardias` → 7 archivos, 78 tests, verde (incluye `guard-arquitectura-modulos`
  y `guard-dependencias-aprobadas`).
- `pnpm exec vitest run tests/unit/ tests/ui/` → **49 archivos, 482 tests, verde** (baseline
  48/467 + el archivo nuevo de 15 tests = 49/482, exacto).
- `tests/unit/inventario/scope.test.ts` sigue verde y **ahora ejercita la cláusula positiva**
  de R29 de verdad: con `product-actions.ts` y `presentation-actions.ts` ya en el disco, el
  bucle `for (const file of typescriptFilesIn(drivingDir))` itera dos archivos y afirma que
  los dos empiezan por `'use server'`. Antes de esta tanda esa cláusula no iteraba nada (T15
  lo documentaba explícitamente como "TODAVÍA" sin archivos); ya no está infalseable.
- `tests/unit/inventario/schema/inventario-schema.test.ts` sigue verde: los dos archivos
  nuevos importan el barrel `@/lib/modules/inventario` en runtime (`InventarioError`, tipos)
  desde dentro de `lib/modules/inventario/`, así que quedan exentos de la regla "import type
  fuera de `lib/composition`" por la exención 2 (subrutas del propio módulo) — se confirmó
  corriendo el test, no se dio por hecho.
- No se corrió `pnpm test` completo, `./init.sh`, ni ningún test de integración: fuera del
  encargo de esta tanda.

## Veredicto

T12 cerrada: nueve operaciones expuestas como Server Actions en `adapters/driving/`, sin
ningún route handler nuevo, con el actor resuelto por `identity.getSessionUser()` y los
errores de dominio traducidos a estado serializable; las tres mutaciones obligatorias
confirmaron que las aserciones del test son reales, y la suite completa de `tests/unit/` +
`tests/ui/` queda en 49/482 verde.

---

# `app/api/` vacio: origen, correccion de una frase mia, y la leccion

## La frase imprecisa

El implementer afirmo al cerrar el Grupo C: **«No existe `app/api/`. Ningun route handler»**.
La primera mitad era **falsa**. El dato correcto:

> `app/api/` **existia en disco**, vacio y **sin versionar** (git no versiona directorios
> vacios), creado a las 12:27. **Ninguna** de las tres rutas del catalogo
> —`app/api/products`, `app/api/presentations`, `app/api/inventario`— estaba presente, que es
> lo que `tests/unit/inventario/scope.test.ts` comprueba. R29 y R34 se cumplian.

La conclusion era correcta; **la premisa que la sostenia, no**. Se corrige con el mismo criterio
que se aplico a `stripComments` y a `design.md > 5`: una conclusion correcta apoyada en un dato
falso se corrige igual, porque el siguiente que lea la premisa la va a usar.

## De donde salio: de nuestra propia comprobacion de falsabilidad

No es rastro de otra sesion. Lo dejo **esta feature**, en el Grupo A, al verificar que
`scope.test.ts` era falsable. Esta escrito mas arriba en esta misma bitacora:

| Asercion | Archivo temporal creado | Limpieza que se hizo |
| --- | --- | --- |
| `app/api/products` no existe | `app/api/products/route.ts` | `rm -rf app/api/products` |
| `app/api/presentations` no existe | `app/api/presentations/route.ts` | `rm -rf app/api/presentations` |
| `app/api/inventario` no existe | `app/api/inventario/route.ts` | `rm -rf app/api/inventario` |

Las tres limpiezas borraron **el hijo**, no **el padre**: `app/api/` quedo vacio. Y como git no
versiona directorios vacios, **`git status` salio limpio y nadie lo vio** — ni el implementer, ni
dos gates rapidos, ni el gate completo.

## La leccion, que es general y no de esta ficha

**Una comprobacion de falsabilidad tiene que deshacer TODA la ruta que creo, no solo la hoja**, y
**`git status` no es prueba suficiente de limpieza**: es ciego a los directorios vacios. Es el
mismo genero de punto ciego que la deuda del modo rapido —algo que ninguna herramienta del ciclo
mira— y por eso se anota aqui: en un repo cuyo test afirma «no hay rutas HTTP de catalogo», dejar
un `app/api/` vacio es una mina para el siguiente que lo abra.

**Corregido:** `rmdir app/api`. Verificado despues que `git status --short` sigue vacio y que las
tres rutas del catalogo siguen sin existir.
