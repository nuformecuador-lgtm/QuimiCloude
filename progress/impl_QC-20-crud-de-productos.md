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
