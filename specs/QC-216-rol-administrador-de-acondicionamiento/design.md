# QC-216 — rol-administrador-de-acondicionamiento · design.md

> Zona: `backend` · Complejidad: `medium` · depends_on: — · Rama:
> `feature/QC-216-rol-administrador-de-acondicionamiento`
>
> El **qué** está en `requirements.md` (R1–R28). Aquí va el **cómo**. Precedentes directos:
> `specs/QC-144-rol-empacador/` (rol de semilla + permiso, migración + seed), `specs/QC-168-*`
> (`empaque.modificar`, permiso que el Administrador no recibe), `specs/QC-201-*`
> (`asignaciones.ejecutar`, vistas de `/asignacion` por permiso) y `specs/QC-161-rol-maestro/`
> (quinto rol, permisos fuera de `lib/modules/`).
>
> **Regla transversal.** Manda `docs/conventions.md > Comentarios`: ningún comentario nuevo, ni en
> producción ni en tests, cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». En los tests,
> `R<n>` va en el **nombre del caso**.

---

## 0. Hallazgos al leer el código (worktree en `1a1db86e`)

1. **Catálogo actual: 24 códigos**, en este orden (`lib/modules/identity/domain/permissions.ts:62-208`):
   `dashboard.consultar`, `inventario.{consultar,modificar}`, `recetas.{consultar,modificar}`,
   `unidades.{consultar,modificar}`, `proveedores.{consultar,modificar}`,
   `pedidos.{consultar,modificar}`, `usuarios.{consultar,modificar}`,
   `asignaciones.{consultar,modificar,ejecutar}`, `terminados.consultar`,
   `clientes.{consultar,modificar}`, `documentos.{consultar,modificar}`, `empaque.modificar`,
   `empresas.{consultar,modificar}`. Con esta feature: **25**.
2. **Roles de semilla: 4** (`roles.ts:16-21`): Administrador, Operador, Empacador, Maestro. Con
   esta feature: **5**.
3. **Asignaciones del seed: 29** (Administrador 21, Operador 3, Empacador 3, Maestro 2). Con esta
   feature: **31** (el Administrador no cambia, el rol nuevo suma 2).
4. **`ADMIN_EXCLUDED_PERMISSIONS`** (`permissions.ts:265-269`) = `empaque.modificar`,
   `empresas.consultar`, `empresas.modificar`. Es la vía ya establecida para que «el Administrador
   tiene el catálogo menos lo excluido» siga siendo cierto sin escribir totales.
5. **Qué abre hoy `/asignacion`.** La página corta con `requirePagePermission('asignaciones.consultar')`
   (`app/(private)/asignacion/page.tsx:56`) y el enlace del menú exige el mismo código
   (`lib/shared/navigation/private-nav.ts:273`). Es el permiso que tiene el Empacador para entrar.
   Ningún otro caso de uso de producción exige `asignaciones.consultar` salvo
   `listAssignedOrders` (`lib/modules/asignaciones/domain/list-assigned-orders.ts:59`), que **sin
   `asignaciones.ejecutar` devuelve una página vacía antes de tocar ningún puerto** (`:66`).
   Conclusión: `asignaciones.consultar` es lo mínimo para entrar y, por sí solo, no muestra ningún
   pedido.
6. **Las vistas de `/asignacion`** las decide `resolveAssignmentViews`
   (`lib/modules/asignaciones/domain/assignment-views.ts:48-60`) solo por permisos. Con
   `{asignaciones.consultar, acondicionamiento.modificar}` devuelve la reserva `['asignados']`, que
   sale vacía por el punto 5, y la página no pinta pestañas (`page.tsx:99`, `views.length > 1`).
7. **El selector de roles** (`role-catalog-prisma.ts:24`) excluye por nombre exacto a Administrador y
   Maestro, y la gestión de usuarios (`user-admin-prisma.ts:243`) declara no asignables a esos dos.
   El rol nuevo se llama distinto, así que entra en el selector sin tocar nada. Sale ordenado por
   nombre ascendente: **«Administrador de acondicionamiento» será la primera opción**, antes de
   Empacador y Operador. El formulario arranca con `roleId: ''` (`user-form.tsx:294`), así que nada
   lo preselecciona.
8. **Empresa obligatoria.** El disparador `users_check_company_by_role`
   (`20261001160815_platform_maestro_role/migration.sql:60-81`) exige empresa a todo rol distinto de
   `Maestro`: un usuario con el rol nuevo tiene empresa sin tocar nada.
9. **Las guardias de literal del rol Administrador no se confunden.** `guard-rol-administrador-unico`
   y `guard-autorizacion-por-permiso` buscan `['"\`]Administrador['"\`]` (comilla pegada a ambos
   lados), que no casa con `'Administrador de acondicionamiento'`. Sí casarían varias regex de tests
   sin límites de palabra como `/ROLE_ADMINISTRADOR/` (`tests/unit/pedidos/order-actions.test.ts:261`,
   `tests/unit/proveedores/supplier-actions.test.ts:245`, `tests/unit/identity/grupos/authorization.test.ts:519`,
   `tests/unit/proveedores/authorization.test.ts:559`) **si la constante empezara por
   `ROLE_ADMINISTRADOR`**: de ahí el nombre elegido en §2.1.
10. **Guardia que se adapta sola**: `guard-permisos-sembrados.test.ts` deriva los roles de
    `SEED_ROLES` y exige que todo permiso tenga rol; `catalogo-sin-total-fijo.test.ts` prohíbe
    escribir totales literales del catálogo en tests, así que ningún test afirma «24».

---

## 1. Qué cambia (resumen)

| Pieza | Cambio |
|---|---|
| `lib/modules/identity/domain/roles.ts` | `ROLE_ACONDICIONAMIENTO` y su fila **al final** de `SEED_ROLES`; cabecera «los cinco literales» |
| `lib/modules/identity/domain/permissions.ts` | entrada `acondicionamiento.modificar` **al final** de `PERMISSIONS`; párrafo de enmienda; clave `[ROLE_ACONDICIONAMIENTO]` en `SEED_ROLE_PERMISSIONS`; el código entra en `ADMIN_EXCLUDED_PERMISSIONS` |
| `lib/modules/identity/index.ts` | reexporta `ROLE_ACONDICIONAMIENTO` |
| `db/migrations/<ts>_conditioning_role/migration.sql` + `down.sql` | nuevos, solo datos |
| Tests | §5 (rojos que se actualizan) y §6 (nuevos) |

**No se tocan**: `seed-initial-access.ts` (ya recorre `SEED_ROLES` y `SEED_ROLE_PERMISSIONS`),
`scripts/seed.ts`, `db/schema.prisma`, `package.json`, `app/**`, `components/**`, `middleware.ts`,
`lib/shared/**`, `lib/modules/asignaciones/**`, `lib/modules/inventario/**`, `e2e/**`.

---

## 2. El permiso nuevo: `acondicionamiento.modificar`

```ts
{
  code: 'acondicionamiento.modificar',
  module: 'acondicionamiento',
  action: 'modificar',
  description:
    'Comenzar y terminar el acondicionamiento de los pedidos de la empresa y registrar sus datos de lote.',
},
```

- **Por qué `modificar` y solo `modificar`.** D2 dice «un permiso nuevo», singular. Es el mismo caso
  que `empaque.modificar`: quien lo tiene trabaja sobre pedidos que ve por la pestaña que ese mismo
  permiso abre (QC-217), no necesita una consulta aparte. `acondicionamiento` pasa a ser el segundo
  módulo «solo escritura» junto a `empaque`. `consultar` sería un segundo código que D2 no pide.
- **Por qué no `ejecutar`.** `permissions.test.ts:818-833` y `qc75-convenciones.test.ts:166-168`
  fijan que `ejecutar` solo existe en `asignaciones` (QC-201 R2). Usarlo aquí sería reabrir esa regla.
- **Módulo `acondicionamiento`**: no es carpeta de `lib/modules/` (igual que `usuarios`,
  `terminados`, `empaque`, `empresas`). Dónde vivan los casos de uso que lo exijan es cosa de
  QC-215/QC-217/QC-218; el código vive centralizado en `identity` como todos.
- **Posición: última entrada**, detrás de `empresas.modificar`. Cualquier posición rompe las mismas
  listas a mano (§5); al final, el orden de los 24 previos no cambia (R5) y los tests que filtran «lo
  posterior» solo suman una entrada.
- **Descripción**: propuesta, la confirma el humano en F1.4 (`requirements.md > Preguntas abiertas 2`).
  Nombra el lote porque QC-219 autoriza la escritura de lote con este mismo permiso.

**Párrafo de enmienda** en el JSDoc de `PERMISSIONS` (R6), detrás del de `asignaciones.ejecutar` y
antes de «El catalogo solo cambia por migracion y seed», con este texto (cuatro líneas, sin citas):

```
 * **Otra enmienda al catalogo cerrado**: suma `acondicionamiento.modificar`, comenzar y terminar el
 * acondicionamiento y registrar sus datos de lote. Como `empaque`, su modulo no es una carpeta de
 * `lib/modules/` y solo escribe. Lo recibe unicamente el Administrador de acondicionamiento: el
 * Administrador no.
```

No se le pone ordinal: los párrafos de `documentos`, `empaque` y `asignaciones.ejecutar` ya no lo
llevan y contar a mano es lo que se rompe en el siguiente merge.

**`SEED_ROLE_PERMISSIONS`**: `[ROLE_ACONDICIONAMIENTO]: ['asignaciones.consultar', 'acondicionamiento.modificar']`
como última clave, y una frase en su JSDoc: «El Administrador de acondicionamiento nace con
exactamente `asignaciones.consultar` y `acondicionamiento.modificar`.» El Administrador, el
Operador, el Empacador y el Maestro **no se tocan** (R9, R10).

**`ADMIN_EXCLUDED_PERMISSIONS`** suma `'acondicionamiento.modificar'` al final, y su JSDoc dice por
qué en una frase: el acondicionamiento es tarea del rol nuevo; el Administrador lo supervisa desde
«Todos».

## 2.1 El rol

```ts
export const ROLE_ACONDICIONAMIENTO = 'Administrador de acondicionamiento'
// en SEED_ROLES, al final:
{ name: ROLE_ACONDICIONAMIENTO, description: 'Acondiciona los pedidos empacados de la empresa.' },
```

- **Nombre de la constante: `ROLE_ACONDICIONAMIENTO`, no `ROLE_ADMINISTRADOR_ACONDICIONAMIENTO`.**
  Hallazgo 9: con el prefijo `ROLE_ADMINISTRADOR`, cuatro tests que buscan `/ROLE_ADMINISTRADOR/`
  sin límite de palabra tratarían una importación legítima del rol nuevo como si fuera el
  Administrador, y una lectura rápida del código confundiría los dos roles.
- **Descripción**: propuesta, la confirma el humano en F1.4.
- **Global** (R3): `model Role` no tiene empresa (`db/schema.prisma`), igual que el resto.

---

## 3. La migración: `db/migrations/<ts>_conditioning_role/`

Timestamp posterior a la última de `dev` al implementar (hoy `20261006140000_inventory_movements_adjustment_count`).
Se crea con `pnpm run db:migrate:create` para confirmar que no hay drift (R24, R28); si Prisma
genera `DROP CONSTRAINT`/`DROP INDEX` de objetos escritos a mano (drift conocido, QC-86/QC-161), se
borran y se dice en la cabecera.

### 3.1 `migration.sql` (UP) — tres sentencias, solo datos

```sql
-- 1. El rol.
INSERT INTO "roles" ("name", "description", "updated_at") VALUES
  ('Administrador de acondicionamiento', 'Acondiciona los pedidos empacados de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 2. El permiso.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('acondicionamiento.modificar', 'acondicionamiento', 'modificar',
   'Comenzar y terminar el acondicionamiento de los pedidos de la empresa y registrar sus datos de lote.',
   CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 3. El rol nuevo: exactamente sus dos, uno a uno. Ninguna sentencia nombra a otro rol.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('asignaciones.consultar'), ('acondicionamiento.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador de acondicionamiento'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
```

- **Ninguna sentencia nombra a `Administrador`, `Operador`, `Empacador` ni `Maestro`** (R21): el
  Administrador no gana el permiso (D3) y nadie más cambia.
- **Idempotente** por `ON CONFLICT DO NOTHING` (R22); `roles_name_key` respalda `ON CONFLICT ("name")`.
- **Literales duplicados** porque una migración no importa TypeScript; el test estático (§6) los
  compara contra `ROLE_ACONDICIONAMIENTO`, `SEED_ROLES`, `PERMISSIONS` y `SEED_ROLE_PERMISSIONS`
  importados.
- **RLS**: las tres tablas ya la tienen forzada; no se toca (R24).
- **Caso límite aceptado** (heredado de QC-144 §3.2): si ya existiera a mano un rol con ese nombre y
  otros permisos, el UP lo reutiliza y le añade los dos que falten, sin quitarle nada.

### 3.2 `down.sql` — cuatro `DELETE`, en orden inverso y acotados

```sql
DELETE FROM "role_permissions" WHERE "permission_code" = 'acondicionamiento.modificar';
DELETE FROM "role_permissions"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Administrador de acondicionamiento');
DELETE FROM "permissions" WHERE "code" = 'acondicionamiento.modificar';
DELETE FROM "roles" WHERE "name" = 'Administrador de acondicionamiento';
```

- Asignaciones primero (`role_permissions_permission_code_fkey` es `RESTRICT`).
- Si algún usuario tiene el rol, el último `DELETE` choca con `users_role_id_fkey` (`RESTRICT`) y
  falla con `23503`; `scripts/db-rollback.ts` aplica el down y borra la fila de `_prisma_migrations`
  en la misma transacción, así que no queda nada a medias (R25).
- Sin `INSERT`, `UPDATE`, `ALTER`, `DROP` ni `CASCADE`.

### 3.3 El seed

No cambia de código: `seedInitialAccess` ya crea los roles de `SEED_ROLES`, los permisos de
`PERMISSIONS` y las asignaciones de `SEED_ROLE_PERMISSIONS` que falten (R23). En una base vacía, el
rol nuevo y sus dos asignaciones salen del seed; en una sembrada, de la migración.

---

## 4. Autorización: por permiso (D4)

- **Ningún código de producción autoriza por el rol nuevo.** La diferencia con el resto es solo el
  conjunto sembrado.
- **`tests/guards/guard-autorizacion-por-permiso.test.ts` se amplía** (R11):
  `buildForbiddenPatterns()` suma `literal del rol Administrador de acondicionamiento` (derivado de
  `ROLE_ACONDICIONAMIENTO` con la misma función `literal()`) y el identificador
  `/\bROLE_ACONDICIONAMIENTO\b/`. El ancla de `:446-465` se tensa con los dos nombres nuevos en su
  posición (tras `literal del rol Maestro` y tras `ROLE_MAESTRO`). Casos sintéticos: literal con las
  tres comillas (dispara), constante importada y usada (dispara), literal en comentario de línea y de
  bloque (no dispara).
- **R2** (literal único) y **R17** (sin consumidor) se prueban en un test propio,
  `tests/unit/identity/roles/acondicionamiento-rol.test.ts`, con el barrido de `maestro-rol.test.ts`
  (mismo `PRODUCTION_DIRS`, `IGNORED_DIRS`, `stripComments`). El mensaje de fallo de R17 dice qué
  hacer cuando QC-215/QC-217 lo consuman: abrir aquí sus rutas exactas, como hizo QC-145 con el de
  `terminados.consultar`. (Es texto de `expect`, no comentario.)
- **R7** lo vigilan ya `guard-permisos-no-administrables.test.ts` (escrituras sobre `roles`,
  `permissions`, `role_permissions` fuera del adaptador del seed) sin cambios: no hay vía nueva.

---

## 5. Tests que hoy fijan catálogo o roles y se pondrán rojos

Ninguno se relaja a `toContain`/`toBeGreaterThan`: las listas a mano **nombran** la entrada nueva.
Las líneas son de este worktree; el implementer las vuelve a localizar contra `dev`.

| Archivo:línea | Qué fija | Cambio |
|---|---|---|
| `tests/unit/identity/permissions.test.ts:22-47` | `CODIGOS_DEL_REQUISITO` (R2 `:245`) | suma `acondicionamiento.modificar` al final |
| `tests/unit/identity/permissions.test.ts:177-191` | `MODULOS` (R1 `:239`) | suma `acondicionamiento` |
| `tests/unit/identity/permissions.test.ts:209` | `MODULOS_SOLO_ESCRITURA` | suma `acondicionamiento` (no rojo; se amplía para que R4 quede vigilado) |
| `tests/unit/identity/permissions.test.ts:265-285` | catálogo = previo + documentos + empaque + empresas | filtra y suma `acondicionamiento.modificar` al final |
| `tests/unit/identity/permissions.test.ts:354-374` | ídem con clientes | ídem |
| `tests/unit/identity/permissions.test.ts:393-399` | `[...previo, empaque, ...empresas]` | ídem |
| `tests/unit/identity/permissions.test.ts:610-613` | claves de `SEED_ROLE_PERMISSIONS` = 4 roles | suma `ROLE_ACONDICIONAMIENTO` |
| `tests/unit/identity/permissions.test.ts:732-737` | Administrador = requisito − empresas − empaque | resta también `acondicionamiento.modificar` |
| `tests/unit/identity/permissions.test.ts:762-816` | `PERMISOS_POSTERIORES` (QC-201 R1) | suma la entrada con sus tres campos |
| `tests/unit/identity/permissions.test.ts:902-909` | `ADMIN_EXCLUDED_PERMISSIONS` exacto | suma `acondicionamiento.modificar` |
| `tests/unit/navegacion/qc75-convenciones.test.ts:53-78` | `CODIGOS_QC74` (`:130`) | suma el código al final |
| `tests/unit/navegacion/qc75-convenciones.test.ts:147-164` | módulos esperados | suma `acondicionamiento` y lo nombra en el comentario como no-carpeta y solo escritura |
| `tests/unit/asignaciones/schema/order-assignments-migration.test.ts:872-882` | `CODIGOS_DE_FICHAS_POSTERIORES` | suma el código |
| `tests/unit/identity/roles/maestro-rol.test.ts:144-151` | orden exacto de `SEED_ROLES` | suma el rol al final (y el título deja de decir «los tres de antes» si hace falta) |
| `tests/unit/identity/roles/empacador-rol.test.ts:~160` | orden exacto de `SEED_ROLES` | ídem |
| `tests/guards/guard-autorizacion-por-permiso.test.ts:446-465` | ancla de patrones | rojo **cuando** se amplía §4; se tensa |

**Se amplían sin estar rojos** (para que el rol nuevo quede cubierto): 
`tests/integration/identity/identity-seed.int.test.ts:1033` (bucle de roles sin `empresas.*`),
`tests/integration/identity/role-catalog.int.test.ts` (R18), `tests/integration/identity/user-crud.int.test.ts`
(R19, R3), `tests/unit/identity/require-page-permission.test.ts` (R13).

**No se ponen rojos** (derivan del dato real): `guard-permisos-sembrados.test.ts` (deriva de
`SEED_ROLES`), `catalogo-sin-total-fijo.test.ts`, `seed-initial-access.test.ts`
(`TOTAL_DE_ASIGNACIONES_DEL_SEED` y `NOMBRES_DE_SEED_ROLES` derivados), `identity-seed.int.test.ts`
(reset y R25 derivados de `SEED_ROLES`), `guard-nav-permisos-declarados.test.ts`,
`guard-rol-administrador-unico.test.ts` (hallazgo 9).

**Choque previsible.** QC-215 y QC-217 tocarán `permissions.ts` solo si añaden permisos (no deberían)
y el barrido de R17 cuando consuman el código. Ver §7.

---

## 6. Tests nuevos

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/unit/identity/roles/acondicionamiento-rol.test.ts` | unit | R1 (fila al final, los cuatro previos intactos en nombre, descripción y orden), R2 (barrido del literal + sintético con tres comillas + simétrico), R3 (una sola fila en `SEED_ROLES`; `model Role` sin empresa), R17 (barrido del código fuera de `permissions.ts`, con anti-cegado: el barrido sí ve el catálogo) |
| `tests/unit/identity/permissions.test.ts` (bloque nuevo) | unit | R4 (entrada exacta, ningún otro `acondicionamiento.*`), R5 (catálogo = `CODIGOS_DEL_REQUISITO` sin el código + el código al final; `PERMISOS_PREVIOS` y `PERMISOS_POSTERIORES` intactos), R6 (párrafo ≤ 5 líneas con «enmienda», el código y `lib/modules/`, sin citas; simétrico sintético con `(QC-216)` que el detector caza), R8 (conjunto exacto y la lista negativa), R9 (Administrador sin el código, código en `ADMIN_EXCLUDED_PERMISSIONS`, conjunto del Administrador = requisito − excluidos), R10 (Operador, Empacador, Maestro exactos y sin el código) |
| `tests/unit/identity/schema/conditioning-role-migration.test.ts` | unit estático | R7, R21, R22, R24, R25: carpeta única por `/_conditioning_role$/`; UP = tres `INSERT … ON CONFLICT … DO NOTHING` sobre las tres tablas, en ese orden; literales comparados contra las constantes importadas; ninguna DDL; ninguna mención de `'Administrador'`, `'Operador'`, `'Empacador'` ni `'Maestro'` como literal exacto; DOWN = cuatro `DELETE` acotados en el orden de §3.2, sin `CASCADE`/`INSERT`/`UPDATE`/`ALTER`. Casos de sensibilidad (quitar un `ON CONFLICT`, invertir el DOWN, quitar un `WHERE`). Plantilla: `packer-role-migration.test.ts` |
| `tests/integration/identity/conditioning-role-migration.int.test.ts` | integración | R21 (transacción revertida: base sembrada, se borran rol/permiso/asignaciones de esta ficha, se ejecuta el UP **leído del archivo**, filas exactas; asignaciones de los otros cuatro roles idénticas antes y después), R22 (UP dos veces: mismos conteos y mismas filas, `updated_at` incluido), R25 (DOWN leído del archivo: sin usuarios con el rol deja la base como antes; con uno, `23503`). Plantilla: `packer-role-migration.int.test.ts` |
| `tests/guards/guard-autorizacion-por-permiso.test.ts` (ampliado) | guardia | R11 |
| `tests/unit/navegacion/menu-acondicionamiento.test.ts` | unit | R12: `filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO])` deja solo `nav-asignacion`; `firstVisibleNavHref` devuelve `ASSIGNED_ORDERS_ROUTE` |
| `tests/unit/identity/require-page-permission.test.ts` (ampliado) | unit | R13: con los permisos del rol, pasa el código de `/asignacion` y responde «no encontrado» con los de `/asignacion/[id]`, `/asignacion/empaque/[id]`, `/pedidos`, `/inventario`. Los códigos se **leen de la fuente** de cada `page.tsx` (como `private-nav-usuarios.test.ts`), no se copian |
| `tests/unit/asignaciones/acondicionamiento-authorization.test.ts` | unit | R14 (`listAssignedOrders` devuelve `total = 0` sin invocar ningún puerto aunque el puerto falso tenga pedidos del actor), R15 (`listCompanyOrders`, `listFinishedOrders`, `listPackingOrders`, `getPackingOrder`, `startPacking`, `finishPacking`, `getAssignedOrderExecution`, `startAssignedOrder`, `finishAssignedOrder`, `assignResponsibles`, `unassignResponsible`, `removeWorkGroupFromOrder`, `listResponsibleCandidates` de `asignaciones` y `listProducts`, `createProduct` de `inventario` rechazan con el error de autorización de su módulo, sin invocar puertos), R16 (`resolveAssignmentViews` = `['asignados']`). Actor construido con `SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO]` |
| `tests/integration/identity/session-user.int.test.ts` (ampliado) | integración | R20: un usuario con el rol obtiene exactamente sus dos permisos en la sesión |
| `tests/integration/identity/identity-seed.int.test.ts` (ampliado) | integración | R23 (dos corridas = una, con el rol), R26 (el bucle por cada rol de `SEED_ROLES` ya existente lo cubre; se añade el caso que nombra al rol nuevo y verifica que no tiene `empresas.*` ni el Administrador el permiso), R3 (una sola fila) |
| `tests/integration/identity/role-catalog.int.test.ts` (ampliado) | integración | R18 |
| `tests/integration/identity/user-crud.int.test.ts` (ampliado) | integración | R19 (alta y edición con el rol se aceptan y persisten con la empresa del actor; sin `usuarios.modificar` se rechazan), R3 (dos usuarios de empresas distintas con el rol) |

R27 y R28 sin test nuevo: R27 se verifica en revisión (el diff no toca `e2e/`); R28 lo hacen cumplir
`guard-dependencias-aprobadas` y el test estático de la migración (sin DDL).

---

## 7. Fronteras con las fichas hermanas (anotadas, no se implementan aquí)

1. **QC-217 — vistas de `/asignacion`.** Hoy el rol cae en la vista de reserva `asignados` (vacía).
   D4 de QC-217 dice que no debe ver «Mis asignados» ni «Por empacar»: QC-217 tiene que añadir la
   vista propia (`por_acondicionar`, decidida por `acondicionamiento.modificar`) y evitar que la
   reserva `asignados` se le ofrezca. Al hacerlo **enmienda R16** de esta ficha.
2. **QC-217 — «Terminados» del acondicionador.** El rol **no** tiene `terminados.consultar` (R8, por
   D1: «ningún otro pedido»). Si QC-217 reutiliza la vista `terminados`, deberá abrirla por
   `acondicionamiento.modificar` con su propio filtro (los que acondicionó él), no dándole
   `terminados.consultar`, que hoy significa otra cosa.
3. **QC-215 / QC-217 / QC-218 / QC-219 — consumo del permiso.** Relajan el barrido de R17 abriendo
   sus rutas exactas. QC-215 **no compila** sin esta ficha mergeada (`PermissionCode` es una unión
   de literales): ver `requirements.md > Preguntas abiertas 3`.
4. **QC-218 — «salvo los Administradores» en el equipo.** El nombre del rol nuevo empieza por
   «Administrador». QC-218 debería decidir esa exclusión **por permiso** (p. ej. quien tenga
   `pedidos.consultar`, como `canBeResponsible`) y no por nombre, o el acondicionador quedaría
   fuera del equipo por casualidad léxica.
5. **Responsables de un pedido.** Con R8 el rol es elegible como responsable (`canBeResponsible`).
   No se toca; pregunta abierta 1.

---

## 8. Alternativas descartadas

1. **Abrir `/asignacion` con el permiso nuevo en vez de dar `asignaciones.consultar`**
   (`requirePagePermission` con «cualquiera de» y `NavLink.permission` como lista). Evitaría que el
   rol lleve un permiso de asignaciones. Se descarta: toca `app/(private)/asignacion/page.tsx`,
   el tipo `NavLink`, `filterNavItemsByPermissions` y su guardia `guard-nav-permisos-declarados`,
   que es justo la UI y la navegación que el Alcance deja fuera; y no gana nada, porque por el
   hallazgo 5 `asignaciones.consultar` sin `asignaciones.ejecutar` no muestra ningún pedido.
2. **Dos permisos `acondicionamiento.consultar` + `acondicionamiento.modificar`** (forma «módulo con
   escritura» de QC-74 R3). Se descarta: D2 dice «un permiso nuevo», y el precedente
   `empaque.modificar` ya estableció el módulo de solo escritura para este caso exacto.
3. **`acondicionamiento.ejecutar`.** Reabre la regla «`ejecutar` solo en `asignaciones`» (QC-201 R2),
   vigilada por dos tests. Sin decisión humana que lo pida, no.
4. **Reutilizar `empaque.modificar` o `terminados.consultar`.** D2 los prohíbe expresamente (el
   segundo, por D1: abriría la lista de entregados).
5. **Constante `ROLE_ADMINISTRADOR_ACONDICIONAMIENTO`.** Más literal respecto al nombre. Se descarta
   por el hallazgo 9 (colisiona con regex sin límite de palabra y se confunde con el Administrador).
6. **Solo seed, sin migración.** Las bases ya sembradas no tendrían ni el rol ni el permiso hasta
   correr el seed a mano (QC-74 R5; mismo razonamiento que QC-144 §7.4).
7. **Insertar el permiso tras `empaque.modificar`** (agrupado por flujo). Rompe las mismas listas a
   mano que ponerlo al final y además desplaza a `empresas.*`, con lo que también se ponen rojos los
   tests que fijan `[..., 'empaque.modificar', ...CODIGOS_DE_EMPRESAS]` como cola. Al final es menos
   ruido.

---

## 9. Dependencias de terceros

Ninguna (D7, R28). No hay librería nueva que evaluar.

---

## 10. Decisiones nuevas para F1.4 (las propone `spec_author`, las confirma el humano)

| # | Propuesta | Dónde |
|---|---|---|
| N1 | Código del permiso `acondicionamiento.modificar`, solo `modificar` | §2 |
| N2 | El rol recibe `asignaciones.consultar` como lo mínimo para entrar a `/asignacion` | §0.5, R8 |
| N3 | Textos: rol «Acondiciona los pedidos empacados de la empresa.»; permiso «Comenzar y terminar el acondicionamiento de los pedidos de la empresa y registrar sus datos de lote.» | §2, §2.1 |
| N4 | Constante `ROLE_ACONDICIONAMIENTO` | §2.1 |
| N5 | Hasta QC-217, el rol entra a `/asignacion` y ve la vista de reserva vacía, sin pestañas | R16, §7.1 |
| N6 | El rol sigue siendo elegible como responsable (sin cambio de criterio) | Pregunta abierta 1 |
| N7 | QC-215 pasa a depender de QC-216 | Pregunta abierta 3 |
