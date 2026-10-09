# QC-221 — permiso-y-modulo-de-integraciones · design.md

> Zona: `backend` · Complejidad: `low` · depends_on: — · Rama:
> `feature/QC-221-permiso-y-modulo-de-integraciones`
>
> El **qué** está en `requirements.md` (R1–R23). Aquí va el **cómo**. Precedentes directos:
>
> - `specs/QC-142-*`, con la migración `20260924130000_documents_permissions`: un permiso nuevo
>   que solo recibe el Administrador, por migración y seed.
> - `specs/QC-216-rol-administrador-de-acondicionamiento/`: la enmienda más reciente al catálogo
>   y la forma de este spec.
> - `specs/QC-15-arquitectura-hexagonal-y-modulos/`: un módulo armazón con `.gitkeep`.
> - QC-86: creó `asignaciones` sin operaciones y lo dejó fuera del barrido de autorización hasta
>   QC-87.
>
> **Regla transversal.** Manda `docs/conventions.md > Comentarios`: ningún comentario nuevo, ni de
> producción ni de test, cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». En los tests,
> `R<n>` va en el **nombre del caso**.

---

## Lo que ya existe

Buscado `integraciones`, `integración`, `whatsapp`, `proveedor-ia`, `proveedor de IA` e
`inventarios` en tres sitios:

- `feature_list.json`, por `name` y `description`, en todos los estados;
- `specs/`, con grep;
- el código, con el grafo (`search_graph` «integration provider whatsapp ai provider config») y
  con grep sobre `lib/`, `app/`, `tests/`, `db/`, `components/`, `e2e/` y `middleware.ts`.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| QC-119 `webhook-whatsapp-recepcion` (épica QC-118 «Canal WhatsApp») | Endpoint que recibe mensajes de WhatsApp. Estado **`cancelled`** | Nada que reutilizar. No se solapa: esta ficha no recibe mensajes ni configura WhatsApp |
| `lib/modules/documentos/adapters/driven/config/ai-config-env.ts` (`readAiConfigFromEnv`, `readAnthropicConfigFromEnv`) | La configuración de hoy del proveedor de IA de `documentos`: global, por variables de entorno | **No se toca.** Es el precedente que deberá mirar la ficha que configure `/integraciones/proveedor-ia` (`requirements.md > Preguntas abiertas 4`) |
| QC-209 `importar-inventario-desde-excel` (`done`) | Importar inventario desde un Excel | No es una integración con un sistema externo. Nada que reutilizar |
| Código | Ningún símbolo, ruta, permiso ni carpeta `integraciones` en el código | — |

Conclusión: no existe nada de esta ficha. Ni QC-220, ni QC-221, ni QC-222 están todavía en el
`feature_list.json` de la raíz. La ficha llega por el encargo del leader y por
`progress/features/QC-221.md`.

---

## 0. Hallazgos al leer el código (este worktree)

1. **Catálogo actual: 25 códigos** (`lib/modules/identity/domain/permissions.ts:73-226`). El
   último es `acondicionamiento.modificar` (QC-216 ya está en la base). Con esta feature quedan
   **26**.
2. **Roles de semilla: 5** (Administrador, Operador, Empacador, Maestro y Administrador de
   acondicionamiento). No cambian.
3. **El Administrador tiene 21 permisos** (`permissions.ts:252-274`), en el orden del catálogo y
   sin los de `ADMIN_EXCLUDED_PERMISSIONS`. `permissions.test.ts:60-62` lo deriva como
   `CODIGOS_DEL_REQUISITO` menos los excluidos y lo compara con `toEqual`, **orden incluido**.
   Por eso el permiso va al final de los dos: del catálogo y del conjunto del Administrador.
4. **Las acciones admitidas** (`permissions.test.ts:219-222`, `qc75-convenciones.test.ts:169-175`)
   son `consultar` y `modificar`, más `ejecutar`, que solo existe en `asignaciones`. Hay tres
   clases de módulo:
   - **con escritura**, que declara `consultar` y `modificar`;
   - **sin escritura**, que declara solo `consultar`: `dashboard` y `terminados`;
   - **solo escritura**, que declara solo `modificar`: `empaque` y `acondicionamiento`
     (`MODULOS_SOLO_ESCRITURA`, `:214`).
5. **El middleware no decide por permiso.** `route-guard-middleware.ts:8-15` y
   `domain/route-access.ts:8-21` responden con `allow` o `redirect` según la sesión. QC-75 R16
   retiró la lista ruta→rol y R18 prohíbe que el borde consulte la base. Lo vigila
   `tests/guards/guard-middleware-edge.test.ts`, y `docs/architecture.md > Permisos y
   autenticacion` lo dice. **No existe una «regla ruta→permiso»**: el corte por permiso es el
   `requirePagePermission(...)` de cada `page.tsx`.
6. **`guard-rutas-privadas-cubiertas` muerde en los dos sentidos** (`:132-162`): toda pantalla
   necesita un prefijo, y **todo prefijo necesita una pantalla**. Una fila nueva en
   `PRIVATE_ROUTE_PREFIXES` sin su `page.tsx` pone la guardia en rojo.
7. **Hay constantes de ruta sin pantalla.** `FORGOT_PASSWORD_ROUTE` (`routes.ts:216-217`) existe
   sin página. El tramo intermedio `/configuracion` no tiene constante propia: cada hermana
   (`PRESENTATIONS_ROUTE`, `UNITS_ROUTE`, `USERS_ROUTE`) lleva su URL completa como literal.
   Ninguna guardia exige página para una constante de ruta.
8. **Hay páginas que exigen un permiso `modificar`.** Por ejemplo,
   `app/(private)/asignacion/empaque/[id]/page.tsx:53` exige `empaque.modificar`, y
   `configuracion/unidades/page.tsx:69` exige `unidades.modificar`. Un módulo de solo escritura no
   rompe la convención de las pantallas: `guard-pantallas-exigen-permiso` solo exige que el
   código exista en el catálogo.
9. **Forma del módulo** (`guard-arquitectura-modulos.test.ts:181-201`, bloque 1). Exige
   `index.ts` y que la raíz del módulo solo tenga `domain/`, `ports/` y `adapters/`; no mira
   dentro. Git no versiona carpetas vacías, así que el armazón lleva `.gitkeep`, como hizo QC-15
   con `inventario` (`specs/QC-15-*/design.md:191-194, 232`). `tests/unit/unidades/module-contract.test.ts:139`
   ya trata los `.gitkeep` del armazón como «no código».
10. **El barrido de autorización por permiso no incluye módulos sin casos de uso.** En
    `guard-autorizacion-por-permiso.test.ts:90`, `BUSINESS_MODULES` tiene 7 módulos. Su ancla
    (`:283-306`) exige, para cada uno, al menos un archivo **y** un `domain/actor.ts`.
    `integraciones` no tiene `actor.ts`, así que meterlo hoy pondría el ancla en rojo. Precedente:
    QC-86 creó `asignaciones` sin operaciones y fue QC-87 quien lo metió en el barrido, junto con
    su primer caso de uso (`:84-89`).
11. **Los módulos que se leen del disco no se rompen con un módulo vacío.**
    `session-once-per-request-actions.test.ts:497` recorre los `adapters/driving/` de cada
    módulo, y en este no hay `.ts`. `qc75-convenciones` y `guard-identificador-de-request`
    llevan listas de módulos **escritas a mano** que no se comparan con el disco: no se ponen
    rojos.
12. **Precedente de la migración**: `20260924130000_documents_permissions/`. El UP son dos
    `INSERT ... ON CONFLICT DO NOTHING`, sobre `permissions` y sobre `role_permissions` (en este
    último filtra por `roles.name = 'Administrador'`); el DOWN son dos `DELETE` acotados.
    Literales duplicados porque una migración no importa TypeScript. Plantillas de test:
    `tests/unit/identity/schema/documents-permissions-migration.test.ts` y
    `tests/integration/identity/documents-permissions-migration.int.test.ts`.

---

## 1. Qué cambia (resumen)

| Pieza | Cambio |
|---|---|
| `lib/modules/identity/domain/permissions.ts` | Entrada `integraciones.modificar` **al final** de `PERMISSIONS`. Párrafo de enmienda. El código, al final del conjunto `[ROLE_ADMINISTRADOR]` de `SEED_ROLE_PERMISSIONS` |
| `lib/modules/integraciones/` | Nuevo armazón: `index.ts` vacío y `.gitkeep` en `domain/`, `ports/`, `adapters/driven/` y `adapters/driving/` |
| `lib/shared/routes.ts` | Tres constantes nuevas. **No** entran en `PRIVATE_ROUTE_PREFIXES` |
| `db/migrations/<ts>_integrations_permission/migration.sql` + `down.sql` | Nuevos. Solo datos |
| Tests | Los rojos de §6 y los nuevos de §7 |

**No se tocan**:

- `lib/modules/identity/domain/roles.ts`, `seed-initial-access.ts` y `scripts/seed.ts`;
- `ADMIN_EXCLUDED_PERMISSIONS`;
- `db/schema.prisma` y `package.json`;
- `app/**`, `components/**` y `hooks/**`;
- `lib/shared/navigation/**`;
- `middleware.ts` y `route-guard-middleware.ts`;
- `lib/composition/**`;
- `e2e/**`.

---

## 2. El permiso nuevo: `integraciones.modificar`

```ts
{
  code: 'integraciones.modificar',
  module: 'integraciones',
  action: 'modificar',
  description: 'Ver y configurar las integraciones con servicios externos.',
},
```

- **Módulo `integraciones`.** Es una carpeta real de `lib/modules/` (§3), así que cumple QC-74 R1
  al pie de la letra, como `asignaciones` y `clientes`.
- **Solo `modificar`, sin `consultar`.** D6 pide **un** permiso. La pantalla de una integración
  es para configurarla, y quien la configura la ve y la cambia con el mismo permiso. Es la tercera
  instancia de la clase «solo escritura», tras `empaque` y `acondicionamiento`. Que una página
  exija un `modificar` ya tiene precedente (hallazgo 8). La alternativa `consultar` se descarta en
  §9.
- **Posición: última entrada**, detrás de `acondicionamiento.modificar`. Así el orden de los 25
  previos no cambia (R2) y los tests que comparan «lo posterior» solo suman una entrada.
- **Descripción**: es una propuesta; la confirma el humano en F1.4 (`requirements.md > Preguntas
  abiertas 3`). No nombra las tres integraciones para no atar el texto a la lista de hoy.

**El párrafo de enmienda** del JSDoc de `PERMISSIONS` va detrás del de `acondicionamiento` y antes
de «El catalogo solo cambia por migracion y seed». Tiene cuatro líneas y ninguna cita (R3):

```
 * **Otra enmienda al catalogo cerrado**: suma `integraciones.modificar`, ver y configurar las
 * integraciones con servicios externos. Su modulo si es una carpeta de `lib/modules/` y, como
 * `empaque`, solo declara `modificar`: quien configura una integracion la ve con el mismo permiso.
 * Lo recibe unicamente el Administrador.
```

**`SEED_ROLE_PERMISSIONS`**: `'integraciones.modificar'` va como **última** entrada de
`[ROLE_ADMINISTRADOR]`, detrás de `'documentos.modificar'`. Ningún otro rol se toca (R5, R6). No
hace falta añadir ninguna frase al JSDoc de `SEED_ROLE_PERMISSIONS`: el conjunto del Administrador
no se explica allí.

**`ADMIN_EXCLUDED_PERMISSIONS` no cambia** (R5).

---

## 3. El módulo `lib/modules/integraciones/` y las rutas

### 3.1 El armazón

```
lib/modules/integraciones/
  index.ts                 ← `export {};`  (contrato vacío: no hay dominio que exponer)
  domain/.gitkeep
  ports/.gitkeep
  adapters/driven/.gitkeep
  adapters/driving/.gitkeep
```

- **`index.ts` = `export {};`**, sin nada más. Es un contrato vacío y legítimo, porque «solo
  reexporta de `./domain`» y no hay nada que reexportar. No lleva comentario: el porqué está aquí.
  Nadie lo importa (R12).
- **Los `.gitkeep`** existen para que git versione el armazón (hallazgo 9). Los borra la primera
  ficha que meta un archivo real en cada carpeta, como hizo QC-14 con `inventario`.
- **No entra en `BUSINESS_MODULES`** de `guard-autorizacion-por-permiso` (hallazgo 10). R8 se
  prueba con un test propio que reutiliza el detector de esa guardia (§7). **Frontera con las
  fichas siguientes:** la primera ficha que traiga un caso de uso a `integraciones` lo añade a
  `BUSINESS_MODULES`, con su `domain/actor.ts`, igual que hizo QC-87 con `asignaciones`.
- **Sin modelo Prisma ni `lib/composition`** (R12, R13): no hay puerto que cablear.

### 3.2 Las tres constantes de ruta

Van en `lib/shared/routes.ts`, detrás de `CUSTOMERS_ROUTE` y antes de `PRIVATE_ROUTE_PREFIXES`:

```ts
export const AI_PROVIDER_INTEGRATION_ROUTE = '/integraciones/proveedor-ia';
export const INVENTORY_INTEGRATION_ROUTE = '/integraciones/inventarios';
export const WHATSAPP_INTEGRATION_ROUTE = '/integraciones/whatsapp';
```

- **Sin constante para el tramo `/integraciones`.** Es el mismo criterio que `/configuracion`
  (hallazgo 7): no hay pantalla en esa URL. QC-222 decidirá si el menú necesita una.
- **Un solo comentario** encima de las tres, de como mucho tres líneas y sin citas. Dice por qué
  aún no están en `PRIVATE_ROUTE_PREFIXES`: esa lista solo admite rutas con pantalla, y el corte
  por permiso lo pondrá cada página.
- **Nombres** (pregunta abierta 5). Se usa el sufijo `_INTEGRATION_ROUTE` y no el prefijo
  `INTEGRATIONS_` porque `INVENTORY_INTEGRATION_ROUTE` se lee como «la integración de
  inventario». Ninguno de los tres contiene la subcadena `INVENTORY_ROUTE`, así que no lo cazan
  las regex sin límite de palabra que buscan esa constante.
- **El literal `/integraciones/inventarios` contiene `/inventario`.** No afecta a la decisión del
  borde: `isUnderPrefix` compara por segmentos (`route-access.ts:72-74`), así que
  `/integraciones/inventarios` no cae bajo `/inventario`. R14 lo prueba con
  `decideRouteAccess`.

---

## 4. Las rutas y su protección (choque con la ficha, decidido aquí)

**La ficha pide** que las tres rutas queden «protegidas por el permiso en el middleware y en la
regla ruta→permiso». **El código no lo admite** (hallazgos 5 y 6):

| Lo que pide la ficha | Lo que hay | Si se hiciera en esta ficha |
|---|---|---|
| Corte por permiso en el middleware | El middleware solo mira la sesión, por decisión de QC-75 (R16 y R18): sin rol, sin permisos y sin consultar la base | Reabre QC-75 y pone en rojo `guard-middleware-edge` |
| «Regla ruta→permiso» | No existe: QC-75 la retiró. El corte es el `requirePagePermission` de cada `page.tsx` | Sin `page.tsx` (fuera de alcance) no hay dónde ponerla |
| Corte por sesión (`PRIVATE_ROUTE_PREFIXES`) | Solo admite prefijos con pantalla | Pone en rojo `guard-rutas-privadas-cubiertas` (ningún prefijo sobra) |

**Decisión (R15).** En esta ficha las tres rutas son **solo constantes**. No figuran en
`PRIVATE_ROUTE_PREFIXES`, no tienen enlace en el menú y no tienen `page.tsx`. Mientras sea así no
hay nada que proteger: Next responde 404 a cualquiera, con o sin sesión. La protección llega
**entera y a la vez** con QC-222, que para cada ruta añade:

1. el `page.tsx`, que abre con `await requirePagePermission('integraciones.modificar')` antes de
   leer nada. Es el corte por permiso, con 404 para quien no lo tiene;
2. su fila en `PRIVATE_ROUTE_PREFIXES`, que es el corte por sesión. Puede ser una fila por ruta o
   una sola, `/integraciones`, si QC-222 crea una pantalla en ese tramo;
3. el `NavLink.permission = 'integraciones.modificar'` de su enlace del menú, vigilado por
   `guard-nav-permisos-declarados`.

Cuando QC-222 lo haga, enmienda R15 y relaja R9 (§8). Está anotado como `requirements.md >
Preguntas abiertas 1`: si el humano quiere otra cosa, la decide en F1.4.

---

## 5. La migración: `db/migrations/<ts>_integrations_permission/`

El timestamp tiene que ser posterior a la última migración de `dev` al implementar (hoy
`20261007120100_order_terminated_finished_index`). Se crea con `pnpm run db:migrate:create` para
confirmar que no hay drift (R13, R19). Si Prisma genera `DROP CONSTRAINT` o `DROP INDEX` de
objetos escritos a mano (drift conocido, QC-86/QC-161), se borran y se dice en la cabecera.

### 5.1 `migration.sql` (UP): dos sentencias, solo datos

```sql
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('integraciones.modificar', 'integraciones', 'modificar',
   'Ver y configurar las integraciones con servicios externos.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'integraciones.modificar' FROM "roles" AS "r"
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
```

- **Va al rol por su nombre, como `documents_permissions`.** No es autorización por rol. La
  migración siembra el dato y, a partir de ahí, toda decisión se toma por permiso. Las guardias de
  literal de rol no barren `db/`.
- **No hereda por permiso** (a diferencia del tercer `INSERT` de `documents_permissions`). D1 dice
  «solo el Administrador», y heredar de, por ejemplo, `usuarios.modificar` podría dárselo a un rol
  creado a mano.
- **Idempotente** gracias a `ON CONFLICT DO NOTHING` (R17).
- **No escribe en `roles`** (R19). Si en la base no existe el rol `Administrador`, el segundo
  `INSERT` no inserta nada y el seed lo completa.
- **RLS**: las dos tablas ya la tienen forzada, y esta migración no la toca.
- **Cabecera** de como mucho cinco líneas y sin citas. Dice tres cosas: que solo escribe datos,
  que es idempotente y que los literales se duplican porque una migración no importa TypeScript.

### 5.2 `down.sql`: dos `DELETE` acotados

```sql
DELETE FROM "role_permissions" WHERE "permission_code" = 'integraciones.modificar';
DELETE FROM "permissions" WHERE "code" = 'integraciones.modificar';
```

- Las asignaciones van primero porque `role_permissions_permission_code_fkey` es `RESTRICT`.
- Ningún usuario referencia un permiso, así que el DOWN no puede fallar por datos. Sin `INSERT`,
  `UPDATE`, `ALTER`, `DROP` ni `CASCADE` (R20).

### 5.3 El seed

**El código del seed no cambia.** `seedInitialAccess` ya crea los permisos de `PERMISSIONS` y las
asignaciones de `SEED_ROLE_PERMISSIONS` que faltan (R18). En una base vacía, el permiso y la
asignación salen del seed; en una ya sembrada, de la migración.

---

## 6. Tests que hoy fijan el catálogo y se pondrán rojos

Ninguno se relaja a `toContain` ni a `toBeGreaterThan`: las listas escritas a mano **nombran** la
entrada nueva. Las líneas son de este worktree, y el implementer las vuelve a localizar contra
`dev`.

| Archivo:línea | Qué fija | Cambio |
|---|---|---|
| `tests/unit/identity/permissions.test.ts:23-49` | `CODIGOS_DEL_REQUISITO` | Suma `integraciones.modificar` al final. `CODIGOS_DEL_ADMINISTRADOR` lo hereda solo |
| `tests/unit/identity/permissions.test.ts:181-196` | `MODULOS` | Suma `integraciones` |
| `tests/unit/identity/permissions.test.ts:214` | `MODULOS_SOLO_ESCRITURA` | Suma `integraciones`. No estaba rojo; se amplía para que R1 quede vigilado |
| `tests/unit/identity/permissions.test.ts:270-292` | Catálogo = previo + documentos + empaque + empresas + acondicionamiento | Filtra el código nuevo y lo suma al final |
| `tests/unit/identity/permissions.test.ts` (los demás bloques que comparan el catálogo como «previo + cola»: QC-144/clientes, empresas y el R5 de QC-216, `:1008-1020`) | Cola exacta | Lo mismo: filtrar y sumar al final |
| `tests/unit/identity/permissions.test.ts:779-840` | `PERMISOS_POSTERIORES` | Suma la entrada con sus tres campos |
| `tests/unit/navegacion/qc75-convenciones.test.ts:53-79` | `CODIGOS_QC74` | Suma el código |
| `tests/unit/navegacion/qc75-convenciones.test.ts:148-167` | Módulos esperados | Suma `integraciones` a `esperados`, junto a `acondicionamiento`, y **no** a `MODULOS_DE_NEGOCIO` (`:82-91`). Esa lista también alimenta `RUTAS_CONGELADAS` (`:212-220`), que describe el rango de commits de QC-75 y no debe cambiar de significado. El comentario de `:150-153` nombra `integraciones` como módulo de solo escritura que **sí** es carpeta |
| `tests/unit/asignaciones/schema/order-assignments-migration.test.ts:~860-883` | `CODIGOS_DE_FICHAS_POSTERIORES` | Suma el código |

**No se ponen rojos**, porque derivan del dato real:

- `guard-permisos-sembrados`: el permiso tiene rol;
- `catalogo-sin-total-fijo`;
- `seed-initial-access.test.ts`: los totales son derivados;
- `guard-nav-permisos-declarados` y `guard-pantallas-exigen-permiso`: no hay ni enlace ni página
  nuevos;
- `guard-rutas-privadas-cubiertas`: no hay prefijo nuevo;
- `guard-arquitectura-modulos`: el armazón cumple el bloque 1;
- `guard-autorizacion-por-permiso`: `integraciones` no entra en su barrido;
- `acondicionamiento-rol.test.ts`: el R17 de QC-216 barre otro código.

Si alguno se pone rojo en `dev`, se actualiza nombrando la entrada; nunca se relaja.

---

## 7. Tests nuevos y ampliados

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/unit/identity/permissions.test.ts` (bloque nuevo) | unit | **R1**: entrada exacta, y ningún otro `integraciones.*`. **R2**: catálogo = `CODIGOS_DEL_REQUISITO` sin el código, más el código al final; `PERMISOS_PREVIOS` y `PERMISOS_POSTERIORES` intactos. **R3**: párrafo de ≤ 5 líneas que contiene «enmienda», el código y `lib/modules/`, y no casa con `/QC-\d+\|\bR\d+\b\|design\.md\|decisi[oó]n cerrada/i`; lo acompaña un simétrico sintético con `(QC-221)` que el detector caza. **R5**: el Administrador lleva el código como última entrada, su conjunto sin él es exactamente el previo, y el código no está en `ADMIN_EXCLUDED_PERMISSIONS`. **R6**: Operador, Empacador, Maestro y Administrador de acondicionamiento, exactos y sin el código |
| `tests/unit/integraciones/module-shape.test.ts` | unit | **R10**: raíz = `index.ts`, `domain/`, `ports/` y `adapters/`, que contiene `driven/` y `driving/`. **R11**: el `index.ts` sin comentarios es exactamente `export {};` y no hay `.ts`/`.tsx` bajo las tres carpetas, con un caso sintético que dispara con un `domain/x.ts`. **R12**: barrido de `lib/`, `app/`, `components/`, `hooks/` y `middleware.ts`: ningún import de `@/lib/modules/integraciones` ni de una ruta relativa que resuelva al módulo; `lib/composition/` no lo nombra. **R8**: aplica `findForbiddenPatternsInSource`, importado de `tests/guards/guard-autorizacion-por-permiso.test.ts` (precedente de importar de una guardia: `credential-help-contract.test.ts:10`), a cada `.ts` del módulo; un sintético con `roleName === 'Administrador'` dispara. **R9**: barrido de producción (`app/`, `lib/`, `components/`, `hooks/`, `middleware.ts`, `db/`, sin comentarios): el código solo aparece en `permissions.ts` y en `db/migrations/`. Tiene anticegado (el barrido sí ve el catálogo) y su mensaje de fallo explica cómo relajarlo cuando QC-222 lo consuma. **R13**: `db/schema.prisma` no contiene `@module integraciones` |
| `tests/unit/integraciones/integration-routes.test.ts` | unit | **R14**: las tres constantes, importadas de `@/lib/shared/routes`, valen exactamente las tres URL. Barrido de producción: los tres literales solo están en `routes.ts`. `decideRouteAccess` con `PRIVATE_ROUTE_PREFIXES` reales: `/integraciones/inventarios` con sesión anónima da `allow` y no cae bajo `/inventario`. **R15**: ninguna de las tres URL ni `/integraciones` está en `PRIVATE_ROUTE_PREFIXES`; ningún `NavLink` aplanado de `PRIVATE_NAV_ITEMS` tiene un `href` bajo `/integraciones`; no existe `app/**/integraciones/**/page.tsx`. El mensaje de fallo dice que QC-222 lo enmienda |
| `tests/unit/identity/schema/integrations-permission-migration.test.ts` | unit estático | **R4, R16, R17, R19, R20**. Carpeta única por `/_integrations_permission$/`. UP = dos `INSERT … ON CONFLICT … DO NOTHING`, sobre `permissions` y `role_permissions` en ese orden. Los literales se comparan con `PERMISSIONS` y `ROLE_ADMINISTRADOR` importados. Ninguna DDL y ninguna escritura en `roles`. DOWN = dos `DELETE` acotados por el código, en el orden de §5.2, sin `CASCADE`, `INSERT`, `UPDATE` ni `ALTER`. Casos de sensibilidad: quitar un `ON CONFLICT`, invertir el DOWN y quitar un `WHERE`. Plantilla: `documents-permissions-migration.test.ts` |
| `tests/integration/identity/integrations-permission-migration.int.test.ts` | integración | En una transacción que se revierte. **R16**: base sembrada; se borran el permiso y su asignación; se ejecuta el UP **leído del archivo**; filas exactas; las asignaciones de los otros cuatro roles son idénticas antes y después. **R17**: UP dos veces, mismos conteos y mismas filas, `updated_at` incluido. **R20**: DOWN leído del archivo; la base queda como antes del UP. Plantilla: `documents-permissions-migration.int.test.ts` |
| `tests/integration/identity/identity-seed.int.test.ts` (ampliado) | integración | **R18**: dos corridas producen lo mismo que una, con el permiso incluido. **R21**: el bucle por rol de `SEED_ROLES` ya existente cubre el conjunto exacto; se añade el caso que nombra el código y afirma que solo lo tiene el Administrador |
| `tests/integration/identity/session-user.int.test.ts` (ampliado) | integración | **R7**: la sesión de un Administrador incluye el código. Las de un Operador y un Administrador de acondicionamiento, no |

R22 y R23 no llevan test nuevo:

- **R22** se verifica en revisión: el diff no toca `e2e/`.
- **R23** lo cubren `guard-dependencias-aprobadas`, para `package.json`, y la revisión del diff,
  para las rutas prohibidas. La lista exacta está en `tasks.md > Archivos esperados`.

R4 lo vigila, además, `guard-permisos-no-administrables` sin cambios: esta feature no abre ninguna
vía nueva.

---

## 8. Fronteras con las fichas siguientes (anotadas, no se implementan aquí)

1. **QC-222 (menú y pantallas).** Trae las tres piezas de protección de §4. Al hacerlo:
   - enmienda **R15**: prefijos, enlaces y páginas;
   - relaja **R9**: abre las rutas exactas de sus `page.tsx` y de `private-nav.ts`;
   - escribe la E2E (D5).

   QC-222 **no compila** sin esta ficha mergeada, porque `PermissionCode` es una unión de literales.
   Ya figura como bloqueada por QC-221.
2. **La primera ficha con un caso de uso en `integraciones`**:
   - mete el módulo en `BUSINESS_MODULES` de `guard-autorizacion-por-permiso`, con su
     `domain/actor.ts` (§3.1);
   - borra los `.gitkeep` que dejen de hacer falta;
   - ajusta **R11**.
3. **La ficha del proveedor de IA** tiene que decidir qué hace con la configuración global de
   `documentos` (`ai-config-env.ts`): sustituirla, convivir con ella o leer de ella. Ver la
   pregunta abierta 4.

---

## 9. Alternativas descartadas

1. **Proteger ya las rutas en el middleware por permiso** (lo que dice literalmente la ficha).
   Exige que el borde conozca los permisos: o se lee el rol de la cookie, que QC-75 R16 prohíbe,
   o se consulta la base, que QC-75 R18 prohíbe. `guard-middleware-edge` se pondría en rojo, y
   sería reabrir una decisión de arquitectura desde una ficha `low`. §4.
2. **Una tabla ruta→permiso en `lib/shared/`**, por ejemplo
   `INTEGRATION_ROUTE_PERMISSIONS = { [ruta]: 'integraciones.modificar' }`. Es justo la «lista
   paralela que se desincroniza» que QC-75 retiró (`guard-pantallas-exigen-permiso.test.ts:3-9`).
   Además, `lib/shared` no puede importar `PermissionCode` y nadie la leería: ni el middleware,
   que no decide por permiso, ni las páginas, que no existen.
3. **Añadir ya las rutas, o `/integraciones`, a `PRIVATE_ROUTE_PREFIXES`** con una excepción en
   `guard-rutas-privadas-cubiertas`. Relaja una guardia para proteger URL que no sirven nada.
   QC-222 lo hace sin excepción, junto con sus páginas.
4. **Crear `page.tsx` de marcador** para poder declarar el prefijo y el corte. Lo prohíbe el
   alcance (D3: ninguna `page.tsx`).
5. **`integraciones.consultar` como único permiso.** Encaja con la costumbre de que las páginas
   abran con `consultar`, pero autorizaría **configurar** con un permiso que se llama «consultar».
   Además, la ficha que configure algo tendría que sumar `modificar` y pasar el módulo de «sin
   escritura» a «con escritura», tocando otra vez las listas de §6.
6. **Dos permisos, `integraciones.consultar` y `integraciones.modificar`** (la forma «módulo con
   escritura» de QC-74 R3). D6 dice «un permiso nuevo».
7. **Una acción nueva, `integraciones.configurar`.** Rompe `accionAdmitida`: solo se admiten
   `consultar` y `modificar`, más `ejecutar` en `asignaciones` (QC-201 R2), y lo vigilan dos
   tests. Ninguna decisión humana pide reabrirlo.
8. **Meter `integraciones` ya en `BUSINESS_MODULES`** de la guardia de autorización. Su ancla
   exige un `domain/actor.ts` que un módulo sin casos de uso no tiene. Habría que crear un
   `actor.ts` vacío, que es un caso de uso fantasma, o relajar el ancla. El precedente de QC-86 y
   QC-87 lo resuelve esperando al primer caso de uso; R8 cubre el hueco con el mismo detector.
9. **Heredar el permiso por otro permiso en la migración**, como hace `documents_permissions` con
   `proveedores.modificar`. D1 dice «solo el Administrador», y heredar se lo daría a cualquier rol
   creado a mano que tenga el permiso de origen.
10. **Solo seed, sin migración.** Las bases ya sembradas no tendrían el permiso hasta correr el
    seed a mano (QC-74 R5; el mismo razonamiento que QC-144 §7.4).

---

## 10. Dependencias de terceros

Ninguna (R23). No hay librería nueva que evaluar.

---

## 11. Decisiones nuevas para F1.4 (las propone `spec_author`, las confirma el humano)

| # | Propuesta | Dónde |
|---|---|---|
| N1 | Código `integraciones.modificar`, solo `modificar` | §2, pregunta abierta 2 |
| N2 | Las tres rutas son solo constantes; prefijo, menú y corte por permiso llegan con QC-222 | §4, R15, pregunta abierta 1 |
| N3 | Descripción: «Ver y configurar las integraciones con servicios externos.» | §2, pregunta abierta 3 |
| N4 | Constantes `AI_PROVIDER_INTEGRATION_ROUTE`, `INVENTORY_INTEGRATION_ROUTE` y `WHATSAPP_INTEGRATION_ROUTE` | §3.2, pregunta abierta 5 |
| N5 | `integraciones` entra en `BUSINESS_MODULES` con su primer caso de uso, no ahora | §3.1, §8.2 |
