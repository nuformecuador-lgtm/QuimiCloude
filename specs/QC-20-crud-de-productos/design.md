# QC-20 — crud-de-productos · design.md

> Zona: `backend` · Complejidad: `high` · depends_on: `QC-14`, `QC-8` ·
> Rama: `feature/QC-20-crud-de-productos`
>
> El **qué** está en `requirements.md` (R1–R37) y su alcance lo cerró el humano el 2026-09-02:
> 18 decisiones en la acotación, más **D19–D23**, que cerró ese mismo día las cinco preguntas
> que abrió este diseño (§ 10). Aquí va el **cómo**: qué archivos nacen, qué columnas añade la
> migración, cómo se resuelve la FK que cruza la frontera de módulo, qué entra y sale de cada
> caso de uso y qué alternativas se descartaron. **No queda ninguna pregunta abierta.**
>
> **El modelo ya existe.** QC-14 está `done` y mergeado: `Product` y `Presentation` viven en
> `db/schema.prisma` con su migración `20260902005510_products_and_presentations`. Esta ficha
> **no re-especifica el modelo**: lo consume y le añade las tres columnas que las decisiones D7
> y D13 exigen.
>
> **La forma del módulo ya está fijada.** QC-15 y QC-7 dejaron `identity` construido
> (`domain/` + `ports/` + `adapters/driven|driving/` + contrato + `lib/composition/`). Aquí se
> copia esa forma para `inventario`, no se inventa otra.

---

## 1. Qué construye esta feature, y qué archivos toca

`lib/modules/inventario/index.ts` es hoy un *slot* con `export {}` (lo sembró QC-15, QC-14 lo
dejó intacto a propósito). **Esta feature es la que le da contenido.**

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | Se **añaden tres campos**: `createdBy`/`updatedBy` en `Product` y `nameNormalized` + `@@unique` en `Presentation`. No se toca ningún modelo de `identity`. |
| `db/migrations/<ts>_product_audit_and_presentation_uniqueness/migration.sql` | UP: dos `ADD COLUMN` + dos FK a `users` escritas a mano, una `ADD COLUMN` con backfill + `SET NOT NULL` + índice único. |
| `…/down.sql` | DOWN manual (convención propia, `docs/architecture.md > Migraciones up/down`). |
| `lib/shared/pagination.ts` | Util de paginación. **Hoja del grafo**: no importa módulos ni `composition` (R27). |
| `lib/modules/inventario/domain/*` | Actor y autorización, errores, esquemas zod de entrada, tipos de salida y **nueve casos de uso**. |
| `lib/modules/inventario/ports/*` | `ProductRepository`, `PresentationRepository`. |
| `lib/modules/inventario/adapters/driven/persistence/*` | Implementación Prisma de los dos puertos. Único sitio del módulo que toca `@prisma/client`. |
| `lib/modules/inventario/adapters/driving/*` | Server Actions (R29). |
| `lib/modules/inventario/index.ts` | Contrato público: pasa de `export {}` a reexportar **solo** de `./domain`. |
| `lib/composition/index.ts` | Se **añade** la fachada `inventario` junto a la ya existente `identity`. No se toca el cableado de `identity`. |
| `tests/…` | Ver § 12. |

**No se toca `app/`, ni `components/`, ni `middleware.ts`** (R34): la pantalla es QC-22.

---

## 2. Modelo de datos: lo único que cambia

### 2.1 Auditoría en `products` (D7, D8 → R6, R7, R8)

```prisma
model Product {
  // … lo que ya existe, sin tocar …
  createdBy      String?   @map("created_by") @db.Uuid
  updatedBy      String?   @map("updated_by") @db.Uuid
}
```

Dos cosas que **no** son evidentes y son el corazón de esta sección:

**a) Son campos escalares, sin `@relation` de Prisma. La FK existe solo en el SQL.**
Es deliberado y es la respuesta a «cómo se respeta QC-15 con una FK que cruza la frontera de
módulo». Declarar la relación en Prisma obligaría a añadir campos de vuelta en el modelo `User`
(`productsCreated Product[]`), que pertenece a `identity`, y —peor— habilitaría
`prisma.product.findMany({ include: { createdByUser: true } })` desde el adaptador de
`inventario`: una lectura de `users` desde otro módulo que la guardia **no** detecta, porque
busca `prisma.<modelo>` y ahí no aparecería la cadena `prisma.user`. Con el campo escalar, el
ORM no puede atravesar hacia `users` ni por accidente.

Coste asumido, y hay que decirlo: una FK que no está en el esquema es **drift** para Prisma, y
un `migrate dev` futuro puede querer borrarla. Es exactamente la misma situación que los cuatro
`CHECK` y los `ALTER` de RLS de QC-14 y los tres índices funcionales de QC-4, y se trata igual:
cabecera de aviso en el `migration.sql` y un test estático que afirma que las dos FK están en el
SQL (§ 12).

**b) Son anulables en la base, y el service las escribe siempre.**
`products` es una tabla ya creada y aplicada; un `ADD COLUMN … NOT NULL` sin defecto falla si
hay una sola fila, y no existe ningún «usuario del sistema» al que apuntar en el backfill
—inventarlo sería inventar dominio—. Así que la columna admite `NULL` para las filas anteriores
a esta feature, y **la garantía de R6 es del service**: todo alta y toda modificación escriben
el actor. El test que cierra R6 es de servicio, no de esquema (§ 12). Alternativa descartada en
§ 11.2.

**Qué se guarda, y por dónde se pide el nombre del autor (D8, R8).** Se guarda **el
identificador del usuario, y nada más**: ni el nombre, ni el correo, ni una copia
desnormalizada. `inventario` no consulta `users` en ninguna forma —ni `prisma.user`, ni
`$queryRaw` sobre `users`, ni `include`—. Cuando alguien necesite el **nombre** del autor (será
QC-22, no esta ficha), la vía es **el contrato público `@/lib/modules/identity`**, importado
como barrel; nunca `@/lib/modules/identity/adapters/...`, nunca su repositorio, nunca su tabla.
Ese contrato **todavía no expone** un caso de uso de «nombres por identificador», y esta ficha
**no lo añade**: D20 lo cerró —el listado devuelve solo los ids— y añadirlo es alcance de
`identity` y de QC-22 (§ 10.2).

### 2.2 Unicidad normalizada en `presentations` (D12, D13 → R17, R18, R19, R20)

```prisma
model Presentation {
  // … lo que ya existe, sin tocar …
  nameNormalized String @map("name_normalized")

  @@unique([nameNormalized], map: "presentations_name_normalized_key")
}
```

Aquí sí se usa `@@unique` de Prisma —a diferencia de los índices de `users`, que son
funcionales y parciales y Prisma no los modela—: es un índice único corriente sobre una columna
corriente, así que el esquema puede declararlo y el implementer no tiene que escribirlo a mano.

**La normalización se calcula en el dominio, en TypeScript, y se persiste.** Función pura en
`domain/presentation-name.ts`:

1. `trim()` (R9);
2. `toLowerCase()`;
3. `normalize('NFD')` y borrado de las marcas diacríticas (`\p{Diacritic}`) → «Bidón» → «bidon»;
4. borrado de todo lo que no sea `[a-z0-9]` → «BIDON-20L» → «bidon20l».

Las tres del enunciado de D12 —«Bidón 20 L», «bidon 20 l», «BIDON-20L»— colapsan en `bidon20l`.

**Si el resultado queda vacío, el nombre es inválido** (D22, R37). Un `«---»` normaliza a la
cadena vacía; sin esta regla, dos nombres distintos de solo signos colisionarían en el índice
único y el usuario recibiría un «ya existe» incomprensible. Se comprueba en el **esquema zod**
(§ 6.2), o sea antes de tocar la base, y el error es de nombre inválido, no de duplicado.

**Backfill de la columna en la migración.** La columna nace `NOT NULL`, así que hay que rellenar
las filas existentes. El SQL replica los mismos cuatro pasos sin extensiones ni dependencias:

```sql
ALTER TABLE "presentations" ADD COLUMN "name_normalized" TEXT;
UPDATE "presentations"
SET "name_normalized" = regexp_replace(
  translate(lower(btrim("name")),
            'áàäâãéèëêíìïîóòöôõúùüûñç',
            'aaaaaeeeeiiiiooooouuuunc'),
  '[^a-z0-9]', '', 'g');
ALTER TABLE "presentations" ALTER COLUMN "name_normalized" SET NOT NULL;
CREATE UNIQUE INDEX "presentations_name_normalized_key" ON "presentations"("name_normalized");
```

Dos avisos honestos:

- `translate` con una lista fija cubre **menos** que `\p{Diacritic}` en JavaScript (p. ej. no
  toca alfabetos no latinos). Es asimetría aceptada y **acotada al backfill**: a partir de la
  migración, toda escritura pasa por el service, que usa la función de TypeScript. Se acepta
  porque `presentations` no tiene todavía ninguna fila creada por la aplicación —QC-14 fue
  esquema puro y R23 de QC-14 prohibía cualquier operación—.
- Si en alguna base hubiera duplicados previos, **el `CREATE UNIQUE INDEX` falla y la migración
  no se aplica**. Es el comportamiento correcto: mejor parar que decidir en silencio cuál de los
  duplicados sobrevive.

No se usa `unaccent()`: es una extensión que hay que instalar, y su función **no es `IMMUTABLE`**
por defecto, así que ni siquiera serviría dentro de una columna generada o un índice sin
envolverla. Ver § 11.3.

### 2.3 Lo que NO cambia

`products.name` sigue **sin** ningún índice único, ni total, ni parcial, ni funcional (D14, R12):
la decisión 6 de QC-14 no se deroga. `presentations` sigue **sin** `deleted_at` (D6): es lo que
permite que `ON DELETE RESTRICT` bloquee el borrado, y por eso el borrado de presentación es
físico. No se cambia el tipo de ninguna columna de nombre (D11, R11): los límites 120/60 viven
solo en zod. No se toca RLS —ya está `ENABLE` + `FORCE` desde QC-14 (R4)— y no se crea ninguna
policy.

### 2.4 `down.sql` (R32)

```sql
DROP INDEX IF EXISTS "presentations_name_normalized_key";
ALTER TABLE "presentations" DROP COLUMN IF EXISTS "name_normalized";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_updated_by_fkey";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_created_by_fkey";
ALTER TABLE "products" DROP COLUMN IF EXISTS "updated_by";
ALTER TABLE "products" DROP COLUMN IF EXISTS "created_by";
```

Orden inverso al UP. Se verifica de verdad con el ciclo `db:migrate` → `db:rollback` →
`db:migrate` (task T13): `down.sql` es convención propia y nadie lo prueba por ti
(`docs/verification.md > Datos`).

---

## 3. Estructura del módulo `inventario`

```
lib/modules/inventario/
  index.ts                                  # CONTRATO: solo reexporta de ./domain
  domain/
    actor.ts                                # Actor, ADMIN_ROLE_NAME, requireAdmin
    errors.ts                               # InventarioError y sus clases
    page.ts                                 # Page<T>, PageQuery, pageQuerySchema
    presentation-name.ts                    # normalizePresentationName (funcion pura)
    product-input.ts                        # createProductSchema, updateProductSchema
    presentation-input.ts                   # createPresentationSchema, updatePresentationSchema
    create-product.ts   update-product.ts   delete-product.ts
    list-products.ts    get-product.ts
    create-presentation.ts  update-presentation.ts
    delete-presentation.ts  list-presentations.ts
  ports/
    product-repository.ts
    presentation-repository.ts
  adapters/
    driven/persistence/product-prisma.ts
    driven/persistence/presentation-prisma.ts
    driving/product-actions.ts
    driving/presentation-actions.ts
```

Cada caso de uso es una **factory** `createXxx(deps)` que devuelve la función, igual que
`createVerifyCredentials` en `identity`. Es lo que permite testearlo con dobles del puerto sin
tocar la base, y es donde vive la decisión (R31): el adaptador driving solo traduce entrada y
salida.

**El contrato (`index.ts`)** reexporta: los tipos (`Actor`, `Product`, `Presentation`, `Page`),
los esquemas zod, `normalizePresentationName`, las clases de error y las nueve factories. Nada
de `'use server'`, nada de Prisma, nada de `next/*` en su cierre transitivo —debe poder
importarse desde un componente de cliente (QC-22 lo hará)—.

---

## 4. Autorización (D2 → R1, R2, R3)

```ts
// domain/actor.ts
export const ADMIN_ROLE_NAME = 'Administrador';

export type Actor = { readonly id: string; readonly roleName: string | null };

export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.roleName !== ADMIN_ROLE_NAME) throw new UnauthorizedError();
}
```

- **Primera línea de los nueve casos de uso**, antes de zod y antes de tocar ningún puerto. El
  test que cierra R2 llama al caso de uso con un actor `Operador` y un doble del puerto que
  **falla si lo llaman**: así se demuestra «no llega al repositorio», que es la parte que
  distingue una autorización real de un `if` decorativo.
- **Falla cerrado** (R3): `null`, `undefined`, rol vacío o rol desconocido → mismo rechazo. La
  comparación es de igualdad exacta, sin `includes` ni normalización: un rol llamado
  `«Administradores externos»` no debe colarse.
- **Consultar también pasa por aquí** (D2): las dos listas y la ficha llaman a `requireAdmin`
  igual que las mutaciones. Es lo que hace que el Operador ni siquiera vea el catálogo.
- La RLS de QC-14 sigue activa y forzada, y **no autoriza nada**: Prisma se conecta como dueño
  de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`). Es defensa en
  profundidad; el requisito lo cierra el test de servicio.
- `ADMIN_ROLE_NAME` vive en `inventario/domain/actor.ts`, propia (**D23**). Los roles son dominio
  de `identity`, pero su contrato aún no exporta ninguna constante (QC-6 está `spec_ready`).
  Cuando la exporte, se importa del **barrel** `@/lib/modules/identity` —nunca por ruta
  profunda— y se borra la local. Duplicar el literal hoy es deuda consciente y de una línea.

---

## 5. De dónde sale el actor: el adaptador driving y QC-8 (D17 → R1)

**Los casos de uso reciben el actor por parámetro y punto.** No leen cookies, ni `next/headers`,
ni la sesión. Eso los hace testeables sin framework y es lo que dice D17.

Quien lo resuelve es el adaptador driving. **No se inventa ningún lector de sesión**: la Server
Action pide el usuario al contrato ya cableado, `identity.getSessionUser()` desde
`@/lib/composition`, y construye `{ id, roleName }` con lo que recibe —`SessionUser` ya trae
`id` y `roleName`, congelados desde QC-8/feature 8—.

Y hay que decir lo que eso significa **hoy**: `getSessionUser` está cableado al **stub** de QC-7
(`adapters/driven/session/session-stub.ts`), que devuelve un usuario fijo con `id:
'placeholder-user'` y rol `Administrador`. Consecuencias, escritas para que nadie se lleve una
sorpresa:

- Las Server Actions de esta ficha **no son un flujo utilizable** hasta que QC-8 sustituya ese
  proveedor. Con el stub, una mutación pasa la autorización pero **muere en la FK** de R7,
  porque `placeholder-user` no es un usuario real. Falla cerrado, que es la dirección correcta.
- Por eso **los requisitos los cierran los tests de los casos de uso con actores explícitos**, no
  los de las Server Actions. Las acciones se testean por lo suyo: que traducen la entrada, que
  propagan el rechazo y que llaman al caso de uso con el actor que les dio `identity`.
- QC-8 no tendrá que tocar `inventario`: cambia el cableado en `lib/composition/index.ts` y ya.

> **Corrección (F2, Grupo C, 2026-09-02).** Todo el párrafo de arriba describe el estado del
> repo cuando se escribió el diseño, y **ese estado ya no existe**. Verificado en el árbol tras
> mergear `origin/dev`:
>
> - **`session-stub.ts` no existe** en ninguna parte de `lib/` (`find lib -name "session-stub*"`
>   no devuelve nada).
> - **QC-8 está `done`** en `feature_list.json`, igual que QC-7.
> - `lib/composition/index.ts` cablea la **sesión real**: `session-cookie.ts` para leer las
>   claims y `session-user-prisma.ts` para resolver el usuario activo.
>
> **Lo que cambia respecto a lo escrito:** ya no es cierto que una mutación «pase la
> autorización pero muera en la FK de R7 porque `placeholder-user` no es un usuario real». Con
> la sesión real, `getSessionUser()` devuelve el `id` de un usuario **que existe en `users`**,
> así que la FK de auditoría se satisface y **las Server Actions de esta ficha sí son un flujo
> utilizable** en cuanto haya pantalla (QC-22).
>
> **Lo que NO cambia, y es lo importante:** la predicción de fondo del diseño se cumplió tal
> cual. **QC-8 no tuvo que tocar `inventario`**: sustituyó el proveedor en `lib/composition` y
> nada más. Los casos de uso siguen recibiendo el actor **por parámetro** (R1, D17) y siguen sin
> leer sesión, cookie ni cabecera —lo vigila
> `tests/unit/inventario/authorization.test.ts` › `cada caso de uso recibe el actor por
> parametro y no lee ninguna sesion`—. El diseño acertó; solo caducó su foto del entorno.

---

## 6. Contratos de entrada y salida

Validación con **zod** en el borde (D18, R28). Los esquemas viven en `domain/` y se reexportan
por el contrato, así que la Server Action y —mañana— el formulario de QC-22 validan con el
**mismo** esquema.

### 6.1 Producto

```ts
createProductSchema = {
  name:           string, trim, min 1, max 120        // R9, R11
  presentationId: uuid
  stock:          int >= 0            | null | omitido
  cost:           decimal(14,4) como STRING | null | omitido
  minPurchase:    int >= 0, por defecto 0
  deliveryTime:   int >= 0            | null | omitido  // R10
  qtyAlert:       int >= 0            | null | omitido
  unit:           string trim         | null | omitido
}
updateProductSchema = createProductSchema  // reemplazo completo, ver abajo
```

- **`cost` viaja como cadena, no como `number`.** El dominio no puede importar `@prisma/client`
  (R31) y `number` es coma flotante binaria, prohibida para importes
  (`docs/architecture.md > Dominio` n.º 4). Se valida con un patrón de hasta 10 enteros y 4
  decimales y el **adaptador driven** es quien lo convierte a `Prisma.Decimal`; a la salida hace
  el camino inverso con `.toFixed(4)`. Es el aviso que QC-14 dejó escrito para esta ficha.
- **`deliveryTime` se valida `>= 0` aquí** porque la base no tiene `CHECK` para él (decisión 4
  del leader en QC-14, pregunta abierta 4 de su design). Esta ficha cierra el agujero **en la
  aplicación**, tal como dice D10: no se añade el `CHECK`, que no está en el alcance.
- Los límites 120/60 son **solo de zod** (D11, R11): ninguna columna cambia de tipo.
- La edición es un **reemplazo completo** del conjunto de campos de negocio, no un parche por
  campos sueltos: `stock` incluido (D3, R13). Un `PATCH` parcial exigiría distinguir «campo
  ausente» de «campo puesto a nulo», y con cinco campos opcionales eso es una fuente de bugs sin
  ningún requisito que lo pida.

**Salida** (`ProductView`): `id`, `name`, `presentationId`, `presentationName`, `stock`, `cost`
(cadena o `null`), `minPurchase`, `deliveryTime`, `qtyAlert`, `unit`, `createdAt`, `updatedAt`,
`createdBy`, `updatedBy`. Los dos últimos son **identificadores**, no nombres (§ 2.1, pregunta
abierta 2). `presentationName` sale de un `join` dentro del **mismo** módulo, que es legítimo.

### 6.2 Presentación

```ts
createPresentationSchema = {
  name: string, trim, min 1, max 60,                       // R9, R11
         refine: normalizePresentationName(name) !== ''    // R37 (D22)
}
updatePresentationSchema = { name: … }                     // idem
```

Salida: `id`, `name`, `nameNormalized`, `createdAt`, `updatedAt`.

### 6.3 Consulta paginada

```ts
pageQuerySchema = { page: int >= 1 (por defecto 1), pageSize: int >= 1 opcional }  // R25
Page<T> = { items: readonly T[]; total: number; page: number; pageSize: number; totalPages: number }
```

El **mínimo y la integridad** los rechaza zod aquí (R25); el **defecto de 10** (R24) y el **tope
de 25** (R36, D21) los aplica el util de `lib/shared/` (§ 8). El `pageSize` que sale en el `Page`
es el efectivo —ya acotado—, no el que pidió el llamante.

### 6.4 Errores

Clases en `domain/errors.ts`, todas derivando de `InventarioError` con un `code` estable:
`UnauthorizedError` (`unauthorized`), `NotFoundError` (`not_found`), `DuplicateNameError`
(`duplicate_name`), `PresentationInUseError` (`presentation_in_use`), `ValidationError`
(`invalid_input`). Se lanzan; la Server Action los traduce a un estado serializable
`{ status: 'error', code, message }` para el formulario de QC-22 —mismo patrón que
`LoginFormState` en QC-7—. Nada de `catch` vacíos (`docs/conventions.md`).

---

## 7. Puertos y adaptador driven

```ts
// ports/product-repository.ts
export interface ProductRepository {
  create(data: NewProduct, actorId: string, now: Date): Promise<{ id: string }>;
  findAliveById(id: string): Promise<ProductView | null>;
  updateAlive(id: string, data: NewProduct, actorId: string, now: Date): Promise<boolean>;
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<boolean>;
  listAlive(query: PageQuery): Promise<Page<ProductView>>;
}

// ports/presentation-repository.ts
export interface PresentationRepository {
  create(name: string, nameNormalized: string): Promise<{ id: string } | 'duplicate'>;
  rename(id: string, name: string, nameNormalized: string): Promise<'ok' | 'not_found' | 'duplicate'>;
  deleteById(id: string): Promise<'deleted' | 'not_found' | 'in_use'>;
  list(query: PageQuery): Promise<Page<PresentationView>>;
}
```

Claves del diseño de los puertos:

- **`…Alive` en el nombre no es adorno**: el filtro `deleted_at IS NULL` es del puerto, no del
  dominio (R16), igual que `findActiveByUsername` en `identity`. Así ningún caso de uso puede
  olvidarlo, y no hay ninguna operación de listar borrados ni de restaurar (D5).
- **Los resultados son discriminados, no excepciones de Prisma.** El adaptador traduce los
  SQLSTATE a esas cadenas: `23505` (unique violation) → `'duplicate'`, `23503` (foreign key
  violation) al borrar una presentación → `'in_use'`. El dominio nunca ve un código de Postgres,
  y la garantía de R20 sigue siendo del índice: la comprobación previa por `nameNormalized` es
  una cortesía para dar buen mensaje, **el índice es lo que cierra la carrera** entre dos altas
  simultáneas.
- **`23503` al crear/editar un producto** (autor o presentación inexistente) se traduce a
  `NotFoundError`/`ValidationError` según la columna, y es lo que hace observable R7.
- El adaptador driven es el **único** sitio del módulo que importa `@prisma/client` y
  `@/lib/shared/db/prisma`, y el único que llama a `lib/shared/pagination`.

---

## 8. El util de paginación (D16 → R27)

`lib/shared/pagination.ts`. **Hoja del grafo**: solo importa paquetes npm y otros
`lib/shared/**` (hoy, nada). No conoce `inventario` ni ningún otro módulo, y por eso sirve para
cualquier CRUD futuro.

```ts
export const DEFAULT_PAGE_SIZE = 10;   // D15, R24
export const MAX_PAGE_SIZE = 25;       // D21, R36

export function toOffsetLimit(page: number, pageSize?: number): { offset: number; limit: number };
export function buildPage<T>(items: readonly T[], total: number, page: number, pageSize: number): Page<T>;
```

- `toOffsetLimit` aplica el defecto de 10 (R24) y **acota** el tamaño a `MAX_PAGE_SIZE = 25`
  (D21, R36) en vez de rechazarlo: rechazar es trabajo de zod en el dominio (R25, mínimo y
  entero), acotar es aritmética defensiva contra la consulta sin límite. El `limit` que llega a
  Prisma es el **acotado**, y el `pageSize` que devuelve `buildPage` es ese mismo, no el que pidió
  el llamante: si dijera 500 y devolviera 25 elementos, `totalPages` mentiría.
- `buildPage` calcula `totalPages` con `Math.ceil(total / pageSize)` y devuelve `1` cuando no hay
  ningún elemento —una lista vacía es una página vacía, no cero páginas—.

**Detalle de capas que hay que entender antes de tocarlo:** `domain/` **no puede** importar
`lib/shared/**` (`docs/architecture.md > La regla de dependencias`). Por eso el caso de uso
valida la consulta con zod y **delega**, y quien llama al util es el **adaptador driven**, que sí
puede. La decisión D16 y la regla de QC-15 encajan exactamente así y no de otra forma; el tipo
`Page<T>` se declara en `domain/page.ts` (es contrato de salida del módulo) y el util lo produce
estructuralmente, sin importarlo.

**Orden estable (R26, R35, D19):** el adaptador ordena por `name ASC, id ASC`. Sin el desempate
por `id`, dos productos homónimos —que D14 permite explícitamente, porque el nombre del producto
no es único— pueden intercambiarse entre dos consultas y un elemento aparecería dos veces o
ninguna. El desempate es lo que convierte «ordenado» en «estable», que es lo que R26 exige.

---

## 9. Dependencias de terceros

**Ninguna nueva** (D18 última fila, R33). Lo que esta feature necesita ya está instalado y
registrado en `docs/dependencias.md`: `zod` (validación de borde), `@prisma/client` (persistencia
y `Prisma.Decimal`), `vitest`. La paginación es aritmética de dos líneas y no hay librería que
delegar; la normalización de nombres la resuelve `String.prototype.normalize('NFD')` del
estándar, sin `slugify` ni `unaccent`.

No se abre ninguna propuesta bajo `docs/architecture.md > Dependencias de terceros`, y
`tests/guards/guard-dependencias-aprobadas.test.ts` debe seguir verde sin tocar `package.json`
— ese es el criterio de R33. Si durante la implementación apareciera la tentación de instalar
algo, **se para y se propone**, no se instala (regla 7 de `CLAUDE.md`).

---

## 10. Las cinco preguntas que abrió este diseño, y cómo se cerraron

**Ninguna sigue abierta.** Las abrió `spec_author` en F1.2, el humano las respondió el mismo día
—2026-09-02— y están escritas como **D19–D23** en
`requirements.md > Decisiones cerradas (no reabrir)`. Aquí queda lo que cada respuesta significa
para el diseño; **la decisión manda sobre lo que decía la posición por defecto**.

1. **Orden por defecto del listado → `name ASC`, con `id ASC` de desempate (D19, R35).**
   Confirma la posición del diseño. El desempate se queda escrito con su porqué: el nombre del
   producto **no es único** (D14, decisión 6 de QC-14), y sin desempate dos homónimos se
   intercambian entre páginas y R26 —recorrer sin repetir ni omitir— dejaría de cumplirse. Vive
   en el adaptador driven (§ 8).
2. **El listado devuelve solo los ids de los autores (D20, R8).** Confirma la posición del
   diseño: `createdBy` y `updatedBy` salen como identificadores y aquí no se resuelve ningún
   nombre. Sigue en pie lo de § 2.1: quien necesite el nombre lo pide al contrato público
   `@/lib/modules/identity`, y eso es alcance de QC-22. Esta ficha **no** añade ningún caso de
   uso a `identity`.
3. **Tope superior del tamaño de página: 25 (D21, R36).** **Cambia el diseño**: la posición por
   defecto era 100. `MAX_PAGE_SIZE = 25` en `lib/shared/pagination.ts` (§ 8), y el defecto sigue
   siendo 10 (D15, R24). Un `pageSize` mayor se **acota**, no se rechaza: rechazar es trabajo de
   zod sobre el mínimo y la integridad (R25); acotar es la defensa contra la consulta sin límite.
4. **Nombre de presentación que normaliza a vacío: se rechaza (D22, R37).** Confirma la posición
   del diseño. El esquema de `presentation-input.ts` exige que
   `normalizePresentationName(name)` no quede vacío, así que un `«---»` falla como **nombre
   inválido** en el borde y nunca llega al índice único a anunciarse como duplicado (§ 2.2, §
   6.2).
5. **`ADMIN_ROLE_NAME` vive en `inventario/domain/actor.ts` (D23).** Confirma la posición del
   diseño. Es deuda consciente y barata: en cuanto el contrato de `identity` exporte la
   constante (QC-6 sigue `spec_ready`), se importa del **barrel** `@/lib/modules/identity`
   —nunca por ruta profunda— y se borra la local (§ 4).

---

## 11. Alternativas descartadas

### 11.1 Declarar la FK de auditoría como `@relation` de Prisma — descartada

Es lo que uno escribe por reflejo y es justo lo que rompe QC-15. Obliga a añadir dos campos de
vuelta en el modelo `User` —que es de `identity`— y abre `include: { createdByUser: true }` desde
el adaptador de `inventario`: una lectura de `users` desde otro módulo que **la guardia no ve**,
porque busca la cadena `prisma.user`. Se descarta a favor de campos escalares con la FK escrita a
mano en el SQL (§ 2.1). El coste —drift de Prisma— se paga con un aviso en la cabecera de la
migración y un test estático, exactamente como QC-14 hizo con sus `CHECK` y su RLS.

### 11.2 `created_by` / `updated_by` `NOT NULL`, con backfill — descartada

Sería la garantía fuerte: imposible una fila sin autor. Se descarta porque el backfill no tiene a
quién apuntar: no existe un «usuario del sistema» en `users` y crearlo es inventar dominio que
nadie pidió (regla 6), además de meter una fila sintética en la tabla de personas de una empresa.
La alternativa —`NOT NULL` solo si la tabla está vacía— haría que la migración se aplicara o no
según la base, que es peor que una regla clara. Queda: columna anulable, service que siempre
escribe, y el test de R6 sobre el service. Si el humano prefiere lo contrario, se cierra en F1.4
y es un `ALTER` más.

### 11.3 Columna generada con `unaccent()` para el nombre normalizado — descartada

`GENERATED ALWAYS AS (…) STORED` sería elegante: la base garantizaría la sincronía de R17 sin que
el service pueda olvidarla. Se descarta por tres motivos que se acumulan: (a) `unaccent` es una
**extensión** que habría que crear —dependencia de infraestructura nueva en Supabase—; (b) su
función **no es `IMMUTABLE`**, así que no se puede usar en una columna generada ni en un índice
sin envolverla en una función propia marcada a mano, que es exactamente el tipo de código sin
dueño ni test que QC-14 ya rechazó para los triggers; y (c) las reglas de normalización acabarían
escritas en SQL, donde ningún test unitario las alcanza —y R19 tiene casos («Bidón 20 L» vs
«BIDON-20L») que se quieren probar como tabla de ejemplos, barato en Vitest y caro contra
Postgres—. Con la función pura en el dominio, R19 se cierra con un test unitario y R20 con el
índice único.

### 11.4 Comparar duplicados al vuelo, sin columna ni índice — descartada por el humano

Consta aquí para que el implementer no la reconsidere: D13 la descarta explícitamente y QC-14
anotó la unicidad como «lo más caro de revertir». Un `SELECT … WHERE lower(name) = …` antes del
`INSERT` es una comprobación **no atómica**: dos altas simultáneas la pasan las dos. La garantía
es el índice único.

> **Corrección (F2, Grupo B, 2026-09-02).** Este apartado decía además que «la comprobación previa
> se mantiene, pero solo para dar un mensaje decente». **Eso no se sostiene y se retira**, por dos
> razones:
>
> 1. **Era inexpresable con el diseño de esta misma ficha.** El `PresentationRepository` de § 7
>    —que es normativo— expone `create`, `rename`, `deleteById` y `list`, y **ningún método de
>    búsqueda por `nameNormalized`**. Hacer la comprobación previa habría exigido añadir un método
>    al puerto, es decir, apartarse del diseño para cumplir una frase del diseño.
> 2. **No aportaba el mensaje que decía aportar.** El puerto ya devuelve `'duplicate'`, y el caso
>    de uso lo traduce a `DuplicateNameError`. El usuario recibe exactamente el mismo error con
>    comprobación previa que sin ella; lo único que añadía era una consulta más y un camino no
>    atómico que podía dar un falso «está libre».
>
> **Lo que se implementa en su lugar:** `create-presentation.ts` y `update-presentation.ts` no
> hacen ninguna comprobación previa y **siempre** traducen el `'duplicate'` del puerto a
> `DuplicateNameError`. Eso es lo que cierra R18 y R20, y tiene su mutación confirmada en
> `tests/unit/inventario/presentation-service.test.ts`. Lo que **no** cambia: D13 sigue vigente
> —la unicidad se garantiza con columna normalizada e índice único, nunca comparando al vuelo—.

### 11.5 Borrado lógico también para las presentaciones — descartada

Uniformaría el modelo, pero mata R21: con `deleted_at`, «borrar» pasa a ser un `UPDATE` y ninguna
FK puede bloquear un `UPDATE`. Es el mismo razonamiento con el que QC-4 dejó `roles` sin
`deleted_at` y QC-14 dejó `presentations` sin él, y D6 lo cierra: borrado **físico**, bloqueado
por `ON DELETE RESTRICT`.

### 11.6 Route Handlers en `app/api/` para el CRUD — descartada

Serían cómodos de probar con `curl`. Se descartan porque `docs/architecture.md > Server Actions
vs Route Handlers` reserva los route handlers para webhooks, API pública y crons, y D18 lo fija:
mutación desde componente propio → Server Action. Además una ruta API interna es una superficie
pública nueva que habría que proteger aparte.

### 11.7 Edición parcial campo a campo (`PATCH`) — descartada

Permitiría formularios más pequeños. Se descarta porque con cinco campos opcionales obliga a
distinguir «no enviado» de «puesto a nulo» en cada uno, y ningún requisito lo pide. Reemplazo
completo, validado por un solo esquema (§ 6.1).

### 11.8 Resolver la paginación dentro del caso de uso — descartada por el humano

D16 la descarta: el cálculo se extrae a `lib/shared/` para que lo reutilice todo CRUD futuro. Se
anota porque la regla de dependencias hace que la solución obvia —importar el util desde
`domain/`— sea **ilegal**, y quien no lo sepa lo intentará (§ 8).

---

## 12. Cómo se verifica

**Sin E2E, y con motivo** (D4, R34): esta ficha no tiene pantalla ni guardia de sesión real
(QC-13 sigue `pending`), así que no hay flujo navegable que visitar. Lo decide QC-22. La
verificación es **unitaria y de integración**.

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit (dominio) | `tests/unit/inventario/authorization.test.ts` | R1, R2, R3: los nueve casos de uso con un actor no administrador rechazan **sin tocar el puerto** (doble que lanza si lo llaman). |
| Unit (dominio) | `tests/unit/inventario/product-service.test.ts` | R5, R6, R9, R10, R11, R12, R13, R14, R15, R16 con dobles de los puertos. |
| Unit (dominio) | `tests/unit/inventario/presentation-service.test.ts` | R17, R18, R21, R22 con dobles de los puertos. |
| Unit (dominio) | `tests/unit/inventario/presentation-name.test.ts` | R19: tabla de ejemplos de normalización. |
| Unit (borde) | `tests/unit/inventario/product-input.test.ts` | R9, R10, R11, R25, R28, R37: los esquemas zod. |
| Unit (shared) | `tests/unit/pagination.test.ts` | R23, R24, R27, R36: defecto 10, aritmética, cota en 25. |
| Unit (driving) | `tests/unit/inventario/product-actions.test.ts` | R29: la acción toma el actor de `identity` y traduce errores. |
| Unit (estático) | `tests/unit/inventario/schema/inventario-audit-migration.test.ts` | R7, R20, R30, R32: las dos FK a `users`, el índice único, los nombres en inglés y que el `down.sql` revierte exactamente el UP. |
| Integración | `tests/integration/inventario/product-crud.int.test.ts` | R7, R15, R16, R26, R35 contra Postgres real. |
| Integración | `tests/integration/inventario/presentation-uniqueness.int.test.ts` | R18, R20, R21, R22: el índice único rechaza el duplicado y `RESTRICT` bloquea el borrado. |
| Guardia (ya existe) | `tests/guards/guard-arquitectura-modulos.test.ts` | R8, R27, R31. |
| Guardia (ya existe) | `tests/guards/guard-rls-force.test.ts` | R4. |
| Guardia (ya existe) | `tests/guards/guard-dependencias-aprobadas.test.ts` | R33. |

El mapa completo `R<n> → test` está en `tasks.md > Trazabilidad`.

Cuatro avisos para el implementer, tres aprendidos en QC-4 y QC-14:

- Los tests de integración necesitan la migración **aplicada**; el `beforeAll` debe fallar con un
  mensaje claro si las columnas no existen, no reventar a mitad del primer caso.
- Se afirma sobre el **SQLSTATE** (`23503`, `23505`, `23514`), nunca sobre el texto del mensaje:
  en esta máquina Postgres responde en español.
- Un test de RLS escrito con Prisma sale verde pase lo que pase. No se escribe: R4 lo cierra la
  guardia estática sobre el SQL.
- El test de R2 tiene que demostrar **que no se llega al repositorio**, no solo que se lanza un
  error. Un doble que registre la llamada y un `expect(...).not.toHaveBeenCalled()`; si el doble
  es permisivo, el test pasaría con la autorización puesta después de la consulta.
