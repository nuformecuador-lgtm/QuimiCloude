# QC-144 — rol-empacador · design.md

> **Enmendado el 2026-09-22** por decisión del humano tras la implementación (D10): §2 reescribe el
> bloque de enmienda del catálogo sin citas a fichas ni requisitos (R6), §6 cambia cómo se prueba R6,
> y nace **§4.1**, la ampliación de `guard-permisos-no-administrables` a la tabla `roles` (R27),
> con su alternativa descartada en §7.

> El QUÉ está en `requirements.md` (R1–R27) y el alcance lo cerró el humano antes del spec. Aquí va
> el CÓMO: **un** rol más en `SEED_ROLES`, **una** entrada más en el catálogo cerrado de permisos,
> **una** clave más en `SEED_ROLE_PERMISSIONS`, **una** migración de datos con su `down.sql`, y
> **cero** caso de uso, Server Action, pantalla, tabla o dependencia.
>
> Precedentes que se siguen en vez de reinventarse:
> **QC-66** (`db/migrations/20260910120000_user_permissions_catalog/`) — migración de solo datos
> que lleva permisos nuevos a una instalación que ya existe; **QC-86**
> (`db/migrations/20260911120000_order_assignments/`, paso 5) — cómo se reparten por rol, resolviendo
> el rol por nombre con un subselect; **QC-6** (`lib/modules/identity/domain/seed-initial-access.ts`)
> — el seed que lee qué falta y crea exactamente eso; **QC-74** — la forma del catálogo y sus
> guardias; **QC-94** + fix del PR #106 — la consulta de roles que alimenta el selector.

---

## 0. Hallazgos al leer el código

1. **El seed ya es genérico: no hace falta tocar `seed-initial-access.ts`.** Recorre `SEED_ROLES`
   para crear los roles que faltan (paso 4) y `Object.entries(SEED_ROLE_PERMISSIONS)` para las
   asignaciones (paso 5), y lanza si un rol de `SEED_ROLE_PERMISSIONS` no se creó. Con añadir el
   rol a `SEED_ROLES` y su clave a `SEED_ROLE_PERMISSIONS`, R19 sale gratis del algoritmo de QC-6.
2. **Ninguna migración ha insertado nunca un rol.** Los dos roles actuales solo los crea el seed, que
   corre en la instalación y no en cada despliegue. Por eso la decisión D9 («entran por migración y
   seed») obliga a que **esta** migración sea la primera con un `INSERT INTO "roles"`: sin él, en una
   base ya sembrada las asignaciones del Empacador no tendrían rol al que colgarse (el subselect por
   nombre devolvería cero filas y la migración «pasaría» sin hacer nada — el peor fallo posible).
3. **`permissions` tiene `@@unique([module, action])`** (`db/schema.prisma:58`). El permiso nuevo no
   puede reutilizar un par `(módulo, acción)` existente: ni `asignaciones.consultar` ni
   `pedidos.consultar` con otro código. Esto acota el nombre (§2).
4. **Fix del PR #106 (`de7940ef`) confirmado: el Empacador SÍ aparece en el selector.**
   `lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts:41` filtra
   `where: { name: { not: ROLE_ADMINISTRADOR } }` — excluye **solo** al Administrador. Y
   `user-admin-prisma.ts:295-299` (`create`) y la transacción de edición responden
   `'action_not_allowed'` **solo** si el `roleId` pedido es el del Administrador. Un rol nuevo pasa
   por las dos capas sin tocar nada: R22 y R23 son tests, no código.
5. **Nada de producción ramifica por nombre de rol.** Las únicas menciones a `Operador` fuera de
   `roles.ts`/`permissions.ts` en `lib/`/`app/` son comentarios (`session-token.ts:74`,
   `list-assigned-orders.ts:4`, etc.). Las pantallas `/asignacion` y `/asignacion/[id]` abren con
   `requirePagePermission('asignaciones.consultar')` y sus cuatro casos de uso
   (`listAssignedOrders`, `getAssignedOrderExecution`, `startAssignedOrder`, `finishAssignedOrder`)
   exigen solo ese permiso. El Empacador hereda la pantalla y la lógica del Operador **por permiso**,
   que es exactamente D2 + D4.
6. **El menú y el aterrizaje ya funcionan por permiso.** `PRIVATE_NAV_ITEMS` pone `nav-asignacion`
   (`asignaciones.consultar`) justo detrás de `nav-dashboard`, y `firstVisibleNavHref` aterriza en el
   primer enlace visible. Con `['asignaciones.consultar', 'terminados.consultar']` queda un solo
   enlace y el aterrizaje es `/asignacion` (R15) sin cambiar `lib/shared/navigation/`.

---

## 1. Qué cambia (resumen)

| Archivo | Cambio | Requisitos |
|---|---|---|
| `lib/modules/identity/domain/roles.ts` | `ROLE_EMPACADOR = 'Empacador'` y su fila en `SEED_ROLES`; el comentario de cabecera pasa de «los dos literales» a «los tres» | R1, R2, R3 |
| `lib/modules/identity/domain/permissions.ts` | Entrada `terminados.consultar` al final de `PERMISSIONS`; bloque de enmienda en el JSDoc; `terminados.consultar` al final de la lista del Administrador; clave `[ROLE_EMPACADOR]` en `SEED_ROLE_PERMISSIONS` | R4, R5, R6, R8, R9, R10 |
| `tests/guards/guard-permisos-no-administrables.test.ts` | *(2026-09-22)* Suma el modelo `Role` y el SQL crudo de escritura al barrido (§4.1) | R27 |
| `lib/modules/identity/index.ts` | Reexporta `ROLE_EMPACADOR` junto a los otros dos | R2 (los tests lo importan del barril) |
| `db/migrations/<ts>_packer_role/migration.sql` | Migración de solo datos (§3) | R7, R17, R18, R20 |
| `db/migrations/<ts>_packer_role/down.sql` | Reversión acotada (§3.3) | R21 |

`<ts>` es un timestamp **posterior a la última migración de `dev` en el momento de implementar**
(hoy la última es `20260918130000_*`). No se fija aquí por la misma razón que el recuento: QC-142
también trae migración.

**No se tocan:** `lib/modules/identity/domain/seed-initial-access.ts`, `scripts/seed.ts`,
`db/schema.prisma`, `package.json`, `app/**`, `components/**`, `middleware.ts`,
`lib/shared/navigation/**`, `lib/modules/asignaciones/**`, `lib/modules/inventario/**`, `e2e/**`.

---

## 2. El permiso nuevo: `terminados.consultar`

```ts
{
  code: 'terminados.consultar',
  module: 'terminados',
  action: 'consultar',
  description: 'Consultar todos los pedidos terminados de la empresa.',
},
```

**Por qué esta forma.** Tres restricciones del código real la acotan:

- `tests/unit/identity/permissions.test.ts:77-78` exige que el código case con `^[a-z]+\.[a-z]+$`
  (sin guion ni guion bajo) y que la acción sea `consultar` o `modificar`;
  `tests/unit/navegacion/qc75-convenciones.test.ts:149-152` exige que las acciones del catálogo sean
  **solo** esas dos. Es la regla de QC-74 (decisión «dos permisos por módulo»), vigilada dos veces.
- `@@unique([module, action])`: no cabe otro `asignaciones.consultar` ni otro `pedidos.consultar`.
- `tests/unit/identity/permissions.test.ts:99-105` (QC-74 R3) exige que un módulo con escritura
  declare **exactamente** `consultar` y `modificar`: una tercera acción en `asignaciones` o `pedidos`
  lo rompería.

Un «módulo» propio con acción `consultar` es la única forma que no toca ninguna de esas tres reglas.
Cumple QC-74 R4 como `dashboard` (módulo sin escritura, declara solo `consultar`) y se lee en voz alta
como lo que abre: «consultar terminados». El precio es **una enmienda a QC-74 R1** («siguiendo los
nombres de módulo del repositorio»): `terminados` no es una carpeta de `lib/modules/`. Es
exactamente la enmienda que QC-66 ya hizo con `usuarios` (decisión cerrada 2 de QC-66), y se dice
igual: por escrito en el JSDoc (R6) — pero **sin citar fichas** (enmienda del 2026-09-22, D10).

**El bloque de enmienda** que se añade al JSDoc de `PERMISSIONS`, después del bloque anterior
(texto enmendado el 2026-09-22; cuatro líneas a 100 columnas, dentro del «~5 líneas» de
`docs/conventions.md > Comentarios`):

```ts
 * **Cuarta enmienda al catalogo cerrado**: suma `terminados.consultar`, ver todos los pedidos
 * terminados de la empresa sin filtro por usuario. Cambia el recuento y, como `usuarios`, su
 * modulo no es una carpeta de `lib/modules/`. Declara solo `consultar` porque no tiene escritura.
 * Lo reciben el Administrador y el Empacador; el Operador no.
```

Qué se quitó respecto de la redacción original y por qué: `QC-74 R1 y R2`, `(QC-144)`, `QC-66`,
`(R4)` y la frase «la lista que lo consume es QC-145». La convención dice «nunca se cita una ficha ni
un requisito en un comentario de producción … Sin excepciones», así que no hay excepción que
aplicar. Lo que esas citas decían se dice con palabras: «cambia el recuento» es la enmienda a la
regla del número cerrado, y «su módulo no es una carpeta de `lib/modules/`» es la enmienda a la
regla de nombres de módulo. La historia (qué ficha enmienda a cuál) vive en este spec y en git.
«Nadie lo exige todavía» también se cae: es verdad hoy y deja de serlo con la ficha que lo consuma,
y R16 ya lo vigila con un test.

**La frase del recuento** (primera frase del JSDoc, `permissions.ts:8-9`) es una línea que toca esta
rama (el número cambia), así que se limpia con ella: queda «El catalogo cerrado: dieciseis permisos,
ni uno mas ni uno menos.» sin el paréntesis «(QC-74 R2, enmendado por QC-38, por QC-66 y por
QC-86)», que se quita entero aunque su final caiga en la línea 9, porque es la misma frase. Los
bloques anteriores (QC-38, QC-66, QC-86) **no se tocan**: son comentarios preexistentes y la
convención no los arrastra a la limpieza. Por la misma regla, en el JSDoc de
`SEED_ROLE_PERMISSIONS` las líneas que añade o modifica la rama (la frase del Empacador y la línea
que la precede si se partió para acogerla) quedan sin `R<n>` ni `QC-<n>`.

El **ordinal** de la enmienda («cuarta», «quinta») y el **recuento** («dieciséis», «diecisiete»)
se escriben al implementar contra el catálogo que haya en `dev` (D4): si QC-142 ha entrado antes,
esta es la quinta y el número lo suma a su recuento; si no, es la cuarta y QC-142 lo ajustará. Un
ordinal no cita ninguna ficha, así que la convención lo admite.

**`SEED_ROLE_PERMISSIONS` queda así** (el orden del Administrador sigue el de `PERMISSIONS`, porque
`permissions.test.ts:124` lo compara con `toEqual` contra la lista del requisito):

```ts
[ROLE_ADMINISTRADOR]: [ /* …los que haya hoy… */, 'terminados.consultar' ],
[ROLE_OPERADOR]: ['inventario.consultar', 'asignaciones.consultar'],
[ROLE_EMPACADOR]: ['asignaciones.consultar', 'terminados.consultar'],
```

El comentario del JSDoc de `SEED_ROLE_PERMISSIONS` se amplía con una frase, sin citas: el
Empacador nace con exactamente esos dos, **sin** `inventario.consultar` y **sin**
`asignaciones.modificar` (el origen, D5, se queda en este spec).

## 2.1 El rol

```ts
export const ROLE_EMPACADOR = 'Empacador'

export const SEED_ROLES = [
  { name: ROLE_ADMINISTRADOR, description: 'Acceso total al sistema.' },
  { name: ROLE_OPERADOR, description: 'Operacion del dia a dia.' },
  { name: ROLE_EMPACADOR, description: 'Prepara los pedidos asignados y consulta los terminados.' },
] as const
```

La descripción es una **propuesta** de este spec (la decisión D1 dice «con su descripción» y no la
fija); sigue el estilo de las otras dos: frase corta, sin tildes, con punto. Se aprueba con el spec.
Va **al final** de `SEED_ROLES` para que los ids sintéticos `rol-0`/`rol-1` que los tests unitarios
del seed derivan del índice no cambien para los dos roles existentes.

---

## 3. La migración: `db/migrations/<ts>_packer_role/`

### 3.1 `migration.sql` (UP) — solo datos, cuatro sentencias, en este orden

Se crea con `pnpm run db:migrate:create` para que Prisma confirme que **no hay drift de esquema**
(R20, R26): el archivo generado debe salir vacío de DDL. Si Prisma emite los `DROP CONSTRAINT` de
las FK escritas a mano (el aviso conocido de QC-86), se **borran** a mano, igual que hicieron
QC-66 y QC-86, y se deja dicho en la cabecera.

```sql
-- 1. El rol. Primera vez que una migracion inserta en `roles`: sin esta fila, los subselect del
--    paso 3 no encontrarian al Empacador en una base ya sembrada y no insertarian nada, en silencio.
--    `id` sale del DEFAULT gen_random_uuid(); `updated_at` no tiene default y va explicito.
INSERT INTO "roles" ("name", "description", "updated_at") VALUES
  ('Empacador', 'Prepara los pedidos asignados y consulta los terminados.', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 2. El permiso (forma literal de QC-66).
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('terminados.consultar', 'terminados', 'consultar',
   'Consultar todos los pedidos terminados de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 3a. El Administrador gana el permiso nuevo.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'terminados.consultar' FROM "roles" AS "r"
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

-- 3b. El Empacador: exactamente sus dos, uno a uno.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('asignaciones.consultar'), ('terminados.consultar')) AS "p"("code")
WHERE "r"."name" = 'Empacador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
```

- **Ninguna sentencia nombra al Operador** (R17: sus asignaciones no cambian).
- **Idempotente** por `ON CONFLICT DO NOTHING` en las cuatro (R18): sobre una base donde el seed ya
  creó el rol, el permiso o las asignaciones, no falla y no reescribe. `roles_name_key` es el índice
  único que respalda `ON CONFLICT ("name")`.
- Los literales `'Empacador'`, `'Administrador'` y las descripciones se **duplican** aquí porque una
  migración no puede importar TypeScript. `db/` queda fuera del barrido de R2, igual que el literal
  `'Administrador'` de QC-86 queda fuera de `guard-rol-administrador-unico`. El test estático (§6)
  compara estos literales **importando** `ROLE_EMPACADOR`, `SEED_ROLES`, `PERMISSIONS` y
  `SEED_ROLE_PERMISSIONS`, para que divergir sea rojo.
- Las tres tablas tienen `FORCE ROW LEVEL SECURITY` sin policies desde QC-4/QC-74; las migraciones de
  QC-66 y QC-86 ya escribieron en `permissions` y `role_permissions` con la misma conexión de
  `prisma migrate deploy`, así que `roles` se comporta igual. Esta migración no toca ninguna RLS.

### 3.2 Caso límite aceptado

Si en producción alguien ya creó a mano un rol llamado `Empacador` con otros permisos, el UP lo
**reutiliza** (no lo pisa) y le **añade** los dos que faltan; no le quita los que ya tuviera. Es el
mismo contrato del seed desde QC-74 R10 («una asignación añadida a mano sobrevive»), y quitar filas
sería inventar una decisión que nadie tomó.

### 3.3 `down.sql` — cuatro `DELETE`, en orden inverso y acotados

```sql
DELETE FROM "role_permissions" WHERE "permission_code" = 'terminados.consultar';
DELETE FROM "role_permissions"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Empacador');
DELETE FROM "permissions" WHERE "code" = 'terminados.consultar';
DELETE FROM "roles" WHERE "name" = 'Empacador';
```

- Las asignaciones **primero**: `role_permissions_permission_code_fkey` y la FK hacia `roles` son
  `RESTRICT` (criterio literal de los `down.sql` de QC-66 y QC-86).
- El primer `DELETE` borra `terminados.consultar` de **cualquier** rol, no solo de los dos que puso
  el UP: el `RESTRICT` no deja otra salida y un permiso huérfano no es el estado anterior.
- **Si algún usuario tiene el rol**, el último `DELETE` choca con `users_role_id_fkey`
  (`ON DELETE RESTRICT`, `20260806122638_users_and_roles/migration.sql:69`) y falla con `23503`.
  `scripts/db-rollback.ts` aplica el `down.sql` y borra la fila de `_prisma_migrations` en la
  **misma** transacción, así que la reversión entera se deshace (R21). Es deliberado: reasignar a esas
  personas a otro rol sería inventar un dato; el fallo tiene que ser ruidoso.
- Sin `INSERT`, `UPDATE`, `ALTER`, `DROP` ni `CASCADE`.

---

## 4. Autorización: la diferencia es por permiso (D4)

- **Nada de producción cambia para autorizar**: el Empacador pasa por `requirePermission` como
  cualquiera (R12, R13). La diferencia con el Operador es **solo** el conjunto de permisos sembrado.
- **La guardia `tests/guards/guard-autorizacion-por-permiso.test.ts` se amplía** (R11):
  `buildForbiddenPatterns()` (`:178-189`) suma `literal del rol Empacador` (derivado de
  `ROLE_EMPACADOR` importado del barril, con la misma función `literal()`) y el identificador
  `ROLE_EMPACADOR`. El ancla de `:430-443` se **tensa** con los dos nombres nuevos, y un caso
  sintético demuestra que `const x = '<ROLE_EMPACADOR>'` dispara y que un comentario no.
- **R2** (literal único) se prueba con un test propio que barre `lib/`, `app/` y `middleware.ts`
  sin comentarios y exige que el literal `Empacador` entre comillas aparezca solo en
  `lib/modules/identity/domain/roles.ts`. Mismo patrón que `guard-rol-administrador-unico.test.ts`,
  pero en `tests/unit/identity/roles/` porque protege un requisito de esta ficha, no una convención
  transversal.
- **R16** (sin consumidor) se prueba con el mismo barrido buscando `terminados.consultar` fuera de
  `permissions.ts`. **QC-145 tendrá que relajar ese caso** cuando lo consuma: el test lo dice en su
  mensaje de fallo, con el nombre de la ficha, como hizo QC-86 con su R29. (Es un mensaje de
  `expect`, no un comentario: `docs/conventions.md > Comentarios` no lo alcanza.)

## 4.1 Guardia de escritura sobre `roles` (R27) — añadido el 2026-09-22

**Hallazgo al leer el código.** Hoy la única escritura de producción sobre `roles` es
`db.role.create` en `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts:72`
(el `createRole` del seed); no hay SQL crudo sobre `roles`, `permissions` ni `role_permissions` en
`lib/`, `app/`, `components/` ni `hooks/`, ni escrituras anidadas del tipo `role: { create … }`.
R27 se cumple, pero por casualidad: `guard-permisos-no-administrables.test.ts` solo mira los
modelos `Permission` y `RolePermission`, y el único barrido que conoce `role.create` es el de
`tests/unit/identity/roles/scope.test.ts`, que se limita a los cinco archivos nuevos de la ficha
que lo escribió.

**Dónde vive: se amplía `tests/guards/guard-permisos-no-administrables.test.ts`.** Ya tiene todo
lo que R27 necesita y exactamente con la misma exención:

1. **`PERMISSION_MODELS` suma `'Role'`** (el nombre de `model Role` en `db/schema.prisma:32`). El
   accessor `role` sale de `prismaAccessor` y el patrón `\.role\.(?:<verbos>)\b` de
   `buildForbiddenWrites()`, sin escribir nada a mano. Se renombra la constante a algo que no diga
   solo «permission» (p. ej. `CATALOG_MODELS`) si el implementador lo ve más claro; no es
   obligatorio. `\.role\.` no casa con `actor.roles.x` ni con `rolePermission` (el punto que sigue a
   `role` lo impide).
2. **Un detector de SQL crudo** `(insert\s+into|update|delete\s+from)\s+"?(roles|permissions|role_permissions)"?\b`
   (insensible a mayúsculas, sin bandera `g`), el mismo que ya validó
   `tests/unit/identity/roles/scope.test.ts:152-153`, aplicado al fuente sin comentarios. Se aplica a
   las tres tablas y no solo a `roles` porque cuesta lo mismo y hoy ninguna de las tres tiene SQL de
   escritura en producción (comprobado): el barrido de Prisma no ve un `$executeRaw`, y R7 cubre
   las tres. Su nombre en el mensaje: `escritura SQL sobre <tabla>`.
3. **La exención no cambia**: sigue siendo el adaptador del seed, un archivo. `db/` sigue fuera del
   barrido (la migración es la vía permitida).

**Anclas que se tensan** (se pondrán rojas y se actualizan nombrando la entrada nueva):

- «la exención sigue siendo necesaria»: `delSeed` pasa a `['… permission', '… rolePermission',
  '… role']` (el seed escribe en **las tres** tablas; si dejara de crear roles, rojo).
- «los modelos y los verbos se derivan de constantes documentadas»: la lista de nombres de
  `buildForbiddenWrites()` suma `escritura Prisma sobre role`, y el bucle de `model X {` comprueba
  también `model Role {`.
- El texto del `describe` y del mensaje de fallo del primer caso nombran también los roles.

**Casos sintéticos nuevos** (nombre del caso con `R27`; comentarios sin citas):

- **Dispara**: un `role-actions.ts` sintético con `'use server'` y `prisma.role.create({ data })`
  → `['escritura Prisma sobre role']`; los ocho `PRISMA_WRITE_VERBS` sobre `tx.role.<verbo>` caen
  todos; un `$executeRaw` con `DELETE FROM "roles" WHERE "id" = …` → `['escritura SQL sobre roles']`.
- **No dispara** (simétrico): `prisma.role.findMany({ select })`, `findUniqueOrThrow`, `count`; un
  `SELECT "id", "name" FROM "roles"`; un comentario de línea y uno de bloque que mencionan
  `prisma.role.create` o `INSERT INTO "roles"`; y `actor.roles.create` (plural, no es el modelo).

**Lo que la ampliación NO cubre, dicho en voz alta.** La mitad «de contrato» por nombre de export
(`isPermissionMutationName`) no se extiende a `Role`: la raíz `rol` casa con demasiadas palabras
(`control`, `enrollment`) y cualquier implementación que escriba cae igualmente en el barrido de
escrituras, que no depende de cómo se llame nada. El puerto del seed ya queda cubierto por el caso
existente «el puerto del seed no declara ningún método upsert, update ni delete»: declara
`createRole` (permitido) y ningún mutador.

---

## 5. Tests que hoy fijan el recuento o los roles y se pondrán rojos

Todos se actualizan en esta feature (tasks T6–T8). Ninguno se relaja a `toBeGreaterThan` ni a
`toContain`: los números se **suben** y las listas se **amplían** nombrando la entrada nueva.

**Recuento del catálogo (hoy `15`)** — pasan a «catálogo previo + 1», escrito como número literal
al implementar:

| Archivo:línea | Qué fija |
|---|---|
| `tests/unit/identity/permissions.test.ts:20-36` | `CODIGOS_DEL_REQUISITO` (lista a mano): suma `terminados.consultar` |
| `tests/unit/identity/permissions.test.ts:44-53` | `MODULOS`: suma `terminados` (enmienda R1, como `usuarios`) |
| `tests/unit/identity/permissions.test.ts:69` | `MODULOS_SIN_ESCRITURA = ['dashboard']`: suma `terminados` |
| `tests/unit/identity/permissions.test.ts:88-91` | `toEqual` + `size).toBe(15)` |
| `tests/unit/identity/permissions.test.ts:123-125` | Administrador `toEqual(CODIGOS_DEL_REQUISITO)` (verde si el orden coincide; el título dice «quince») |
| `tests/unit/identity/permissions.test.ts:193-200` | `toHaveLength(15)` (QC-123 R15) |
| `tests/guards/guard-permisos-sembrados.test.ts:124-132` | `PERMISSIONS.length).toBe(15)` y su mensaje |
| `tests/guards/guard-nav-permisos-declarados.test.ts:130` | `CODIGOS_VALIDOS).toHaveLength(15)` (el ancla de 9 enlaces de `:105` **no** cambia) |
| `tests/unit/navegacion/qc75-convenciones.test.ts:55-71` | `CODIGOS_QC74` (lista a mano) |
| `tests/unit/navegacion/qc75-convenciones.test.ts:121-123` | `toHaveLength(15)` |
| `tests/unit/navegacion/qc75-convenciones.test.ts:137-145` | módulos esperados: suma `terminados` |
| `tests/unit/documentos/authorization.test.ts:158` | `toHaveLength(15)` |
| `tests/unit/asignaciones/schema/order-assignments-migration.test.ts:870-871` | `PERMISSIONS.length).toBe(15)` y `- 2 = 13`: se reescribe para derivar «lo que había antes de QC-86» restando también lo que añadieron las fichas posteriores |
| `tests/unit/identity/grupos/scope.test.ts:200` | `PERMISOS_ESPERADOS = 15` |
| `tests/unit/identity/roles/scope.test.ts:196` | `PERMISOS_ESPERADOS = 15` |
| `tests/unit/identity/seed/seed-initial-access.test.ts:731` | `TOTAL_DE_ASIGNACIONES_DEL_SEED).toBe(17)` → admin + 2 + 2 |
| `tests/unit/identity/seed/seed-initial-access.test.ts:748` | `codigosDelAdministrador).toHaveLength(15)` |
| `tests/integration/identity/identity-seed.int.test.ts:776-777` | `toBe(15)`, `toBe(17)` |
| `tests/integration/identity/identity-seed.int.test.ts:894-895, 924-925` | `toHaveLength(15)`, `toHaveLength(17)` |

**Roles del seed (hoy dos)**:

| Archivo:línea | Qué fija |
|---|---|
| `tests/unit/identity/permissions.test.ts:202-205` | claves de `SEED_ROLE_PERMISSIONS` = `[Administrador, Operador]` |
| `tests/unit/identity/seed/seed-initial-access.test.ts:252-261` | base vacía crea `[Administrador, Operador]` |
| `tests/unit/identity/seed/seed-initial-access.test.ts:325-340` | «falta Operador, existe Administrador → crea solo Operador»: ahora crea Operador **y** Empacador |
| `tests/integration/identity/identity-seed.int.test.ts:259, 267` | el reset y la lectura filtran `name in [Administrador, Operador]`: pasan a derivarse de `SEED_ROLES`. **No se pone rojo solo**, pero sin el cambio el Empacador sobrevive al reset y «base vacía» deja de serlo |
| `tests/integration/identity/identity-seed.int.test.ts:375-394` | primera corrida crea `[Administrador, Operador]` (rojo en cuanto el reset borre al Empacador) |
| `tests/guards/guard-autorizacion-por-permiso.test.ts:430-443` | ancla de patrones (rojo en cuanto se amplía §4) |

**No se ponen rojos** (derivan del dato real o filtran por módulo): `guard-permisos-sembrados.test.ts:140-149`
(deriva de `SEED_ROLES`), `tests/unit/identity/schema/user-permissions-migration.test.ts` (filtra
`usuarios`), `tests/integration/identity/role-catalog.int.test.ts` (tolerante a otros roles por
diseño, `:17-18`), `e2e/usuarios.spec.ts:360-368` (elige `Operador` por nombre).

**Choque previsible con QC-142.** Las dos fichas añaden al final de `PERMISSIONS`, de la lista del
Administrador y de las mismas listas a mano de la tabla de arriba. La segunda en mergear resuelve el
conflicto sumando las dos entradas y subiendo el número otra vez; ninguna de las dos lo fija aquí.

---

## 6. Tests nuevos

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/unit/identity/roles/empacador-rol.test.ts` | unit | R1 (fila en `SEED_ROLES`, los otros dos intactos), R2 (barrido del literal), R3 (el modelo `Role` de `db/schema.prisma` no tiene campo de empresa), R16 (barrido de `terminados.consultar`) |
| `tests/unit/identity/permissions.test.ts` (ampliado) | unit | R4, R5, R6 *(enmendado el 2026-09-22)*: se localiza en el JSDoc de `PERMISSIONS` el párrafo que nombra `terminados.consultar`; tiene como mucho cinco líneas, contiene «enmienda» y `lib/modules/`, y ni él ni la primera frase del JSDoc (la del recuento) casan con `/QC-\d+\|\bR\d+\b\|design\.md\|decisi[oó]n cerrada/i`; más el caso simétrico sobre un JSDoc sintético con `(QC-144)` que el mismo detector sí caza. R8, R9, R10 |
| `tests/unit/identity/schema/packer-role-migration.test.ts` | unit estático | R7, R17, R18, R20, R21: sentencias del UP (solo `INSERT … ON CONFLICT DO NOTHING` sobre las tres tablas, ninguna DDL, ningún `Operador`), literales comparados contra `ROLE_EMPACADOR`/`SEED_ROLES`/`PERMISSIONS`/`SEED_ROLE_PERMISSIONS` importados, orden y acotación de los `DELETE` del DOWN, sin `CASCADE`. Plantilla: `user-permissions-migration.test.ts` |
| `tests/guards/guard-autorizacion-por-permiso.test.ts` (ampliado) | guardia | R11 |
| `tests/guards/guard-permisos-no-administrables.test.ts` (ampliado, 2026-09-22) | guardia | R27 (§4.1) |
| `tests/unit/asignaciones/empacador-authorization.test.ts` | unit | R12 (los cuatro casos de uso de asignados conceden con los permisos del Empacador), R13 (`listProducts`, `getProduct`, `createProduct` de `inventario` y `assignResponsibles`, `unassignResponsible`, `removeWorkGroupFromOrder` de `asignaciones` rechazan sin invocar puertos). El actor se construye con `SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]`, nunca con una lista copiada |
| `tests/unit/navegacion/menu-empacador.test.ts` | unit | R15: `filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, <permisos del Empacador>)` deja solo `nav-asignacion` y `firstVisibleNavHref` devuelve `ASSIGNED_ORDERS_ROUTE` |
| `tests/integration/identity/packer-role-migration.int.test.ts` | integración | R17 (en transacción revertida: base sembrada, se borran rol/permiso/asignaciones de esta ficha para simular «antes de QC-144», se ejecuta el UP **leído del archivo** y se comprueban filas exactas y Operador intacto), R18 (UP dos veces sobre base ya sembrada: mismos conteos y mismas filas, `updated_at` incluido), R21 (DOWN leído del archivo: sin usuarios Empacador deja la base como antes; con uno, falla con `23503`). Patrón de lectura del SQL: `identity-seed.int.test.ts:327-350` |
| `tests/integration/identity/identity-seed.int.test.ts` (ampliado) | integración | R19 (dos corridas = una, con el Empacador), R25 (para **cada** rol de `SEED_ROLES`, `codigosEnBaseDe(tx, rol)` es exactamente `codigosSembradosDe(rol)`), R3 (una sola fila `Empacador`) |
| `tests/integration/identity/role-catalog.int.test.ts` (ampliado) | integración | R22: `listAllRoles()` incluye `Empacador` y sigue sin incluir `Administrador` |
| `tests/integration/identity/user-crud.int.test.ts` (ampliado) | integración | R23 (alta y edición con el rol Empacador se aceptan y persisten), R3 (dos usuarios de empresas distintas con el mismo rol) |
| `tests/integration/asignaciones/assigned-orders.int.test.ts` (ampliado) | integración | R14: un usuario Empacador ve solo sus pedidos asignados, no los de otro responsable ni los de otra empresa |

R24 y R26 no llevan test nuevo: R24 se verifica en la revisión (el diff no toca `e2e/`) y R26 lo
hacen cumplir `guard-dependencias-aprobadas` y el test estático de la migración (sin DDL); el gate
completo comprueba además que `db/schema.prisma` y las migraciones no divergen.

---

## 7. Alternativas descartadas

1. **Tercera acción en un módulo real: `asignaciones.<verbo>` (p. ej. `asignaciones.supervisar`).**
   Cumple QC-74 R1 al pie de la letra (`asignaciones` sí es carpeta), y QC-74 ya preveía que un día
   apareciera «aprobar» o «exportar». Se descarta porque rompe **tres** reglas vigiladas en vez de
   una: la acción fuera de `{consultar, modificar}` (`permissions.test.ts:78`,
   `qc75-convenciones.test.ts:149-152`) y «un módulo con escritura declara exactamente consultar y
   modificar» (`permissions.test.ts:99-105`, QC-74 R3). Además ningún verbo dice «ver los terminados
   de todos» mejor que `terminados.consultar`, y abrir la puerta a verbos libres sin que el humano lo
   haya decidido es reabrir la decisión «dos permisos por módulo» de QC-74.
2. **Reutilizar `pedidos.consultar`.** Ya existe y «ve pedidos». Se descarta: abre la pantalla
   `/pedidos` entera (el menú la muestra y la página la deja pasar), y D2 dice que el Empacador usa
   **la misma pantalla que el Operador**, `/asignacion`, sin más. Además contradice D4 («gana
   exactamente una entrada»).
3. **Distinguir por nombre de rol** (`if (actor.roleName === ROLE_EMPACADOR)`). Prohibido por D4 y
   por `guard-autorizacion-por-permiso` (QC-74 R18/R20); ni se considera más allá de nombrarlo.
4. **Solo seed, sin migración.** Menos SQL duplicado. Se descarta: el seed corre en la instalación,
   no en cada despliegue, así que una base ya sembrada no tendría ni el rol ni el permiso (QC-74 R5,
   D9). Es el mismo razonamiento que llevó a QC-66 y QC-86 a migrar.
5. **Migración sin `INSERT INTO "roles"`, confiando en que el seed cree el rol después.** Los
   subselect por nombre del paso 3b no encontrarían al Empacador y la migración se aplicaría «en
   verde» sin asignarle nada; el rol aparecería luego, cuando alguien corriera el seed, sin permisos
   hasta la corrida siguiente. Descartado por silencioso.
6. *(2026-09-22, R27)* **Una guardia nueva `tests/guards/guard-roles-no-administrables.test.ts`.**
   Deja intacta la guardia de QC-74 y separa responsabilidades por tabla. Se descarta porque
   duplicaría entero el andamiaje (`findRepoRoot`, `listProductionFiles`, `stripComments` con su
   orden línea-antes-que-bloque y el caso anti-cegado, el ancla de más de 200 archivos) y, sobre
   todo, **la lista de exentos**: dos copias del mismo adaptador del seed pueden divergir el día que
   el seed se mude, y una de las dos guardias perdonaría a un archivo inocente mientras el culpable
   pasa. Las tres tablas son un solo catálogo que solo cambia por migración y seed (R7): una sola
   guardia con una sola exención lo dice mejor.
7. *(2026-09-22, R27)* **Ampliar `tests/unit/identity/roles/scope.test.ts`**, que ya conoce
   `role.create` y el SQL sobre `roles`. Se descarta porque barre solo los cinco archivos nuevos de
   la ficha que lo escribió (`ARCHIVOS_NUEVOS_DE_LA_FEATURE`): es un test de alcance de esa ficha,
   no una guardia del árbol, y ampliarlo mezclaría dos contratos distintos en un archivo.

---

## 8. Dependencias de terceros

Ninguna (D9, R26). No hay librería nueva que evaluar.
