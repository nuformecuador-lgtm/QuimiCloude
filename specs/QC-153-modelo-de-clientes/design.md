# QC-153 — modelo-de-clientes · design.md

> El QUÉ está en `requirements.md` (R1–R29) y el alcance lo cerró el humano antes del spec. Aquí va
> el CÓMO: **un** modelo nuevo (`Customer` → tabla `customers`), **una** migración escrita a mano con
> su `down.sql` que crea la tabla **y** lleva los dos permisos a una instalación ya sembrada, **dos**
> entradas más en el catálogo cerrado de permisos y en la lista del Administrador, y el **armazón**
> del módulo `clientes`. **Cero** casos de uso, puertos con métodos, adaptadores, Server Actions,
> pantallas o dependencias: eso es QC-154 y QC-155.
>
> Precedentes que se copian en vez de reinventarse:
> **QC-42** (`db/migrations/20260903131417_suppliers_and_supplier_catalog_lines/`) — tabla de negocio
> con auditoría anulable, FK a otros módulos escritas a mano y RLS forzada; **QC-59**
> (`db/migrations/20260917120000_suppliers_company_scope/`) — `company_id` con FK a `companies` y la
> clave candidata `(company_id, id)` a la que apunta una FK compuesta; **QC-86**
> (`db/migrations/20260911120000_order_assignments/`, paso 5) — tabla nueva y permisos nuevos en la
> **misma** migración; **QC-144** (`db/migrations/20260922120000_packer_role/`) — la enmienda más
> reciente al catálogo cerrado y la lista de tests que fijan el recuento.

---

## 0. Hallazgos al leer el código

1. **El modelo a copiar es `Supplier` (`db/schema.prisma:424-455`), con dos diferencias pedidas por
   las decisiones.** Igual: `id` uuid con `gen_random_uuid()`, `companyId`/`createdBy`/`updatedBy`
   escalares sin `@relation` (sus FK escritas a mano, drift a propósito), `createdAt`/`updatedAt`/
   `deletedAt` en `Timestamptz(6)`, `@@unique([companyId, id])` total como clave candidata que además
   sirve de índice de empresa, e índices de `created_by` y `updated_by`. Distinto: **sin
   `nameNormalized` ni índice único parcial** (decisión 2: nada es único) y **sin CHECK de contacto**
   (decisión 1: teléfono, correo y dirección son opcionales por separado y sin «al menos uno»).
2. **`users` es el precedente de una persona con nombres y apellidos**: `first_names`/`last_names`
   (`db/schema.prisma:94-95`), sin columna normalizada y sin CHECK de no-blanco. El cliente usa los
   mismos nombres de columna.
3. **La FK compuesta de la decisión 4 se materializa en el hijo, no aquí.** En proveedores, la clave
   candidata `suppliers_company_id_id_key` la puso QC-59 y la FK compuesta la declara la **línea de
   catálogo** hacia el proveedor (`20260917120000_suppliers_company_scope/migration.sql:184,193-195`).
   `customers` no tiene hoy ninguna tabla hija: la primera será `orders` en **QC-156**. Por eso esta
   ficha deja la **clave candidata** (`customers_company_id_id_key`) lista para esa FK y prueba en
   integración, con una tabla hija efímera, que la FK compuesta rechaza el cruce de empresa (R10).
   Las tres FK de la propia fila (`company_id`, `created_by`, `updated_by`) son **simples**, como en
   `suppliers` (`20260903131417_…/migration.sql:85-89` y `20260917120000_…/migration.sql:187-188`).
4. **El seed ya es genérico: no se toca `seed-initial-access.ts`.** Crea los permisos de `PERMISSIONS`
   y las asignaciones de `SEED_ROLE_PERMISSIONS` que falten (hallazgo 1 de
   `specs/QC-144-rol-empacador/design.md`). Con dos entradas más en cada constante, R22 sale del
   algoritmo existente.
5. **`clientes` sí será carpeta de `lib/modules/`**, así que, a diferencia de `usuarios` y
   `terminados`, **no** enmienda la regla de nombres de módulo del catálogo: solo la del número
   cerrado. Es el caso de `asignaciones` (`lib/modules/identity/domain/permissions.ts:29-34`).
6. **Hoy el catálogo tiene 16 permisos, el Administrador 16 y el seed 20 asignaciones**
   (`permissions.ts:43-141` y `:161-182`). Tras esta ficha: **18, 18 y 22**. Los números se escriben
   al implementar contra lo que haya en `dev` (§6.3, choque con QC-142).
7. **Guardias que se ponen verdes solas con la tabla nueva**: `guard-rls-force.test.ts` descubre las
   tablas leyendo el SQL (`:59-64`), y `guard-empresa-en-esquema.test.ts` exige `company_id` a todo
   modelo no exento (`:106-114`); `customers` la lleva y **no** entra en `EXENTAS`. La guardia de
   módulos exige `/// @module` (`guard-arquitectura-modulos.test.ts:598-603`) y la forma del módulo
   (bloque 1, `:891-938`).
8. **Guardia que exige dar de alta la migración a mano**: `MIGRACIONES_ESPERADAS` de
   `tests/guards/guard-identificador-de-request.test.ts:210-297` es una lista cerrada; una carpeta
   nueva en `db/migrations/` la pone roja (`:685-693`).
9. **Integración**: todo archivo nuevo de `tests/integration/**` se declara en
   `tests/integration/aislamiento.json` (`docs/verification.md > El censo de aislamiento`), o
   `guard-aislamiento-integracion.test.ts` pone el gate en rojo.

---

## 1. Qué cambia (resumen)

| Archivo | Cambio | Requisitos |
|---|---|---|
| `db/schema.prisma` | Modelo `Customer` (`/// @module clientes`, `@@map("customers")`) al final, tras `DocumentFile` | R1, R4, R11, R15, R16, R19 |
| `db/migrations/<ts>_customers/migration.sql` | Tabla, FK a mano, índices, permisos y RLS (§2.2) | R1–R3, R7–R17, R23, R24, R27 |
| `db/migrations/<ts>_customers/down.sql` | Reversión exacta (§2.3) | R18 |
| `lib/modules/identity/domain/permissions.ts` | Dos entradas al final de `PERMISSIONS`, párrafo de enmienda, frase del recuento, dos códigos al final de la lista del Administrador | R21, R22, R25 |
| `lib/modules/clientes/index.ts` | Contrato: reexporta `./domain/customer` | R20 |
| `lib/modules/clientes/domain/customer.ts` | Tipo `Customer` (la fila leída, sin Prisma) | R20 |
| `lib/modules/clientes/ports/.gitkeep`, `lib/modules/clientes/adapters/.gitkeep` | Carpetas vacías del armazón (como dejó QC-42 las de `proveedores`) | R20, R26 |

`<ts>` es un timestamp **posterior a la última migración de `dev` en el momento de implementar** (hoy
`20260923140000_product_batch_nullable_machine`). No se fija aquí porque QC-142 y QC-158 pueden traer
la suya antes.

**No se tocan:** `lib/modules/identity/domain/seed-initial-access.ts`, `lib/modules/identity/domain/roles.ts`,
`scripts/seed.ts`, `lib/composition/**`, `lib/shared/**`, `app/**`, `components/**`, `middleware.ts`,
`e2e/**`, `package.json`, cualquier otro modelo de `db/schema.prisma` y cualquier otra migración.

---

## 2. Modelo de datos

### 2.1 `db/schema.prisma`

```prisma
/// Nada es unico: dos clientes pueden repetir todos sus datos, asi que no hay columna normalizada ni
/// indice unico de negocio. `companyId`, `createdBy` y `updatedBy` van sin `@relation` para que un
/// `include` no cruce a otro modulo; sus FK estan escritas a mano y son drift. `customers_company_id_id_key`
/// es la clave candidata para las FK compuestas de las tablas que apunten a un cliente.
/// @module clientes
model Customer {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  firstNames String   @map("first_names")
  lastNames String    @map("last_names")
  city      String
  phone     String?
  email     String?
  address   String?
  companyId String    @map("company_id") @db.Uuid
  createdBy String?   @map("created_by") @db.Uuid
  updatedBy String?   @map("updated_by") @db.Uuid
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  @@unique([companyId, id], map: "customers_company_id_id_key")
  @@index([createdBy], map: "customers_created_by_idx")
  @@index([updatedBy], map: "customers_updated_by_idx")
  @@map("customers")
}
```

- **Tipos**: todo texto es `TEXT` sin longitud (R5) y sin CHECK de formato (R6). Los obligatorios son
  `NOT NULL` y nada más: el texto en blanco lo rechaza `zod` en QC-154, igual que el nombre del
  proveedor (QC-42 R2 solo exige presencia; `supplier-input.ts:39-44` recorta y exige `min(1)`).
- **Sin `nameNormalized`** ni columna de búsqueda: `users` busca sobre `first_names`/`last_names`
  sin columna normalizada (`user-admin-prisma.ts:453-482`). Si el listado de QC-154 necesita un
  índice de búsqueda u orden, lo crea QC-154 en su propia migración, como hizo
  `20260904160000_list_query_indexes` para proveedores.
- **El comentario del modelo** no cita fichas ni requisitos (`docs/conventions.md > Comentarios`;
  `db/` es producción) y cabe en cinco líneas.

### 2.2 `migration.sql` (UP) — escrita a mano, en este orden

Se escribe a mano y se aplica con `pnpm run db:migrate` (`prisma migrate deploy`), como
`20260917120000_suppliers_company_scope` y `20260922120000_packer_role`: `migrate dev` lee como drift
todas las FK escritas a mano del repositorio y propone `DROP CONSTRAINT` sobre tablas ajenas o un reset
de la base. Si se usa `db:migrate:create` para partir de lo generado, **se borra a mano todo `DROP
CONSTRAINT` o `ALTER` sobre otra tabla** (R27) y se dice en la cabecera.

```sql
-- 1. La tabla. `updated_at` sin default: lo escribe Prisma (`@updatedAt`) en cada UPDATE.
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_names" TEXT NOT NULL,
    "last_names" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "company_id" UUID NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- 2. Clave candidata TOTAL (empresa, id): destino de las FK compuestas futuras e indice de empresa.
CREATE UNIQUE INDEX "customers_company_id_id_key" ON "customers"("company_id", "id");

-- 3. FK a mano (drift). RESTRICT y nunca SET NULL: «borraron al usuario» no es «no lo creo nadie».
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Lado hijo de las dos FK de auditoria (Postgres no lo indexa solo).
CREATE INDEX "customers_created_by_idx" ON "customers"("created_by");
CREATE INDEX "customers_updated_by_idx" ON "customers"("updated_by");

-- 5. Los dos permisos en una instalacion que ya existe. Idempotente: el seed puede haberlos creado.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('clientes.consultar', 'clientes', 'consultar', 'Consultar los clientes de la empresa.', CURRENT_TIMESTAMP),
  ('clientes.modificar', 'clientes', 'modificar', 'Crear, editar y borrar clientes de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('clientes.consultar'), ('clientes.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

-- 6. RLS activada y forzada, sin policies, AL FINAL (como QC-86).
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
```

- **`(company_id, id)` y no `(id, company_id)`**: es el orden de `suppliers_company_id_id_key` y
  `presentations_company_id_id_key`, con la empresa de cabeza para que sirva también de índice del
  filtro por empresa (hallazgo 1). Por eso no hay `customers_company_id_idx` aparte.
- **Ningún `CHECK`**: ni de formato (R6), ni de «al menos un contacto» (R3), ni de no-blanco (ver
  alternativa 4).
- **Idempotencia (R24)**: `permissions.code` es la PK y `role_permissions` tiene PK
  `(role_id, permission_code)` (`db/schema.prisma:48-75`), que respaldan los dos `ON CONFLICT`.
- **Solo el Administrador** se nombra (R22, R23): ninguna sentencia menciona `Operador` ni
  `Empacador`. Los literales se duplican porque una migración no puede importar TypeScript; el test
  estático los compara contra `PERMISSIONS` importado (§7).
- **RLS de las tablas del catálogo**: esta migración escribe en `permissions` y `role_permissions` sin
  `NO FORCE`, igual que `20260922120000_packer_role` y el paso 5 de `20260911120000_order_assignments`,
  que ya lo hicieron con la misma conexión de `migrate deploy`.
- **La cabecera** del archivo explica en pocas líneas qué hace, que está escrito a mano y por qué, y que
  no toca otras tablas; **sin** citar fichas ni requisitos (`docs/conventions.md > Comentarios`).

### 2.3 `down.sql`

```sql
DELETE FROM "role_permissions" WHERE "permission_code" IN ('clientes.consultar', 'clientes.modificar');
DELETE FROM "permissions" WHERE "code" IN ('clientes.consultar', 'clientes.modificar');
DROP TABLE "customers";
```

- Las asignaciones **antes** que los permisos: `role_permissions_permission_code_fkey` es `RESTRICT`.
  El primer `DELETE` borra los dos códigos de **cualquier** rol, no solo del Administrador: un permiso
  huérfano no es el estado anterior (R18, mismo criterio que `20260922120000_packer_role/down.sql:1-5`).
- `DROP TABLE` se lleva la tabla, sus índices y sus FK. **Sin `CASCADE`**: si una ficha posterior
  (QC-156) cuelga una FK de `customers`, revertir esta sin revertir aquella debe fallar ruidosamente.
- Si hay clientes cargados, el `DROP` los borra: es la semántica de revertir una tabla nueva, igual
  que `20260918130000_document_batches_and_files/down.sql`.
- Sin `INSERT`, `UPDATE`, `ALTER` sobre otras tablas ni `DROP EXTENSION`.

### 2.4 Contrato de E/S

No hay endpoint, ruta ni Server Action (R26). El único contrato nuevo hacia fuera es el tipo del
armazón (§4) y las dos entradas del catálogo (§3).

---

## 3. El catálogo de permisos

### 3.1 Las entradas (al final de `PERMISSIONS`, tras `terminados.consultar`)

```ts
{
  code: 'clientes.consultar',
  module: 'clientes',
  action: 'consultar',
  description: 'Consultar los clientes de la empresa.',
},
{
  code: 'clientes.modificar',
  module: 'clientes',
  action: 'modificar',
  description: 'Crear, editar y borrar clientes de la empresa.',
},
```

- Cumplen las tres reglas vigiladas que QC-144 enumeró (`specs/QC-144-rol-empacador/design.md > 2`):
  código `^[a-z]+\.[a-z]+$` y acción `consultar`/`modificar` (`tests/unit/identity/permissions.test.ts:82-88`),
  módulo con escritura con **exactamente** `consultar` y `modificar` (`:107-113`), y
  `@@unique([module, action])` (`db/schema.prisma:58`) sin choque.
- Las **descripciones las aprobó el humano en F1.4 (2026-09-24)** tal cual se propusieron: siguen el
  patrón de `usuarios.consultar` («…de la empresa.») y de `proveedores.modificar` («Crear, editar y
  borrar…»). «Borrar» es la baja lógica, como en las demás.

### 3.2 La lista del Administrador

`SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]` suma `'clientes.consultar'` y `'clientes.modificar'` **al
final**, en el orden de `PERMISSIONS` (`permissions.test.ts:178-180` compara con `toEqual` contra la
lista escrita a mano). Operador y Empacador no cambian (`permissions.ts:180-181`).

### 3.3 El JSDoc

- **Primera frase** (`permissions.ts:8`): el recuento pasa de «dieciseis» a «dieciocho» (o al número
  que toque, §6.3). La frase ya no cita fichas desde QC-144; se deja así.
- **Párrafo de enmienda nuevo**, después del de `terminados.consultar` (`:36-39`) y antes de la línea
  del `R5` (`:41`), en cuatro líneas a 100 columnas y sin citas (R25):

```ts
 * **Quinta enmienda al catalogo cerrado**: suma `clientes.consultar` y `clientes.modificar`, ver y
 * mantener los clientes de la empresa. Cambia el recuento; como `asignaciones`, su modulo si es una
 * carpeta de `lib/modules/`, y declara las dos acciones porque tiene escritura. Solo los recibe el
 * Administrador.
```

- El ordinal («quinta» o «sexta») se escribe al implementar contra el catálogo de `dev` (§6.3). El
  párrafo **no** menciona `terminados.consultar`: el test de QC-144 localiza su propio párrafo con
  `parrafos.find(p => p.includes('terminados.consultar'))` (`permissions.test.ts:157`) y se
  confundiría.
- El JSDoc de `SEED_ROLE_PERMISSIONS` (`:150-160`) no cambia: los dos códigos entran en una lista que
  ya se describe como «escritos uno a uno».

---

## 4. El armazón del módulo `clientes`

```
lib/modules/clientes/
  index.ts              # export { type Customer } from './domain/customer';
  domain/customer.ts    # el tipo de la fila leida, puro
  ports/.gitkeep
  adapters/.gitkeep
```

```ts
export type Customer = {
  readonly id: string;
  readonly firstNames: string;
  readonly lastNames: string;
  readonly city: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly companyId: string;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};
```

- **Por qué existe el módulo ya**: `/// @module clientes` nombra un dueño, y QC-42 R23 fijó que el
  módulo nace con el modelo. La guardia de arquitectura exige `index.ts` y solo
  `domain/ports/adapters` a cualquier carpeta de `lib/modules/` (bloque 1).
- **Qué NO hay, dicho explícitamente**: ningún caso de uso, ningún `Actor`/`requirePermission`,
  ningún puerto con métodos, ningún adaptador driven ni driving, nada en `lib/composition`, ningún
  esquema `zod` ni constante de largo máximo. Todo eso es QC-154. Los tests de migración no necesitan
  puerto: los de integración usan Prisma directamente (`tests/**` está exento de la regla de
  dependencias, `docs/architecture.md > La regla de dependencias`).
- **Por qué un tipo y no un barril vacío**: es el vocabulario del modelo sin Prisma, y un test
  estático lo ata a las columnas del esquema (§7), de modo que QC-154 parte de un tipo que no puede
  divergir de la tabla. El dominio solo importa nada (ni `zod`).

---

## 5. La pregunta abierta 1 y su respuesta

Cerrada en F1.4 (2026-09-24; `requirements.md > Nota F1.4` y «Decisiones cerradas»). Para este
diseño la consecuencia es: **columnas `TEXT` sin longitud y sin CHECK de formato** (R5, R6). Los
valores los aplica QC-154 en la validación: nombres 80, apellidos 80, teléfono 40, correo 160,
ciudad 80 y dirección 200.

---

## 6. Sitios que hoy afirman el catálogo, el recuento o las listas cerradas

Todos se actualizan en esta ficha (T5–T7). **Ninguno se relaja** a `toContain` ni a `toBeGreaterThan`:
los números se **suben** y las listas se **amplían** nombrando la entrada nueva, como hizo QC-144.

### 6.1 Recuento del catálogo (hoy 16 → 18) y de asignaciones (hoy 20 → 22)

**Nota 2026-09-24 (decisión humana):** `tests/unit/pedidos/schema/pedidos-schema.test.ts`, caso
«Order no declara cliente, destinatario ni ninguna columna equivalente», prohibía también un
catálogo de clientes (modelos `Customer`/`Client`/`Recipient`/`Buyer` y sus `@@map`). Esta ficha
deroga esa prohibición solo para `Customer`/`customers`: el catálogo de clientes que crea existe.
La prohibición de `Client`, `Recipient`, `Buyer` y sus `@@map` (`clients`, `recipients`) sigue en
pie. La parte del mismo caso sobre los campos de `Order` (que Order no declara cliente ni
destinatario) no cambia y sigue vigente hasta QC-156.

| Archivo:línea | Qué fija | Cambio |
|---|---|---|
| `tests/unit/identity/permissions.test.ts:25-42` | `CODIGOS_DEL_REQUISITO` a mano | suma los dos códigos al final |
| `tests/unit/identity/permissions.test.ts:51-61` | `MODULOS` | suma `clientes` |
| `tests/unit/identity/permissions.test.ts:68-76` | `MODULOS_CON_ESCRITURA` | suma `clientes` |
| `tests/unit/identity/permissions.test.ts:96-99` | `toEqual` + `size).toBe(16)` | 18 y título |
| `tests/unit/identity/permissions.test.ts:138-142` | «QC-144 R5»: `[...CATALOGO_PREVIO, 'terminados.consultar']` | **se pone rojo por orden** (el previo filtrado acabaría en los dos de clientes): se reescribe para que el prefijo previo excluya también los códigos posteriores a `terminados.consultar`, sin perder lo que afirma |
| `tests/unit/identity/permissions.test.ts:178-180, 257-260` | Administrador `toEqual(CODIGOS_DEL_REQUISITO)` | verde con la lista ampliada; títulos «dieciseis» |
| `tests/unit/identity/permissions.test.ts:273-276` | `toHaveLength(16)` | 18 |
| `tests/unit/navegacion/qc75-convenciones.test.ts:58-75` | `CODIGOS_QC74` a mano | suma los dos |
| `tests/unit/navegacion/qc75-convenciones.test.ts:78-85` | `MODULOS_DE_NEGOCIO` (seis) | suma `clientes` (es carpeta real, como `asignaciones`) |
| `tests/unit/navegacion/qc75-convenciones.test.ts:125-128, 141-151` | `toHaveLength(16)` y módulos esperados | 18; los módulos esperados salen de la lista ampliada |
| `tests/guards/guard-permisos-sembrados.test.ts:124-132` | `PERMISSIONS.length).toBe(16)` y su mensaje | 18 |
| `tests/guards/guard-nav-permisos-declarados.test.ts:130` | `CODIGOS_VALIDOS).toHaveLength(16)` | 18. El ancla de nueve enlaces (`:99-117`) **no** cambia: esta ficha no añade menú |
| `tests/unit/documentos/authorization.test.ts:157-158` | `toHaveLength(16)` | 18 |
| `tests/unit/pedidos/qc145-estado-solo-planta.test.ts:267-269` | `PERMISSIONS).toHaveLength(16)` | 18 |
| `tests/unit/asignaciones/schema/order-assignments-migration.test.ts:864-875` | `CODIGOS_DE_FICHAS_POSTERIORES = ['terminados.consultar']`, `toBe(16)` | suma los dos códigos; 18. La resta a 13 sigue saliendo |
| `tests/unit/identity/grupos/scope.test.ts:200` | `PERMISOS_ESPERADOS = 16` | 18 |
| `tests/unit/identity/roles/scope.test.ts:196` | `PERMISOS_ESPERADOS = 16` | 18 |
| `tests/unit/identity/seed/seed-initial-access.test.ts:701, 729, 739, 756` | título, comentario, `toBe(20)`, `toHaveLength(16)` | 22 y 18 |
| `tests/integration/identity/identity-seed.int.test.ts:770, 789-790` | título, `toBe(16)`, `toBe(20)` | 18 y 22 |
| `tests/integration/identity/identity-seed.int.test.ts:916, 932, 937-938, 967-968` | comentarios, `toHaveLength(16)`, `toHaveLength(20)` | 18 y 22 |

**No se ponen rojos** (derivan del dato real o filtran por código): `guard-permisos-sembrados.test.ts:140-149`,
`seed-initial-access.test.ts:212` y `identity-seed.int.test.ts:293-294` (`TOTAL_DE_ASIGNACIONES_DEL_SEED`
derivado), `identity-seed.int.test.ts:859-871` (por rol, contra `SEED_ROLE_PERMISSIONS`),
`tests/unit/identity/schema/packer-role-migration.test.ts` y
`tests/integration/identity/packer-role-migration.int.test.ts` (acotados a `terminados.consultar` y al
Empacador), `tests/unit/identity/schema/user-permissions-migration.test.ts` (filtra `usuarios`),
`tests/unit/identity/roles/empacador-rol.test.ts` (barre solo `terminados.consultar`).

Los comentarios de esas líneas que la rama toca se dejan **sin citas** a fichas
(`docs/conventions.md > Comentarios`); los preexistentes que no se tocan no se arrastran.

### 6.2 Listas cerradas de migraciones, módulos y tests

| Archivo:línea | Qué exige | Cambio |
|---|---|---|
| `tests/guards/guard-identificador-de-request.test.ts:210-297` | `MIGRACIONES_ESPERADAS` cerrada | alta de `<ts>_customers` al final, con una línea de motivo sin citar la ficha |
| `tests/integration/aislamiento.json` | censo de `tests/integration/**` | los dos archivos nuevos en `transaccion` |
| `guard-empresa-en-esquema`, `guard-rls-force`, `guard-arquitectura-modulos` | — | **sin cambios**: se cumplen con el diseño (hallazgo 7) |

### 6.3 Choque previsible con QC-142 y QC-158

QC-142 (`permiso-propio-de-documentos`, `pending`) añadirá un permiso y tocará las mismas listas y el
mismo JSDoc. La segunda en mergear suma las dos entradas, sube el número y corrige el ordinal. QC-158
(`in_progress`) no toca permisos, pero puede traer migración: el `<ts>` y `MIGRACIONES_ESPERADAS` se
resuelven al sincronizar con `dev`.

### 6.4 Lo que queda para QC-154 (se dice para que no se pierda)

- La guardia de ámbito por función, `tests/guards/guard-ambito-empresa-clientes.test.ts`, calcada de
  `guard-ambito-empresa-proveedores.test.ts`: hoy no hay ni una función de persistencia que vigilar.
- Añadir `clientes` a `BUSINESS_MODULES` de `guard-autorizacion-por-permiso.test.ts:212-217` y de
  `guard-permisos-no-administrables.test.ts:346-354` cuando el módulo tenga casos de uso y contrato.
- Relajar el barrido de R26 (§7) cuando los casos de uso consuman `clientes.*`; el test lo dice en su
  mensaje de fallo.
- Los índices de búsqueda y orden del listado, si hacen falta.

---

## 7. Tests nuevos

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/unit/clientes/schema/customers-schema.test.ts` | unit estático | Lee `db/schema.prisma` como texto: modelo `Customer` con `/// @module clientes` y `@@map("customers")` (R16, R19); los trece campos con su `@map` y opcionalidad (R1, R3, R4, R15); `companyId`/`createdBy`/`updatedBy` escalares y **ningún** `@relation` en el modelo (R11); **ningún** `@unique` ni otro `@@unique` que la clave candidata (R7); **ningún** `@db.VarChar` (R5). Y el tipo `Customer` de `lib/modules/clientes` tiene exactamente las claves de los campos del modelo (objeto `satisfies Record<keyof Customer, true>` comparado con los campos leídos) |
| `tests/unit/clientes/schema/customers-migration.test.ts` | unit estático | Sobre el SQL sin comentarios: columnas y tipos (`TEXT` sin longitud, `NOT NULL` solo en los tres obligatorios y en `company_id`) (R1–R5); ningún `CHECK` (R3, R6); ningún `UNIQUE` salvo `customers_company_id_id_key` (R7, R10); las tres FK con `ON DELETE RESTRICT`, ninguna `SET NULL` (R8, R9, R12, R13); `ENABLE` y `FORCE` y ninguna `CREATE POLICY` (R17); los literales de permiso iguales a las entradas de `PERMISSIONS` importadas y la asignación solo a `'Administrador'` con `ON CONFLICT DO NOTHING`, sin `Operador` ni `Empacador` (R22–R24); ninguna sentencia `ALTER`/`DROP`/`CREATE INDEX` sobre otra tabla ni mención de `orders` (R27). Sobre `down.sql`: dos `DELETE` acotados a los dos códigos, en ese orden, `DROP TABLE "customers"` único y sin `CASCADE` (R18). Cabecera de ambos sin `QC-\d+`/`\bR\d+\b`. Casos sintéticos que demuestran que cada detector muerde. Plantilla: `tests/unit/proveedores/schema/proveedores-migration.test.ts` |
| `tests/unit/clientes/scope.test.ts` | unit estático | R20 (el módulo tiene `index.ts` que solo reexporta de `./domain`, solo `domain/ports/adapters`, `ports/` y `adapters/` sin fuentes), R26 (barrido de `lib/`, `app/`, `components/`, `hooks/`, `middleware.ts` sin comentarios: el literal `clientes.consultar`/`clientes.modificar` solo en `permissions.ts`; ningún archivo bajo `lib/modules/clientes/adapters/`), R28 (ningún `e2e/*.spec.ts` nombra `clientes`), R29 (`package.json` sin claves nuevas contra el merge-base, saltando explícitamente si el rango no existe, como `qc75-convenciones.test.ts:218-237`) |
| `tests/unit/identity/permissions.test.ts` (ampliado) | unit | R21 (las dos entradas exactas; catálogo = previo + dos), R22 (Administrador con los dos; Operador y Empacador con sus conjuntos exactos, sin `clientes.*`), R25 (el párrafo que nombra `clientes.consultar`: ≤5 líneas, contiene «enmienda» y los dos códigos, y ni él ni la primera frase casan con `/QC-\d+\|\bR\d+\b\|design\.md\|decisi[oó]n cerrada/i`) |
| `tests/integration/clientes/customers-constraints.int.test.ts` | integración, `transaccion` | R2 (`23502` en los tres obligatorios, en INSERT y en UPDATE a NULL), R3 (los tres opcionales ausentes → NULL leído), R5 (textos de 10 000 caracteres aceptados), R6 (`'no-es-un-correo'` y `'abc'` aceptados), R7 (dos filas idénticas en la misma empresa), R8 (`company_id` NULL → `23502`; inexistente → `23503`), R9 (borrar la empresa con un cliente dado de baja → `23503`), R10 (tabla hija `TEMP` con FK `(company_id, customer_id) → customers(company_id, id)`: la misma empresa entra, la otra da `23503`), R11 (`pg_constraint` tiene las tres FK con su tabla destino, y el cliente Prisma generado no expone relación en `Customer`), R12 (autor NULL aceptado; inexistente → `23503`), R13 (borrar el usuario autor → `23503`, autoría intacta), R14 (baja lógica: `deleted_at` con valor y los seis datos intactos; `information_schema` sin columna de estado), R15 (`updated_at` crece tras un `update` de Prisma), R16 (`information_schema`: tabla y columnas en `snake_case` inglés), R17 (`relrowsecurity` y `relforcerowsecurity` en `pg_class`, cero filas en `pg_policies`) |
| `tests/integration/clientes/customers-migration.int.test.ts` | integración, `transaccion` | En transacción revertida, con `migration.sql` y `down.sql` **leídos del archivo** (patrón de `tests/integration/identity/identity-seed.int.test.ts:333-350` y de `packer-role-migration.int.test.ts`): R18 (DOWN deja sin tabla, sin los dos permisos ni asignaciones y con el resto de `permissions`/`role_permissions` idéntico al de antes), R23 (DOWN y luego UP: tabla recreada, los dos permisos, asignados solo al Administrador, resto de filas idéntico), R24 (DOWN, insertar a mano los dos permisos y su asignación como haría el seed, UP: no falla, mismos conteos, `updated_at` de esas filas sin cambiar) |

**Base propia (lección de QC-147, `progress/history.md:4657-4659`).** La migración se aplica **solo**
a la base propia del worktree, `QuimiCloude_QC153`, con el `.env` del worktree apuntando a ella y
`DATABASE_URL` exportada en el proceso que corre el gate (`progress/history.md:1507-1513`: el runner
no lee el `.env`). **Nunca** a la compartida `QuimiCloude`. Los tests de integración corren sobre la
copia efímera que el `globalSetup` saca de la plantilla (`docs/verification.md > Los tests de
integración corren sobre una base propia y efímera`); la plantilla se reconstruye sola porque su
nombre lleva la huella de las migraciones. Tras cada merge de `dev`, `db:migrate` sobre
`QuimiCloude_QC153` (`progress/history.md:2987-2990`).

**Aislamiento de los tests de migración.** `DROP TABLE` y los `DELETE` sobre el catálogo dentro de una
transacción revertida toman bloqueos sobre `customers` y sobre filas de `role_permissions`; otros
archivos que resetean identidad en su propia transacción pueden esperar. Es el mismo riesgo que ya
acepta `packer-role-migration.int.test.ts`. Si aparece un bloqueo, se declara el archivo en
`commit` con motivo, no se relaja la prueba.

---

## 8. Alternativas descartadas

1. **Dos migraciones: una de esquema (`customers`) y otra de datos (`customers_permissions`).**
   Separa DDL de datos y permite revertir los permisos sin tirar la tabla. Se descarta: QC-86
   (`20260911120000_order_assignments`, paso 5) ya fijó el patrón de tabla + permisos en **una** sola
   migración, `db:rollback` revierte la última y dos carpetas obligarían a revertir en dos pasos algo
   que se aprobó como un todo, y la lista cerrada `MIGRACIONES_ESPERADAS` ganaría dos altas en vez de
   una. Ningún requisito pide revertir una mitad sin la otra.
2. **FK compuestas también en la auditoría: `(created_by, company_id) → users(id, company_id)`.**
   Garantizaría en la base que el autor es de la misma empresa que el cliente, y `users` ya tiene la
   clave `users_id_company_id_key` (`db/schema.prisma:135`). Se descarta por precedente: ninguna tabla
   con auditoría la usa (`suppliers`, `recipes`, `orders`, `product_batches` llevan FK simple a
   `users(id)`); las compuestas hacia `users` solo existen donde la persona **es** el dato de negocio
   (`order_assignments`, `work_group_members`). La decisión 4 pide «FK compuesta» heredada de QC-59, y
   QC-59 la puso en la relación padre-hijo, que aquí es la clave candidata de R10. **Confirmado por el
   humano en F1.4 (2026-09-24): FK simples en la auditoría.**
3. **No crear todavía `lib/modules/clientes/`**, dejando solo el `/// @module clientes`. La guardia de
   arquitectura no comprueba que la carpeta del dueño exista, así que pasaría. Se descarta porque
   declararía un dueño inexistente y contradice el precedente de QC-42 R23 (el módulo nace con su
   modelo); QC-154 tendría además que crear forma y contrato a la vez que los casos de uso.
4. **`CHECK` de no-blanco en los obligatorios (`btrim(first_names) <> ''`, etc.).** Cerraría en la base
   el hueco de un nombre de espacios. Se descarta por precedente: ni `suppliers.name` ni
   `users.first_names` lo tienen, y QC-42 dejó escrito que el blanco lo corta `zod` en el CRUD (su
   pregunta abierta 6). Proveedores solo añadió un CHECK de blanco para la regla **cruzada** de
   contacto, que aquí no existe. Añadirlo después es barato mientras la tabla esté vacía.
5. **Columna `full_name_normalized` para búsqueda.** Adelantaría el listado de QC-154. Se descarta:
   sin unicidad no hay nada que la columna garantice, `users` busca sin ella, y es infraestructura
   «por si acaso» que el reviewer rechaza (`docs/architecture.md > Dominio` n.º 1).

---

## 9. Dependencias de terceros

Ninguna (R29). Es esquema Prisma, SQL, dos constantes y un tipo. No hay librería que evaluar.
