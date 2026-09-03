# QC-43 — crud-de-proveedores · design.md

> Zona: `backend` · Complejidad: `high` · depends_on: `QC-42`, `QC-8` ·
> Rama: `feature/QC-43-crud-de-proveedores`
>
> El **qué** está en `requirements.md` (R1–R47) y su alcance lo cerró el humano el 2026-09-03 en
> la tabla de 17 decisiones. Aquí va el **cómo**: los **tres cambios de esquema** con su migración
> y su `down.sql`, de dónde sale el nombre del rol `Administrador` (**P1**), si la restricción de
> contacto se escribe solo para las filas vivas (**P2**, recomendación con su coste, la cierra el
> humano), la forma de los nueve casos de uso, los dos puertos, los dos adaptadores driven y las
> dos Server Actions.
>
> **Precedente literal: `specs/QC-20-crud-de-productos/`.** Es el mismo problema —CRUD de datos
> maestros con autorización en el service, paginación, Server Actions y errores con `code` estable—
> resuelto para `inventario`, y **`specs/QC-25-crud-de-recetas/`** lo repitió para `recetas` con
> una tabla padre y una tabla de líneas que cruza a `inventario`. **Este diseño no inventa nada
> donde esos dos ya decidieron**; cada vez que se aparta, lo dice y explica por qué.
>
> **El modelo ya existe y está mergeado.** QC-42 está `done`: `Supplier` y `SupplierCatalogLine`
> viven en `db/schema.prisma` con la migración
> `20260903131417_suppliers_and_supplier_catalog_lines`, y el módulo `proveedores` existe con su
> `index.ts`, su `domain/supplier-name.ts` y las tres carpetas vacías con `.gitkeep`. Esta ficha
> **no re-especifica el modelo**: lo consume, lo corrige en tres puntos y llena el armazón.

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | Se **añaden dos campos** a `SupplierCatalogLine`: `createdBy` / `updatedBy` escalares con sus dos `@@index`. Se actualizan los comentarios `///` que hoy dicen lo contrario. **No se toca `Supplier`** (sus dos `CHECK` no son modelables por Prisma) y **no se toca ningún otro modelo**. |
| `db/migrations/<ts>_supplier_contact_cost_and_line_audit/migration.sql` | UP: los **tres cambios** de § 2, escritos **enteros a mano** (Prisma no modela `CHECK`). |
| `…/down.sql` | DOWN manual (`docs/architecture.md > Migraciones up/down`). **Revierte al esquema exacto de QC-42** (R39). Sin él, `./init.sh` falla. |
| `lib/modules/proveedores/domain/*` | Actor y autorización, errores, página, esquemas `zod`, tipos de salida y **nueve casos de uso**. `supplier-name.ts` **ya existe (QC-42) y no se toca**. |
| `lib/modules/proveedores/ports/*` | `SupplierRepository`, `SupplierCatalogRepository`. Se **borra** `ports/.gitkeep`. |
| `lib/modules/proveedores/adapters/driven/persistence/*` | Implementación Prisma de los dos puertos. Único sitio del módulo que toca `@prisma/client`. Se **borra** `adapters/driven/.gitkeep`. |
| `lib/modules/proveedores/adapters/driving/*` | Dos archivos de Server Actions (R42). Se **borra** `adapters/driving/.gitkeep`. |
| `lib/modules/proveedores/index.ts` | Pasa de reexportar solo `normalizeSupplierName` a reexportar tipos, esquemas, errores y las nueve factories — **solo** de `./domain`. |
| `lib/composition/index.ts` | Gana la fachada `proveedores`, con los dos repositorios y el `ProductCatalog` **ya existente** de `inventario`. No se reordena ni se reformatea nada de lo que hay. |
| `tests/…` | Ver § 13. |

**No se toca `app/`, ni `components/`, ni `middleware.ts`, ni `e2e/`** (R47): la pantalla es QC-44.
**No se toca `lib/modules/inventario/**`**: su contrato ya publica lo que hace falta (§ 5.2).
**No se toca `lib/shared/pagination.ts`**: se consume tal cual (R45).

---

## 2. Los tres cambios de esquema

### 2.0 Por qué ahora, y por qué salen baratos

**Las dos tablas están vacías.** QC-42 fue esquema puro —su R35 prohibía cualquier operación— y
esta ficha es la primera que escribe en `suppliers` y `supplier_catalog_lines`; no hay seed que las
llene ni migración posterior que lo haya hecho. Eso convierte los tres cambios en tres `ALTER`
secos:

- **El `CHECK` de contacto que rechaza el blanco** no obliga a limpiar ningún proveedor antes de
  aplicarse. Con datos cargados, un `ADD CONSTRAINT` sobre una tabla que ya tiene un `phone = ''`
  **falla la migración entera** y hay que decidir a mano qué se hace con esas filas.
- **El costo estrictamente positivo** tampoco: con datos, cualquier línea a cero bloquearía el
  `ADD CONSTRAINT` y habría que borrarla o corregirla sin saber cuál era el precio real.
- **Las dos columnas de autor** nacen `NULL`-ables, así que ni siquiera con datos harían daño; lo
  que sí evita el catálogo vacío es la pregunta «¿quién fue el autor de las líneas anteriores?»,
  que no tiene respuesta y que en `products` (QC-20 § 2.1 b) obligó a dejar la columna anulable
  para siempre.

Esa es la razón por la que las tres se hacen **en esta ficha y no después**, y por eso está escrito
aquí: dentro de un mes ya no será verdad.

### 2.1 Cambio 1 — la restricción de contacto trata el blanco como ausencia (R12)

Hoy (QC-42) el `CHECK` solo mira ausencia de valor, así que `phone = ''` lo satisface:

```sql
CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL)
```

Se sustituye por su forma que trata el blanco como ausente. `btrim` es `IMMUTABLE`, así que es
legítima dentro de un `CHECK`:

```sql
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_contact_required";
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_contact_required"
  CHECK (COALESCE(btrim("phone"), '') <> '' OR COALESCE(btrim("email"), '') <> '');
```

El `COALESCE` no es adorno: sin él, un `phone` `NULL` hace que `btrim(NULL) <> ''` evalúe a `NULL`
y **un `CHECK` que evalúa a `NULL` se cumple**, con lo que la restricción dejaría pasar la fila sin
ningún contacto — exactamente el agujero que existe para tapar. Es el error más fácil de cometer
aquí y el test de sensibilidad de § 13 lo vigila.

El nombre de la restricción **no cambia** (`suppliers_contact_required`): es la misma regla, con
distinta definición. Renombrarla obligaría a QC-44 y a cualquier traductor de SQLSTATE a conocer
dos nombres para lo mismo.

#### P2 — ¿solo para las filas vivas? Recomendación, coste, y quién la cierra

**Este diseño recomienda la forma parcial, y la decisión es del humano al aprobar el spec.** Un
`CHECK` no admite `WHERE`; «solo para las filas vivas» se escribe metiendo el predicado dentro:

```sql
-- VARIANTE B (recomendada): la restriccion no alcanza a los proveedores dados de baja.
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_contact_required"
  CHECK ("deleted_at" IS NOT NULL
         OR COALESCE(btrim("phone"), '') <> ''
         OR COALESCE(btrim("email"), '') <> '');
```

| | Variante A (total, como hoy) | **Variante B (parcial, recomendada)** |
| --- | --- | --- |
| Proveedor vivo sin contacto | rechazado | rechazado |
| Vaciar el contacto de un proveedor **vivo** | rechazado | rechazado |
| Vaciar el contacto de un proveedor **dado de baja** | **imposible sin borrar la fila entera** | permitido |
| Pregunta abierta 8 de QC-42 | sigue abierta | **queda cerrada** |
| Coste de escribirla | — | **una línea más de SQL y un caso de test más** |

**Por qué se recomienda B.** El caso que hoy no se puede atender es real y no hipotético: una
solicitud de borrado de datos personales sobre un proveedor ya dado de baja obliga a elegir entre
violar la restricción o borrar físicamente la fila —que es justo lo que el borrado lógico existe
para evitar (`docs/architecture.md > Dominio` n.º 3)—. Como **esta ficha ya reescribe ese
`CHECK`**, hacerlo parcial no cuesta ninguna migración adicional; hacerlo después sí.

**Qué cuesta B, dicho entero.** (a) La invariante «todo proveedor tiene contacto» pasa a leerse
«todo proveedor **vivo** tiene contacto», y cualquier consulta futura que asuma lo primero se
equivoca; (b) si algún día hubiera una operación de restaurar —hoy **no la hay**, la decisión 6 lo
cierra—, podría devolver a la vida un proveedor sin contacto, y quien la escriba tendrá que
revalidar; (c) el test de integración gana un caso.

**R12 está escrito para no prejuzgarlo**: exige el rechazo para el proveedor **vivo**, que es lo
que las dos variantes cumplen. Si el humano elige A, el implementer añade el caso «tampoco se puede
vaciar el contacto de uno dado de baja»; si elige B, añade el contrario. **No se implementa
ninguna de las dos hasta que la aprobación del spec diga cuál** (regla 6 de `CLAUDE.md`).

### 2.2 Cambio 2 — el costo deja de admitir cero (R29)

```sql
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_cost_non_negative";
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_cost_positive"
  CHECK ("cost" > 0);
```

Aquí la restricción **sí se renombra**, y a propósito: `_non_negative` describiría mal lo que hace,
y el nombre viejo sobreviviendo a la nueva regla es exactamente el tipo de mentira que nadie
detecta leyendo el esquema. El test estático afirma que `supplier_catalog_lines_cost_non_negative`
**ya no existe** en el UP y que `_cost_positive` sí.

**`min_purchase` y `delivery_time` no se tocan**: siguen `>= 0` y siguen opcionales (decisión 5 de
QC-42, R30). Un mínimo de compra de cero es «sin mínimo pactado» expresado de forma redundante, no
un dato a medio escribir, y un plazo de entrega de cero días es «mismo día».

Consecuencia aceptada y ya escrita en la decisión: **una muestra gratis no se puede registrar como
línea de catálogo**.

### 2.3 Cambio 3 — la línea gana columnas de autor (R31, R32)

```prisma
model SupplierCatalogLine {
  // … lo que ya existe, sin tocar …
  createdBy String? @map("created_by") @db.Uuid
  updatedBy String? @map("updated_by") @db.Uuid

  @@index([createdBy], map: "supplier_catalog_lines_created_by_idx")
  @@index([updatedBy], map: "supplier_catalog_lines_updated_by_idx")
}
```

```sql
ALTER TABLE "supplier_catalog_lines" ADD COLUMN "created_by" UUID;
ALTER TABLE "supplier_catalog_lines" ADD COLUMN "updated_by" UUID;

-- FK REALES escritas A MANO: `created_by`/`updated_by` son escalares SIN `@relation`, igual que
-- en `suppliers` (QC-42 decision 14) y que en `products` (QC-20). La base garantiza la
-- integridad; el cliente Prisma NO puede atravesar de `proveedores` a `users` con un `include`,
-- y la guardia de modulos no detectaria ese cruce porque no es un import.
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "supplier_catalog_lines_created_by_idx" ON "supplier_catalog_lines"("created_by");
CREATE INDEX "supplier_catalog_lines_updated_by_idx" ON "supplier_catalog_lines"("updated_by");
```

Cuatro cosas que se heredan sin discusión de `suppliers` (QC-42 § 4.1) y de `products` (QC-20
§ 2.1), y una que es propia:

- **Escalares sin `@relation`.** Es la única forma de tener FK real y frontera de módulo a la vez.
  El coste asumido es el de siempre: Prisma no valida esas FK, el fallo llega en ejecución
  (SQLSTATE `23503`) y hay que protegerlas del drift a mano en cada migración futura.
- **`ON DELETE RESTRICT`, nunca `SET NULL`.** `SET NULL` convertiría «al usuario lo borraron» en
  «no lo creó una persona», que son cosas distintas.
- **Anulables.** `NULL` es «no lo creó una persona» —una importación, un seed—, no «se perdió el
  dato» (R32). La garantía de que toda escritura de la aplicación lleva autor es **del service**,
  no del esquema, y su test es de servicio (R31).
- **Índices sobre las dos columnas.** Postgres no indexa el lado hijo de una FK y por ahí pasa la
  verificación del `RESTRICT`.
- **Lo propio:** esto **se aparta de la decisión 14 de QC-42**, que dejó la línea sin auditoría
  heredando el criterio de `recipe_lines`. La decisión de hoy explica por qué: en una receta,
  editar una línea es editar la fórmula y el rastro queda en `recipes.updated_by`; aquí **subir el
  costo es un hecho comercial propio** que no modifica nada del proveedor. La alternativa de tocar
  `suppliers.updated_by` al editar una línea está descartada por el humano y consta en § 12.3.

### 2.4 Orden del UP

Contacto (`DROP` + `ADD`) → costo (`DROP` + `ADD` con nombre nuevo) → dos `ADD COLUMN` → dos FK a
mano → dos `CREATE INDEX`. El archivo abre con la **misma cabecera de aviso** que el de QC-42: todo
lo que hay dentro es drift para Prisma salvo los dos `ADD COLUMN` y los dos índices, y cualquier
migración futura sobre estas tablas hay que revisarla a mano.

### 2.5 `down.sql` (R39)

```sql
DROP INDEX IF EXISTS "supplier_catalog_lines_updated_by_idx";
DROP INDEX IF EXISTS "supplier_catalog_lines_created_by_idx";
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_updated_by_fkey";
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_created_by_fkey";
ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "updated_by";
ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "created_by";

ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_cost_positive";
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_cost_non_negative"
  CHECK ("cost" >= 0);

ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_contact_required";
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_contact_required"
  CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL);
```

Orden inverso al UP, y **las dos restricciones se vuelven a crear con su definición literal de
QC-42**: un `down.sql` que solo dropeara dejaría la base sin ninguna regla de contacto ni de
costo, que **no** es el esquema anterior. Es la diferencia entre «deshacer» y «revertir», y es lo
que R39 exige. Se verifica de verdad con el ciclo `db:migrate` → `db:rollback` → `db:migrate` (T16):
el test estático solo lee texto.

---

## 3. P1 — de dónde sale la constante del nombre del rol `Administrador`

**Es decisión técnica, así que la toma este `design.md`, y la respuesta es que el literal ya tiene
dueño y no es `inventario`.**

Lo verificado en el árbol de esta rama, no supuesto:

- `lib/modules/identity/domain/roles.ts` declara `ROLE_ADMINISTRADOR = 'Administrador'` y su
  comentario dice, literalmente, que es «el ÚNICO sitio del repo que escribe a mano los literales».
- **El contrato público de `identity` ya lo exporta**: `lib/modules/identity/index.ts` línea 17,
  `export { ROLE_ADMINISTRADOR, ROLE_OPERADOR, SEED_ROLES } from './domain/roles'`.
- El cierre de imports de ese barrel es **puro**: sus archivos de `domain/` solo importan `zod` y
  archivos propios. No arrastra `next/*`, ni Prisma, ni servidor.
- La regla de dependencias permite a `domain/` de un módulo importar **el barrel** de otro módulo
  (`docs/architecture.md > La regla de dependencias`, primera fila), y ya hay precedente vivo:
  `lib/modules/inventario/domain/product-catalog.ts` importa `@/lib/modules/unidades`.

**La decisión, entonces:**

```ts
// lib/modules/proveedores/domain/actor.ts
import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';   // barrel, NUNCA ruta profunda
```

`proveedores` **no declara ninguna constante propia** y **no importa nada de `inventario`** para
esto. Eso es lo que cierra R4 y lo que evita repetir el olor que QC-22 destapó: allí la regla
ruta→rol acabó tomando `ADMIN_ROLE_NAME` del barrel de **`inventario`**, y hubo que mover la lista
de reglas a `lib/composition` para que la guardia no chillara. Un rol es un concepto de `identity`;
tomarlo de un módulo de negocio es un accidente histórico —QC-20 D23 lo eligió cuando el contrato
de `identity` **todavía no exportaba la constante**, y QC-25 copió esa deuda escribiendo en
`recetas/domain/actor.ts` un comentario que hoy es falso—.

**Lo que esta ficha NO hace, y propone: cambio de alcance.** La salida limpia sería borrar las dos
copias locales y apuntar todo a `identity`. Eso toca **código de dos módulos ya mergeados y una
guardia**, y por tanto **no es de esta ficha**:

| Qué habría que tocar | Por qué no aquí |
| --- | --- |
| `lib/modules/inventario/domain/actor.ts` y su reexport en `index.ts` | `ADMIN_ROLE_NAME` es parte del **contrato público** de `inventario` hoy: lo consumen `lib/composition/route-role-rules.ts` y cuatro tests de `identity` e `inventario`. Quitarlo rompe la regla ruta→rol de QC-22, que ya pasó E2E. |
| `lib/modules/recetas/domain/actor.ts` y su reexport | Mismo caso, sin consumidores fuera del módulo, pero es código de otra feature. |
| `lib/composition/route-role-rules.ts` | Pasaría a importar el rol de `identity`, y ese archivo existe **precisamente** porque hoy lo importa de `inventario`. Puede que después de la migración ya no haga falta que viva en `composition`. |

**Propuesta para el leader:** ficha propia de arnés —«unificar el nombre del rol en `identity`»—
que haga los tres cambios de golpe con las guardias en verde. Mientras no exista, la deuda queda
**contenida**: `proveedores` nace ya del lado correcto y **no la aumenta**. Si el humano prefiere
que `proveedores` copie el literal como hicieron `inventario` y `recetas`, es una línea y R4 se
cumple igual — pero este diseño no lo recomienda: sería la tercera copia del mismo literal en un
repo que tiene el archivo que dice ser el único.

---

## 4. Estructura del módulo `proveedores`

```
lib/modules/proveedores/
  index.ts                                   # CONTRATO: solo reexporta de ./domain
  domain/
    supplier-name.ts                         # YA EXISTE (QC-42). NO SE TOCA.
    actor.ts                                 # Actor, requireAdmin (rol desde `identity`, § 3)
    errors.ts                                # ProveedoresError y sus clases (§ 6.4)
    page.ts                                  # Page<T>, PageQuery, pageQuerySchema
    supplier-input.ts                        # createSupplierSchema, updateSupplierSchema
    catalog-line-input.ts                    # createCatalogLineSchema, updateCatalogLineSchema
    supplier-view.ts                         # SupplierView, NewSupplier
    catalog-line-view.ts                     # CatalogLineView, NewCatalogLine
    create-supplier.ts  update-supplier.ts  delete-supplier.ts
    get-supplier.ts     list-suppliers.ts
    create-catalog-line.ts  update-catalog-line.ts
    delete-catalog-line.ts  list-catalog-lines.ts
  ports/
    supplier-repository.ts
    supplier-catalog-repository.ts
  adapters/
    driven/persistence/supplier-prisma.ts
    driven/persistence/supplier-catalog-line-prisma.ts
    driving/supplier-actions.ts
    driving/supplier-catalog-actions.ts
```

Cada caso de uso es una **factory** `createXxx(deps)` que devuelve la función, igual que en
`inventario` y en `recetas`. Es lo que permite testearlo con dobles del puerto sin tocar la base.
Los tres `.gitkeep` de QC-42 **se borran** al aparecer el primer archivo real de su carpeta (R44):
git no versiona carpetas vacías, pero tampoco carpetas con contenido y un `.gitkeep` sobrante.

**El contrato (`index.ts`)** conserva `normalizeSupplierName` y añade: los tipos (`Actor`,
`SupplierView`, `CatalogLineView`, `Page`), los esquemas `zod`, las clases de error y las **nueve
factories**. Nada de `'use server'`, nada de Prisma, nada de `next/*` en su cierre transitivo: QC-44
lo importará desde un componente de cliente. Los adaptadores driving **no pasan por el barrel**
(`docs/architecture.md > Modulos y arquitectura hexagonal`, excepción).

---

## 5. Autorización, actor y frontera con `inventario`

### 5.1 `requireAdmin`, primera línea de los nueve (R1, R2, R3)

```ts
// domain/actor.ts
import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { UnauthorizedError } from './errors';

export type Actor = { readonly id: string; readonly roleName: string | null };

export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.roleName !== ROLE_ADMINISTRADOR) throw new UnauthorizedError();
}
```

- **Antes de `zod` y antes de tocar ningún puerto.** El test que cierra R2 llama a cada caso de uso
  con un actor `Operador` y dobles que **fallan si los llaman**: así se demuestra «no llega al
  repositorio», que es lo que distingue una autorización real de un `if` decorativo.
- **Falla cerrado** (R3): `null`, `undefined`, rol nulo, vacío o desconocido → mismo rechazo.
  Igualdad exacta, sin `includes` ni normalización: `«Administradores externos»` no se cuela.
- **Consultar también pasa por aquí** (decisión 1): la lista, la ficha y el listado del catálogo
  llaman a `requireAdmin` igual que las mutaciones.
- La RLS de QC-42 sigue activa y forzada y **no autoriza nada**: Prisma se conecta como dueño de
  las tablas. Es defensa en profundidad (R6); el requisito lo cierra el test de servicio.

### 5.2 De dónde sale el actor (R5)

**Los casos de uso reciben el actor por parámetro y punto.** Quien lo resuelve es la Server Action:
pide el usuario al contrato ya cableado, `identity.getSessionUser()` desde `@/lib/composition`, y
construye `{ id, roleName }` con lo que devuelve `SessionUser`. La sesión real ya está cableada
desde QC-8 (`session-cookie.ts` + `session-user-prisma.ts`), así que el `id` que llega **existe en
`users`** y las FK de auditoría se satisfacen. La Server Action **no decide nada**: no vuelve a
comprobar el rol, no traduce reglas, no filtra.

### 5.3 Lo que `proveedores` sabe del producto (R26)

Por el contrato público, ya existente y **sin ampliarlo**:

```ts
import type { ProductCatalog, ProductId } from '@/lib/modules/inventario';   // SI
// import { prisma } from '@/lib/shared/db/prisma'; … prisma.product …        // NO
```

`ProductCatalog.findRefs(ids)` devuelve **solo productos vivos** —el adaptador
`product-catalog-prisma.ts` de `inventario` ya lo garantiza y tiene su test de integración desde
QC-25—, así que «no existe» y «está dado de baja» son **el mismo caso** para este módulo: el id
simplemente no vuelve. Eso es exactamente lo que R26 necesita y por eso **no hace falta ampliar el
contrato de `inventario`**.

Se pide **una sola vez por operación**, con la lista de ids, no una llamada por línea. En el
listado del catálogo, el `productName` de cada fila se resuelve con una única llamada con todos los
ids de la página; un producto dado de baja no vuelve y su `productName` sale `null` — **la línea
sigue apareciendo** (R37), mismo criterio que `recetas` (QC-25 R18).

---

## 6. Contratos de entrada y salida

Validación con **zod** en el borde (R41). Los esquemas viven en `domain/` y se reexportan por el
contrato, así que la Server Action y —mañana— el formulario de QC-44 validan con el **mismo**
esquema.

### 6.1 Proveedor

```ts
createSupplierSchema = {
  name:  string, trim, min 1, max 120,                      // R9, R10
         refine: normalizeSupplierName(name) !== ''         // R9
  phone: string, trim, max 40  | null | omitido             // R10, R13
  email: string, trim, max 160 | null | omitido             // R10, R13
}
.transform(v => ({ ...v, phone: blankToNull(v.phone), email: blankToNull(v.email) }))
.refine(v => v.phone !== null || v.email !== null)          // R11
updateSupplierSchema = createSupplierSchema                 // reemplazo completo (R14)
```

- **Los largos son la posición por defecto de este diseño, no una decisión del humano**: pregunta
  abierta **P6**. 120 el nombre replica QC-20 D11; 40 y 160 son cotas holgadas para un teléfono
  internacional y un correo. R10 apunta a **esta tabla**, no a los números, para que cambiarlos no
  renumere nada.
- **`blankToNull` antes del `refine`, no después** (R13): el orden importa. Si el `refine` mirara
  la cadena original, `phone: '   '` la pasaría, y llegaríamos a la base a que el `CHECK` nos
  rechazara con un `23514` que el usuario lee como error del sistema. El blanco se convierte en
  ausencia **en el borde**, y entonces la regla cruzada se evalúa sobre lo que de verdad se va a
  guardar.
- **Sin validación de formato de correo ni de teléfono** (decisión 9 de QC-42, heredada entera):
  ni `z.string().email()`, ni unicidad. Un proveedor químico da un correo de contacto comercial que
  no tiene por qué ser único ni parecerse a nada.
- **Reemplazo completo, no `PATCH`** (R14): con tres campos y una regla cruzada entre dos de ellos,
  un parche parcial obligaría a distinguir «campo ausente» de «campo puesto a nulo» y a reevaluar
  la regla contra el estado guardado. § 12.4.

**Salida** (`SupplierView`): `id`, `name`, `nameNormalized`, `phone`, `email`, `createdAt`,
`updatedAt`, `createdBy`, `updatedBy`. Los dos autores son **identificadores**, no nombres — mismo
criterio que QC-20 D20; quien necesite el nombre lo pide al contrato de `identity`, y eso es QC-44.
`deletedAt` **no sale**: toda consulta excluye los dados de baja (R22), así que sería siempre
`null`.

### 6.2 Línea de catálogo

```ts
createCatalogLineSchema = {
  supplierId:   uuid
  productId:    uuid
  cost:         decimal(14,4) como STRING, > 0               // R28
  minPurchase:  decimal(14,4) como STRING, >= 0 | null | omitido   // R30
  deliveryTime: int >= 0                    | null | omitido       // R30
}
updateCatalogLineSchema = { cost, minPurchase, deliveryTime }      // R33: sin supplierId ni productId
```

- **`cost` y `minPurchase` viajan como cadena, no como `number`.** El dominio no puede importar
  `@prisma/client` (R44) y `number` es coma flotante binaria, prohibida para importes
  (`docs/architecture.md > Anti-patrones`). Patrón de hasta 10 enteros y 4 decimales; el
  **adaptador driven** convierte a `Prisma.Decimal` y a la salida hace el camino inverso con
  `.toFixed(4)`. Es exactamente lo que hacen `inventario` y `recetas`.
- **`cost > 0` se valida aquí y en la base** (R28, R29). No es redundancia inútil: `zod` da el
  mensaje al usuario y la base cierra el camino de un `INSERT` por consola o un seed.
- **`deliveryTime` sigue sin cota superior** (pregunta abierta 3 del diseño de QC-42). No se le
  pone un techo arbitrario: sería un número inventado y una migración para cambiarlo.

**Salida** (`CatalogLineView`): `id`, `supplierId`, `productId`, `productName` (`string | null`,
§ 5.3), `cost`, `minPurchase`, `deliveryTime`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.

### 6.3 P5 — la pareja proveedor-producto es la identidad de la línea

`updateCatalogLineSchema` **no lleva `productId` ni `supplierId`**, y es la posición por defecto de
este diseño, no una decisión cerrada (**P5**). El motivo: la pareja está bajo índice único, así que
permitir cambiarla convierte cada edición en una posible colisión —hay que traducir el `23505` y
explicar al usuario que «ese producto ya está en el catálogo» en una pantalla de edición donde no
esperaba elegir producto— sin que ningún requisito lo pida. Cambiar de producto es **dar de baja la
línea y crear otra**, dos operaciones que ya existen. Si el humano decide lo contrario, R33 cambia,
`updateCatalogLineSchema` gana el campo y el puerto un parámetro; nada más.

### 6.4 Errores (R43)

Clases en `domain/errors.ts`, todas derivando de `ProveedoresError` con un `code` **estable**:

| Clase | `code` | Cuándo |
| --- | --- | --- |
| `UnauthorizedError` | `unauthorized` | R2, R3 |
| `NotFoundError` | `not_found` | proveedor o línea inexistente o dado de baja (R24) |
| `DuplicateNameError` | `duplicate_name` | nombre normalizado ya usado por un proveedor vivo (R15) |
| `DuplicateCatalogLineError` | `duplicate_catalog_line` | la pareja proveedor-producto ya existe (R27) |
| `ProductNotFoundError` | `product_not_found` | el producto no existe o está de baja (R26) |
| `ValidationError` | `invalid_input` | la entrada no pasa `zod` (R41) |

Se **lanzan**; la Server Action los traduce a `{ status: 'error', code, message }` para el
formulario de QC-44, usando **el `code` de la clase, nunca el texto** — así QC-44 puede decidir por
`code` y el mensaje puede cambiar de idioma sin romper nada. Nada de `catch` vacíos
(`docs/conventions.md`).

---

## 7. Puertos y adaptadores driven

```ts
// ports/supplier-repository.ts
export interface SupplierRepository {
  create(data: NewSupplier, actorId: string, now: Date): Promise<{ id: string } | 'duplicate'>;
  findAliveById(id: string): Promise<SupplierView | null>;
  updateAlive(id: string, data: NewSupplier, actorId: string, now: Date): Promise<'ok' | 'not_found' | 'duplicate'>;
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<boolean>;
  listAlive(query: PageQuery): Promise<Page<SupplierView>>;
}

// ports/supplier-catalog-repository.ts
export interface SupplierCatalogRepository {
  create(data: NewCatalogLine, actorId: string, now: Date): Promise<{ id: string } | 'duplicate' | 'supplier_not_found'>;
  updateTerms(id: string, data: CatalogLineTerms, actorId: string, now: Date): Promise<'ok' | 'not_found'>;
  deleteById(id: string): Promise<'deleted' | 'not_found'>;
  listBySupplierAlive(supplierId: string, query: PageQuery): Promise<Page<CatalogLineView> | 'supplier_not_found'>;
}
```

Claves, casi todas heredadas de QC-20 § 7:

- **`…Alive` en el nombre no es adorno**: el filtro `deleted_at IS NULL` es **del puerto**, no del
  dominio (R22, R36), y así ningún caso de uso puede olvidarlo. `listBySupplierAlive` es lo que
  hace verdadera la decisión 7: comprueba que el **proveedor** esté vivo antes de devolver sus
  líneas, aunque las líneas no tengan borrado lógico propio.
- **Resultados discriminados, no excepciones de Prisma.** El adaptador traduce los SQLSTATE:
  `23505` sobre `suppliers_name_unique` → `'duplicate'`; `23505` sobre
  `supplier_catalog_lines_supplier_id_product_id_key` → `'duplicate'`; `23503` → `'supplier_not_found'`
  al crear una línea con un proveedor inexistente. El dominio nunca ve un código de Postgres.
- **La unicidad se garantiza SOLO con el índice, sin comprobación previa** (R17, R27). Es la
  corrección que QC-20 se hizo a sí mismo en F2 (§ 11.4 de su `design.md`): un `SELECT` antes del
  `INSERT` es una carrera y no aporta ningún mensaje que el `'duplicate'` no dé ya. Por eso **los
  puertos no exponen ningún método de búsqueda por nombre ni por pareja**: la comprobación previa
  ni siquiera es expresable.
- **`deleteById` de la línea es un `DELETE` físico** (R34), y no contradice
  `docs/architecture.md > Anti-patrones`: la línea del catálogo **no es una tabla transaccional**
  —no mueve existencias ni dinero— y QC-42 la dejó a propósito sin `deleted_at` (su decisión 11),
  así que no hay dónde marcar una baja lógica. Es el mismo caso que `presentations` en QC-20 (D6).
- **El adaptador driven es el único sitio del módulo que importa `@prisma/client`**,
  `@/lib/shared/db/prisma` y `@/lib/shared/pagination`.

---

## 8. Paginación y orden (R18–R21, R35, R45)

Se consume `lib/shared/pagination.ts` **tal cual**, sin tocarlo: `DEFAULT_PAGE_SIZE = 10`,
`MAX_PAGE_SIZE = 25`, `toOffsetLimit`, `buildPage`. Quien lo llama es el **adaptador driven**,
porque `domain/` no puede importar `lib/shared/**`; el caso de uso valida la consulta con
`pageQuerySchema` (mínimo e integridad, R20) y delega. Es exactamente el reparto de QC-20 § 8.

`recetas` (QC-25) resolvió lo mismo **inyectando** `toOffsetLimit`/`buildPage` en el caso de uso
desde `lib/composition`. Aquí se sigue a `inventario` y no a `recetas`, y el porqué está en § 12.6.

**Orden estable (R21).** Proveedores: `name ASC, id ASC`. El desempate no es adorno: el nombre solo
es único **entre los vivos** y el listado excluye a los dados de baja, así que sobre el conjunto
consultado el nombre sí es único hoy — pero el desempate cuesta cero y protege de que mañana no lo
sea. Catálogo: **`product_id ASC` no sirve para ordenar una pantalla**; se ordena por
`created_at ASC, id ASC`, que es estable y no depende de datos de otro módulo. Ordenar por nombre
de producto exigiría un `join` a `products` — **prohibido**, cruza la frontera— o traer todo el
catálogo a memoria para ordenarlo, que es justo lo que la decisión 5 quiere evitar. Si QC-44 quiere
la pantalla ordenada por producto, ordena la página ya recibida; es una decisión de presentación.

---

## 9. Adaptadores driving: las dos Server Actions (R42)

`adapters/driving/supplier-actions.ts` y `adapters/driving/supplier-catalog-actions.ts`, ambos con
`'use server'`.

- **Mutaciones (`create`, `update`, `delete`) reciben `FormData`**, porque salen de un formulario:
  la acción extrae los campos, los pasa por el esquema `zod` y llama al caso de uso ya cableado en
  `@/lib/composition`. **Consultas (`get`, `list`) reciben argumentos ya tipados**: nadie las llama
  desde un `<form>`.
- **La acción no decide nada** (decisión 11): resuelve el actor con `identity.getSessionUser()`,
  traduce entrada y traduce resultado. Ni una regla de negocio, ni una segunda comprobación de rol.
- **Ningún route handler** (`docs/architecture.md > Server Actions vs Route Handlers`) y ningún
  `fetch` a una ruta propia. Una ruta API interna sería una superficie pública nueva que habría que
  proteger aparte.
- **`revalidatePath` no se llama aquí.** No hay ninguna ruta que revalidar todavía —esta ficha no
  crea pantallas (R47)—, y adivinar la ruta de QC-44 sería inventarla. QC-44 decide qué revalida.

---

## 10. Punto de composición

`lib/composition/index.ts` gana un **bloque nuevo al final**, sin reordenar ni reformatear lo que
hay (hay otras sesiones tocando este archivo):

```ts
const supplierRepository: SupplierRepository = { /* create, findAliveById, updateAlive, softDeleteAlive, listAlive */ };
const supplierCatalogRepository: SupplierCatalogRepository = { /* create, updateTerms, deleteById, listBySupplierAlive */ };

export const proveedores = {
  createSupplier: createCreateSupplier({ suppliers: supplierRepository }),
  updateSupplier: createUpdateSupplier({ suppliers: supplierRepository }),
  deleteSupplier: createDeleteSupplier({ suppliers: supplierRepository }),
  getSupplier:    createGetSupplier({ suppliers: supplierRepository }),
  listSuppliers:  createListSuppliers({ suppliers: supplierRepository }),
  createCatalogLine: createCreateCatalogLine({ catalog: supplierCatalogRepository, products: productCatalog }),
  updateCatalogLine: createUpdateCatalogLine({ catalog: supplierCatalogRepository }),
  deleteCatalogLine: createDeleteCatalogLine({ catalog: supplierCatalogRepository }),
  listCatalogLines:  createListCatalogLines({ catalog: supplierCatalogRepository, products: productCatalog }),
} as const;
```

**`productCatalog` ya está construido en ese archivo** (línea 192, `{ findRefs: findProductRefs }`,
lo trajo QC-25): se **reutiliza la constante existente**, no se crea una segunda. Es literalmente
lo que el `design.md` de QC-42 (§ 5.5) anticipó que haría esta ficha, con la única diferencia de
que `product-catalog-prisma.ts` ya existe porque QC-25 llegó antes.

---

## 11. Dependencias de terceros (R46)

**Ninguna dependencia nueva, y ninguna propuesta que abrir.** Todo lo que este diseño necesita está
instalado y registrado en `docs/dependencias.md`: `zod` (borde), `@prisma/client` (persistencia y
`Prisma.Decimal`), `vitest`. La paginación ya está escrita en `lib/shared/pagination.ts`, la
normalización del nombre en `domain/supplier-name.ts` (QC-42), y la aritmética decimal la resuelve
`Prisma.Decimal`.

Los cuatro checks de `docs/architecture.md > Dependencias de terceros` **no llegan a evaluarse**
porque no se propone ninguna librería. Dos candidatas que podrían parecerlo y no lo son:

| Candidata | Qué haría | Por qué no entra |
| --- | --- | --- |
| `libphonenumber-js` | Validar y normalizar el teléfono | **Aquí no se valida ningún formato de teléfono** (decisión 9 de QC-42, heredada). Solo se recorta y se exige no-blanco (R11, R13), que es `trim()` del estándar. Proponerla sería cambiar una decisión cerrada por la puerta de atrás. |
| `validator` / `z.string().email()` | Validar el correo | Mismo motivo: sin formato por decisión. `z.string().email()` ni siquiera sería dependencia nueva, y **aun así no se usa**. |

Si durante la implementación apareciera la tentación de instalar algo, **se para y se propone**, no
se instala (regla 7 de `CLAUDE.md`); `tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría
en rojo igualmente.

---

## 12. Alternativas descartadas

### 12.1 Dejar la restricción de contacto como está y cortar el blanco solo en `zod` — descartada por el humano

Era la **posición por defecto de QC-42** (su § 4.4, punto 1) y no habría requerido migración
ninguna. La decisión 2 la descarta: un `INSERT` por consola, un seed o una importación masiva se
saltan la validación de aplicación entera, y un proveedor con `phone = ''` es exactamente igual de
incontactable que uno con `phone = NULL`. Consta aquí para que nadie la «simplifique» de vuelta al
ver que `zod` ya lo cubre.

### 12.2 Dejar el costo en `>= 0` y rechazar el cero solo en `zod` — descartada por el humano

Mismo razonamiento y misma respuesta que 12.1. Además, la decisión 4 dice el porqué de negocio: un
cero casi siempre es un dato a medio escribir, y con el catálogo vacío el `ALTER` es gratis. El
precio, aceptado y escrito: **una muestra gratis no cabe como línea de catálogo**.

### 12.3 Registrar el autor del cambio de precio en `suppliers.updated_by` — descartada por el humano

Habría evitado las dos columnas y la migración: al editar una línea, se toca el `updated_by` del
proveedor. La decisión 3 la descarta por **imprecisa**: dice que alguien tocó *algo* del proveedor,
no **qué línea** ni **qué precio**. Con un catálogo de cientos de referencias, ese rastro no sirve
para la única pregunta que se quiere poder responder («¿quién subió este precio?»).

### 12.4 Edición parcial de la línea o del proveedor (`PATCH` campo a campo) — descartada

Permitiría formularios más pequeños. Se descarta en el proveedor porque la regla cruzada de
contacto **se evalúa sobre los tres campos a la vez**: un parche que solo trae `phone: null` obliga
a leer el `email` guardado para saber si la operación es legal, es decir, a mover la regla del
borde al service y a duplicarla. En la línea se descarta por el mismo motivo de siempre: distinguir
«no enviado» de «puesto a nulo» con tres campos opcionales es una fuente de bugs que ningún
requisito pide. Reemplazo completo, un solo esquema (§ 6.1, § 6.2).

### 12.5 Devolver las líneas dentro de la ficha del proveedor — descartada por el humano

Es lo natural de un agregado y ahorraría un caso de uso y una llamada. La decisión 5 la descarta:
un proveedor químico puede tener cientos de referencias, así que la ficha crecería sin cota y la
pantalla tendría que paginar en memoria lo que ya venía entero. Consta porque es lo que uno escribe
por reflejo al modelar «un proveedor tiene un catálogo».

### 12.6 Inyectar la paginación en el caso de uso, como hace `recetas` — descartada

QC-25 pasa `toOffsetLimit` y `buildPage` como dependencias del caso de uso desde `lib/composition`.
Es legítimo y tiene una ventaja real: hace testeables el defecto y el tope con un test **unitario**
del caso de uso. Se descarta aquí por tres motivos: (a) la decisión 5 dice explícitamente «el mismo
defecto y tope **que ya aplica `lib/shared/pagination`**», que es el reparto de QC-20; (b) el
defecto y el tope **ya tienen su test** en `tests/unit/pagination.test.ts` y volver a probarlos
desde `proveedores` sería probar la librería, no la feature; (c) añade dos claves a cada `deps` de
los dos listados sin que ninguna decisión lo pida. Lo que sí se verifica es que **se usa** el util y
no una copia (R45), con el test de alcance de T5 y con un caso de integración que pide `pageSize:
100` y recibe 25.

### 12.7 Ordenar el catálogo por nombre de producto — descartada

Es lo que la pantalla querrá. Exige un `join` a `products` desde el adaptador de `proveedores`
—cruce de frontera prohibido, y encima invisible para la guardia si se hiciera con `include`— o
traer el catálogo entero a memoria. Se ordena por `created_at ASC, id ASC` (§ 8) y QC-44 ordena la
página recibida si quiere.

### 12.8 Reactivar un proveedor dado de baja — descartada por el humano

Consta para que no se reconsidere: la decisión 6 la cierra. Es un caso de uso más y choca con que
el nombre único **solo mire a los vivos**, así que otro proveedor puede haber tomado ese nombre
mientras tanto y «restaurar» fallaría con un duplicado incomprensible.

### 12.9 Declarar las FK de auditoría de la línea con `@relation` — descartada

Es lo que Prisma empuja a hacer y daría `include` y tipos ligados. Regala el cruce de frontera que
QC-15 prohíbe y que **ninguna guardia detecta**: `prisma.supplierCatalogLine.findMany({ include: {
createdByUser: true } })` no contiene la cadena `prisma.user` ni ningún import prohibido. Es la
misma decisión que QC-42 tomó para `suppliers` y QC-20 para `products`, con el mismo coste asumido
(drift). El test de `Prisma.dmmf` que QC-42 dejó escrito (`module-contract.test.ts`) **ya vigila
esto** y hay que ampliarlo para que cubra las dos columnas nuevas.

---

## 13. Cómo se verifica

**Sin E2E, y con motivo** (decisión 8, R47): esta ficha es backend puro y no aporta ningún flujo
navegable; Playwright no tendría pantalla que abrir. Lo decide **QC-44**, igual que QC-22 lo decidió
para QC-20. **El diferimiento se declara aquí, no al final.**

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit (dominio) | `tests/unit/proveedores/authorization.test.ts` | R1, R2, R3, R4: los nueve casos de uso rechazan al no-administrador **sin tocar ningún puerto** (dobles que lanzan si los llaman), y el rol sale de la constante importada. |
| Unit (dominio) | `tests/unit/proveedores/supplier-service.test.ts` | R7, R8, R13, R14, R15, R16, R22, R23, R24 con dobles del puerto, incluida la traducción de `'duplicate'`/`'not_found'`. |
| Unit (dominio) | `tests/unit/proveedores/catalog-service.test.ts` | R25, R26, R27, R31, R33, R34, R35, R36, R37 con dobles del repositorio y del `ProductCatalog`. |
| Unit (borde) | `tests/unit/proveedores/supplier-input.test.ts` | R9, R10, R11, R13, R20, R41: los esquemas `zod`, con el orden `blankToNull` → `refine`. |
| Unit (borde) | `tests/unit/proveedores/catalog-line-input.test.ts` | R28, R30, R33, R41: costo `> 0`, mínimo y plazo, y que el esquema de edición **no** admite `productId`. |
| Unit (driving) | `tests/unit/proveedores/supplier-actions.test.ts` | R5, R42, R43: `FormData` en las mutaciones, actor de `identity`, traducción por `code`. |
| Unit (estático) | `tests/unit/proveedores/schema/proveedores-migration.test.ts` | R38, R39, R40: el SQL de los tres cambios, las dos FK a mano, los nombres en inglés, que **no hay ningún otro `ALTER`**, y que el `down.sql` **recrea** las dos restricciones de QC-42 con su definición literal. Con **tests de sensibilidad**: quitar el `COALESCE`, cambiar `>` por `>=`, cambiar un `RESTRICT` por `SET NULL`, dejar el `down.sql` solo con `DROP`. |
| Unit (alcance) | `tests/unit/proveedores/scope.test.ts` | R38, R45, R47: ninguna ruta, página ni componente de proveedores bajo `app/`, ningún route handler, ningún spec E2E nuevo, ninguna reimplementación de la aritmética de paginación, ningún `.gitkeep` sobrante y ningún cambio de esquema fuera de los tres. |
| Integración | `tests/integration/proveedores/supplier-crud.int.test.ts` | R7, R12, R15, R17, R19, R21, R22, R23 contra Postgres real. |
| Integración | `tests/integration/proveedores/catalog-line.int.test.ts` | R25, R27, R29, R32, R34, R36, R37 contra Postgres real. |
| Ciclo real | task T16 | R39 en su forma real: `db:migrate` → `db:rollback` → `db:migrate`, con la salida pegada en `progress/impl_QC-43-crud-de-proveedores.md`. |
| Guardia (ya existe) | `tests/guards/guard-arquitectura-modulos.test.ts` | R26 (parte), R44. |
| Guardia (ya existe) | `tests/guards/guard-rls-force.test.ts` | R6. |
| Guardia (ya existe) | `tests/guards/guard-dependencias-aprobadas.test.ts` | R46. |
| Unit (ya existe, se amplía) | `tests/unit/proveedores/module-contract.test.ts` | R26, R44: `Prisma.dmmf` sigue sin ninguna relación de `SupplierCatalogLine` hacia `Product` ni hacia `User` **pese a las dos columnas nuevas**. |

El mapa completo `R<n> → test` está en `tasks.md > Trazabilidad`.

**Cinco avisos para el implementer**, todos aprendidos en fichas anteriores:

- **Las tres reglas nuevas de base necesitan su test de integración propio** (R12, R29, R29/R32),
  y tiene que demostrar que **la base** las rechaza, no que `zod` las rechazó antes. Por la API
  tipada, **Prisma traduce el SQLSTATE a su propio código** antes de que llegue a `meta.code`: las
  operaciones que deben fallar van con `$executeRaw`, que además es el instrumento fiel al
  enunciado «en la propia base de datos».
- Se afirma sobre el **SQLSTATE** (`23502`, `23503`, `23505`, `23514`), **nunca** sobre el texto del
  mensaje: en esta máquina Postgres responde en español.
- El `beforeAll` debe fallar con un mensaje claro («corre `pnpm run db:migrate`») si falta la
  columna `created_by` de la línea, no reventar a mitad del primer caso. Los tests necesitan
  **productos** y **usuarios** reales creados dentro de la transacción, con `ROLLBACK` al final.
- El test de R2 tiene que demostrar **que no se llega al repositorio**: doble que registra la
  llamada y `expect(...).not.toHaveBeenCalled()`. Un doble permisivo dejaría pasar una autorización
  puesta después de la consulta.
- Un test de RLS escrito con Prisma sale verde pase lo que pase (se conecta como dueño). No se
  escribe: R6 lo cierra la guardia estática sobre el SQL.

---

## 14. Preguntas abiertas que deja este diseño

Las cuatro de `requirements.md` no se repiten aquí. **P1 queda respondida en § 3** —con una
propuesta de cambio de alcance que **no ejecuta esta ficha**— y **P2 queda con recomendación
escrita en § 2.1, para que la cierre el humano al aprobar el spec**. Las dos que este diseño abre
—**P5** (§ 6.3) y **P6** (§ 6.1)— están escritas en `requirements.md > Preguntas abiertas` con su
posición por defecto; ninguna bloquea la implementación y las dos son de una línea de `zod`.

Una más, propia y menor: **el catálogo se ordena por antigüedad, no por producto** (§ 8). No es
ambigüedad del enunciado sino consecuencia de la frontera de módulo, y está anotada por si QC-44
descubre que necesita otra cosa.
