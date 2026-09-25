# QC-154 — crud-de-clientes · tasks.md

> Zona `backend` · Complejidad `medium` · Rama `feature/QC-154-crud-de-clientes`
>
> El **qué** está en `requirements.md` (R1–R40); el **cómo**, en `design.md`. `[P]` marca lo que puede
> ir en paralelo con las hermanas del mismo grupo. Cada task es un commit (`feat(QC-154): …` /
> `test(QC-154): …`) y tiene su criterio de «hecho»: si no se puede comprobar, no está hecha.
>
> **F1.4 (2026-09-24), aprobado.** P4 está aprobada con el texto «El cliente solicitado no existe.»,
> así que **T3 queda desbloqueada**. P3 y P5 se aceptan como estaban. **P2 cambia: la búsqueda ignora
> acentos**, y eso añade el **Grupo E** (T17–T21, una migración). Además cambian T4, T7, T9 y T14 y
> las filas R30/R37 de la trazabilidad, y se añaden R41–R47. Detalle en `design.md > 17`.
> **T16 (cierre) pasa a depender también del Grupo E.**
>
> **Antes de empezar (reglas de la ficha):**
> - El spec tiene que estar **aprobado** (F1.4), y la aprobación tiene que decir algo de **P4** —el
>   texto de `customer_not_found`—, porque es una **enmienda al catálogo cerrado de errores**. **T3 no
>   se empieza sin esa respuesta.** P2, P3 y P5 tienen posición por defecto escrita y no bloquean.
> - **Base de datos propia: `QuimiCloude_QC154`.** Los tests de integración corren contra ella
>   —`DATABASE_URL` y `DIRECT_URL` sobrescritos **en el entorno del comando**—, **nunca** contra la
>   compartida del `.env` (lección de QC-147).
> - **Sin E2E en esta ficha** (decisión 7): va en QC-155.
> - Los comentarios de producción **no citan fichas ni requisitos** (`docs/conventions.md >
>   Comentarios`) y no imitan los bloques largos de `proveedores` ni de `lib/composition`. `R<n>` va
>   solo en los nombres de los tests.
> - Tanda cerrada = `./init.sh --rapido` en verde. Feature cerrada, y **siempre antes del PR** =
>   `./init.sh` completo.

---

## T0 — Qué se hereda montado y NO se re-crea

**No se escribe código: se comprueba contra el árbol de la rama y se anota en
`progress/impl_QC-154-crud-de-clientes.md`.**

- **El modelo** `Customer` (`db/schema.prisma`) y la migración `20260924120000_customers`. *(F1.4)*
  **Solo una** migración nueva, la del Grupo E (R37 enmendado).
- *(F1.4)* **El precedente de búsqueda sin acentos**: `20260904160000_list_query_indexes` (relleno con
  `translate`, GIN `gin_trgm_ops` parcial, `pg_trgm` sin `DROP` en el DOWN) y `normalizeSupplierName`.
  Se lee y se copia, no se reinventa.
- **`lib/modules/clientes/domain/customer.ts`** (tipo `Customer`) y su reexport en `index.ts`. No se
  toca: `CustomerView` y `NewCustomer` se **derivan** de él.
- **Los permisos** `clientes.consultar` y `clientes.modificar` en `identity/domain/permissions.ts`,
  sembrados solo al Administrador (QC-153). `PermissionCode` ya los incluye.
- **`assertPermission`**, `SEED_ROLE_PERMISSIONS` y `getSessionUser`/`getSessionContext` en `identity`;
  **`createErrorStateTranslator`** en `errores`; **`runInRequestScope`**; **`lib/shared/pagination`**
  con 10/25; **`logIgnoredListQueryFields`**. Se consumen, no se reescriben.
- **`QuimiCloude_QC154`** existe y tiene aplicadas **todas** las migraciones de `dev`, la de QC-153
  incluida (`pnpm run db:migrate` con el entorno sobrescrito).

**Hecho cuando:** la lista está en la bitácora, verificada punto por punto contra el árbol, con la
salida del `db:migrate` sobre `QuimiCloude_QC154`.

---

## Grupo A — cimientos

- [x] **T1 [P] — Dominio base.** `domain/actor.ts` (copia de `proveedores`, error propio),
      `domain/customer-scope.ts`, `domain/errors.ts` (`ClientesError`, `UnauthorizedError`,
      `CustomerNotFoundError`, `ValidationError`), `domain/page.ts` (`Page<T>`),
      `domain/customer-id.ts` (`isCustomerId`).
      *Depende de:* T0, **T3** (sin el código en el catálogo, `CustomerNotFoundError` no compila).
      **Hecho cuando:** `pnpm run typecheck` limpio y `domain/` solo importa `zod`, `./` y los barrels
      de `identity` y `errores`.

- [x] **T2 [P] — Contrato de listados: copia y guardia.** `domain/list-query.ts` copiado
      **carácter a carácter** de `proveedores` salvo el nombre del módulo (`design.md > 6.1`),
      `ports/list-query-log.ts`, y `clientes` como **séptimo** módulo de `MODULOS` en
      `tests/guards/guard-contrato-listados.test.ts`.
      *Depende de:* T0. **Hecho cuando:** la guardia pasa con siete módulos, y **falla** si se cambia
      una sola línea de la copia de `clientes` (comprobado y revertido).

- [x] **T3 — Enmienda al catálogo de errores.** `customer_not_found` en `ERROR_CODES` con la línea
      de «Duodécima enmienda» en la cabecera, su clave y **el texto aprobado en F1.4** (P4) en
      `error-catalog.ts`; `tests/unit/errores/catalogo.test.ts` de 54 a 55.
      *Depende de:* **respuesta humana a P4**. **Hecho cuando:** `catalogo.test.ts` y
      `guard-catalogo-de-errores` pasan, y el diff de `lib/modules/errores/` es exactamente ese código
      (R34).

- [x] **T4 [P] — Alcance, adelantado: `tests/unit/clientes/scope.test.ts`.** Los cambios de
      `design.md > 11`, uno a uno: lista cerrada de archivos del módulo tras QC-154 (sin `.gitkeep`);
      `'use server'` prohibido fuera de `adapters/driving/`; literales de permiso permitidos solo en
      `permissions.ts` y `lib/modules/clientes/domain/**` (con el fabricado simétrico dentro de
      `domain/` que **no** dispara); `adapters/driving/` = exactamente `customer-actions.ts`. Y los
      casos propios: *(F1.4)* una sola migración nueva que solo toca `customers`, y en `schema.prisma`
      solo los tres campos normalizados de `Customer` (R37 enmendado), nada bajo `app/` que nombre
      clientes (R38), sin `pedidos` en el módulo ni `clientes`/`customer` en `lib/modules/pedidos/` (R40), sin
      aritmética de paginación propia (R36).
      *Depende de:* T0. **Hecho cuando:** los casos de R28/R29 de QC-153 siguen **intactos**, los
      cambiados llevan en el nombre el `R<n>` de QC-153 **y** el de QC-154, y cada regla nueva
      **falla** con un fabricado (comprobado y revertido). Se adelanta porque es llenando `domain/`
      cuando el alcance se escapa (lección de QC-43 T2).

## Grupo B — casos de uso (depende de A)

- [x] **T5 — Esquemas de entrada.** `domain/customer-input.ts` (`design.md > 6.3`): seis constantes de
      largo, `trim` antes de `min`/`max`, `blankToNull` en los tres opcionales, `z.object` (claves de
      más descartadas), sin formato.
      *Depende de:* T1. **Hecho cuando:** `tests/unit/clientes/customer-input.test.ts` pasa (R14–R18),
      con el caso «exactamente el máximo se acepta, uno más se rechaza» para **cada** campo.

- [x] **T6 — Tipos de salida, lista blanca y puerto.** `domain/customer-view.ts` (derivados con
      `Omit`/`Pick`), `domain/customer-queryable.ts` (`design.md > 6.2`),
      `ports/customer-repository.ts` (`design.md > 8`, **sin** resultado `'duplicate'`). **Borra
      `ports/.gitkeep`.**
      *Depende de:* T2, T5. **Hecho cuando:** typecheck limpio y los cinco métodos llevan
      `scope: CustomerScope` como último parámetro obligatorio.

- [x] **T7 — Los cinco casos de uso.** `create`, `update`, `delete`, `get`, `list`, con
      `requirePermission` en la **primera línea** y `isCustomerId` en `get`/`update`/`delete` antes
      del puerto (P5). *(F1.4)* El alta y la edición calculan las tres formas normalizadas con
      `normalizeCustomerText` (T18) y las pasan al puerto emparejadas con su dato (R42).
      *Depende de:* T6, T18. **Hecho cuando:** `tests/unit/clientes/customer-service.test.ts` (R9, R13,
      R19–R25) y `tests/unit/clientes/list-customers.test.ts` (R26, R27, R28) pasan con dobles.

- [x] **T8 — Autorización.** `tests/unit/clientes/authorization.test.ts` con dobles que **registran**
      toda llamada.
      *Depende de:* T7. **Hecho cuando:** cubre los cinco casos con actor ausente, sin permisos,
      conjunto vacío, solo el permiso contrario (R4), permiso ausente con entrada inválida (R5), y
      los tres conjuntos de `SEED_ROLE_PERMISSIONS` (R8); cada rechazo afirma
      `not.toHaveBeenCalled()` sobre el puerto y el log; y `'clientes'` está en `BUSINESS_MODULES` de
      `guard-autorizacion-por-permiso` con la guardia en verde (R6).

## Grupo C — adaptadores y cableado (depende de B)

- [x] **T9 — Adaptador driven.** `adapters/driven/persistence/company-scope.ts`,
      `list-query-sql.ts` (solo `textCondition` y `dateRangeCondition`) y `customer-prisma.ts`:
      ámbito en todo `where`, `deletedAt: null`, autoría, `updateMany` para editar y dar de baja,
      búsqueda por palabras (`AND` de `OR` sobre tres columnas) — *(F1.4)* contra las tres columnas
      **normalizadas**, con cada palabra normalizada y sin `mode`, y filtro de ciudad contra
      `cityNormalized` (`design.md > 17.3`); escritura de las formas normalizadas en `create` y
      `updateAlive` —, orden por defecto
      `lastNames, firstNames, id`, `TIE_BREAKER`, `toOffsetLimit`/`buildPage`, un solo `where` para
      `findMany` y `count`. **Borra `adapters/.gitkeep`.**
      *Depende de:* T6, T17. **Hecho cuando:** typecheck limpio, es el único archivo del módulo que importa
      `@prisma/client` junto con `company-scope.ts`, y ninguna consulta nombra otro modelo.

- [x] **T10 [P] — Guardia del ámbito de empresa.** `tests/guards/guard-ambito-empresa-clientes.test.ts`,
      calcada de la de proveedores con `CustomerScope`.
      *Depende de:* T9. **Hecho cuando:** pasa, y **falla** con un fabricado que añade una función de
      persistencia sin `scope` **y** con otro que lo declara y no lo usa (R12).

- [x] **T11 — Contrato y composición.** `index.ts` reexporta tipos, esquemas, constantes de largo,
      errores, `CUSTOMER_QUERYABLE` y las cinco factories con sus `*Deps` —solo de `./domain`,
      conservando `Customer`—; `lib/composition/index.ts` gana el bloque `clientes` **al final**
      (`design.md > 10`), sin reordenar nada.
      *Depende de:* T7, T9. **Hecho cuando:** `guard-arquitectura-modulos` pasa y el contrato no
      arrastra `'use server'`, Prisma ni `next/*` (R35).

- [x] **T12 — Server Actions.** `adapters/driving/customer-actions.ts` (`design.md > 9`), y en el
      mismo commit la fila `listCustomersAction` en `ACCIONES` de
      `tests/unit/identity/session-once-per-request-actions.test.ts`, más `'clientes'` en
      `BUSINESS_MODULES` de `guard-permisos-no-administrables` y en `MODULOS_DE_NEGOCIO` de
      `guard-identificador-de-request`.
      *Depende de:* T11. **Hecho cuando:** `tests/unit/clientes/customer-actions.test.ts` pasa (R7,
      R32, R33), las tres guardias ampliadas pasan, no hay route handler nuevo y la acción **no**
      vuelve a comprobar el permiso.

## Grupo D — contra la base y cierre

- [x] **T13 [P] — Integración: CRUD y aislamiento.**
      `tests/integration/clientes/customer-repository.int.test.ts` contra `QuimiCloude_QC154`, con su
      entrada en `commit` de `tests/integration/aislamiento.json` (motivo y `desde`, `design.md > 13`).
      *Depende de:* T9. **Hecho cuando:** pasa y cubre R9, R10, R11, R13, R15, R19, R21, R23, R24, R25;
      R10 se demuestra **releyendo la fila ajena** tras editar y dar de baja su id; el `afterAll`
      afirma contando que no quedó ninguna fila de las empresas efímeras; y
      `guard-aislamiento-integracion` pasa.

- [x] **T14 [P] — Integración: listado.**
      `tests/integration/clientes/list-query-customers.int.test.ts`, misma base y misma declaración en
      `aislamiento.json`, con más filas que una página y dos empresas.
      *Depende de:* T9. **Hecho cuando:** pasa y cubre R26 (100 → 25), R29 (sin repetir ni omitir al
      recorrer las páginas, con empates), R30 (dos palabras en columnas distintas; mayúsculas; término
      en blanco), R31 (total del conjunto filtrado) y R11 con búsqueda. *(F1.4)* Y además R41 y R47:
      «maria» encuentra «María», «PEREZ» encuentra «Pérez», «bogota» filtra «Bogotá», y un término
      hecho solo de símbolos (`%`, `_`, `---`) equivale a no buscar. Este caso **sustituye** al viejo
      «`%` no devuelve a todos».

- [x] **T15 — Cierre del alcance.** Releer `tests/unit/clientes/scope.test.ts` con el módulo ya lleno
      y comprobar que ninguna guardia se relajó fuera de lo que `design.md > 11` declara.
      *Depende de:* T12, T13, T14. **Hecho cuando:** cada regla de alcance falla con su fabricado, y la
      bitácora lista qué se relajó (solo § 11) y qué se amplió (§ 12).

- [ ] **T16 — Cierre.** `./init.sh` completo en verde, `progress/impl_QC-154-crud-de-clientes.md` con
      la lista de T0, la salida real de los tests y el mapa `R<n> → test` de abajo, y todas las tasks
      marcadas `[x]`.
      *Depende de:* todas. **Hecho cuando:** `CHECKPOINTS.md` se cumple entero.

**Paralelismo.** T1, T2 y T4 en paralelo (T1 espera a T3). T10 en paralelo con T11–T12. T13 y T14 en
paralelo entre sí y con T10–T12 en cuanto T9 esté. *(F1.4)* T17 y T18 pueden empezar junto al
Grupo A. T9 espera a T17.

## Grupo E — búsqueda sin acentos (F1.4, 2026-09-24; `design.md > 17`)

- [x] **T17 — La migración.** `db/schema.prisma`: los tres campos `*Normalized` de `Customer` y el
      comentario `///` actualizado. `db/migrations/<ts>_customers_search_normalized/{migration.sql,
      down.sql}`, **escrita a mano**, con `<ts>` posterior a la última migración de `dev` en el momento
      de crearla. Lleva los cinco pasos de `design.md > 17.2` y la lista de `translate` **copiada
      literal** del precedente. En el mismo commit: la migración en la lista cerrada de
      `tests/guards/guard-identificador-de-request.test.ts`, y las enmiendas a los tests de QC-153
      (`customers-schema.test.ts`: censo +3; `customers-constraints.int.test.ts`: `create`, `INSERT`
      crudo y censo de columnas).
      *Depende de:* T0. **Hecho cuando:** `pnpm run db:migrate` aplica sobre `QuimiCloude_QC154`,
      typecheck limpio, y los tests de QC-153 y `guard-identificador-de-request` pasan.

- [x] **T18 [P] — Normalización.** `domain/customer-text.ts` (`normalizeCustomerText`) y
      `tests/unit/clientes/customer-text.test.ts`.
      *Depende de:* T0. **Hecho cuando:** el test pasa, incluida la equivalencia con
      `normalizeSupplierName` sobre la batería.

- [x] **T19 [P] — Test estático de la migración.**
      `tests/unit/clientes/schema/customers-search-migration.test.ts` (R43–R46).
      *Depende de:* T17. **Hecho cuando:** pasa, y se pone rojo con cada una de estas mutaciones
      (comprobado y revertido): `SET NOT NULL` antes del `UPDATE`, un índice sin `WHERE deleted_at IS
      NULL`, un `UNIQUE`, un `ALTER` sobre otra tabla, un `DROP EXTENSION` en el DOWN, y un DOWN que
      deja una columna.

- [x] **T20 [P] — Integración de la migración.**
      `tests/integration/clientes/customers-search-migration.int.test.ts`, en `transaccion` de
      `aislamiento.json` (R43, R44, R45).
      *Depende de:* T17, T18. **Hecho cuando:** pasa contra `QuimiCloude_QC154`. El relleno coincide
      con `normalizeCustomerText` en filas vivas **y** dadas de baja con los caracteres del precedente,
      y el `NOT NULL` se rechaza con `23502`.

- [x] **T21 — Ciclo real de la migración.** `pnpm run db:migrate` → `pnpm run db:rollback` →
      `pnpm run db:migrate` sobre `QuimiCloude_QC154`, con la salida pegada en la bitácora.
      *Depende de:* T17. **Hecho cuando:** tras el rollback, `customers` es **idéntica** a la de QC-153
      (sin las tres columnas ni sus índices), `pg_trgm` sigue instalada, y `_prisma_migrations` es
      coherente (R46).

---

## Trazabilidad `R<n> → test`

Nombres provisionales: son el contrato de esta tabla; si el implementer los cambia, los cambia también
aquí. El reviewer rechaza si falta uno (`CHECKPOINTS.md > Trazabilidad`).

| R | Archivo de test | Nombre del test |
| --- | --- | --- |
| R1 | `tests/unit/clientes/authorization.test.ts` | `R1 — cada operacion recibe el actor por parametro y no lee ninguna sesion` |
| R2 | `tests/unit/clientes/authorization.test.ts` | `R2 — sin clientes.consultar la ficha y el listado se rechazan sin llamar al puerto` |
| R3 | `tests/unit/clientes/authorization.test.ts` | `R3 — sin clientes.modificar el alta, la edicion y la baja se rechazan sin llamar al puerto` |
| R4 | `tests/unit/clientes/authorization.test.ts` | `R4 — actor ausente, sin permisos o con el permiso contrario se rechaza igual` |
| R5 | `tests/unit/clientes/authorization.test.ts` | `R5 — sin permiso y con entrada invalida responde unauthorized, no invalid_input` |
| R6 | `tests/guards/guard-autorizacion-por-permiso.test.ts` | `ningun archivo de los … modulos de negocio usa el rol para autorizar` + `NO dispara con el actor.ts REAL de cada modulo, que autoriza por permiso` (ampliados con `clientes`) |
| R7 | `tests/unit/clientes/customer-actions.test.ts` + `tests/unit/identity/session-once-per-request-actions.test.ts` | `R7 — la accion toma usuario y empresa de la sesion y no vuelve a comprobar el permiso` + `lee la ficha de sesion EXACTAMENTE una vez por invocacion` (fila `listCustomersAction`) |
| R8 | `tests/unit/clientes/authorization.test.ts` | `R8 — con los permisos sembrados del Administrador se autorizan las cinco y con los del Operador o el Empacador se rechazan` |
| R9 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R9 — el alta usa la empresa del actor aunque la entrada traiga otra` + `R9 — el cliente creado queda en la empresa del actor` |
| R10 | `tests/integration/clientes/customer-repository.int.test.ts` | `R10 — la ficha, la edicion y la baja de un cliente de otra empresa responden customer_not_found y la fila ajena queda intacta` |
| R11 | `tests/integration/clientes/customer-repository.int.test.ts` + `tests/integration/clientes/list-query-customers.int.test.ts` | `R11 — el listado y su total solo cuentan la empresa del actor` + `R11 — una busqueda que casa con clientes de otra empresa no los devuelve` |
| R12 | `tests/guards/guard-ambito-empresa-clientes.test.ts` | `toda funcion de persistencia de clientes declara el ambito y lo hace llegar a company-scope` |
| R13 | `tests/integration/clientes/customer-repository.int.test.ts` | `R13 — crea el cliente con datos validos y devuelve su identificador` |
| R14 | `tests/unit/clientes/customer-input.test.ts` | `R14 — rechaza nombres, apellidos o ciudad ausentes, vacios o en blanco, y recorta los validos` |
| R15 | `tests/unit/clientes/customer-input.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R15 — acepta cualquier combinacion de opcionales ausentes y convierte el blanco en ausencia` + `R15 — el opcional en blanco se guarda como NULL` |
| R16 | `tests/unit/clientes/customer-input.test.ts` | `R16 — acepta cada dato en su largo maximo y rechaza uno mas` |
| R17 | `tests/unit/clientes/customer-input.test.ts` | `R17 — acepta como correo y telefono cualquier texto dentro del largo` |
| R18 | `tests/unit/clientes/customer-input.test.ts` + `tests/unit/clientes/customer-service.test.ts` | `R18 — las claves ajenas a los seis datos no salen del esquema` + `R18 — al puerto solo llegan los seis datos de negocio` |
| R19 | `tests/integration/clientes/customer-repository.int.test.ts` | `R19 — dos clientes vivos con los mismos seis datos se crean los dos` |
| R20 | `tests/unit/clientes/customer-service.test.ts` | `R20 — la edicion reemplaza los seis datos y el opcional ausente queda como ausencia` |
| R21 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R21 — el actor queda como autor de creacion y modificacion al crear, y solo de modificacion al editar y dar de baja` + `R21 — editar y dar de baja no pisan created_by ni created_at` |
| R22 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R22 — la ficha devuelve id, seis datos, instantes y autores, sin empresa ni marca de baja` + `R22 — findAliveCustomerById devuelve exactamente las 11 claves, sin companyId ni deletedAt` |
| R23 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R23 — inexistente, dado de baja o id sin forma responden customer_not_found; el id sin forma no llega al puerto` + `R23 — editar o dar de baja un cliente ya dado de baja no cambia ninguna fila` |
| R24 | `tests/integration/clientes/customer-repository.int.test.ts` | `R24 — la baja conserva la fila completa y marca deleted_at` |
| R25 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R25 — no existe ninguna operacion de restaurar ni de listar dados de baja` + `R25 — la ficha y el listado excluyen los dados de baja` |
| R26 | `tests/unit/clientes/list-customers.test.ts` + `tests/integration/clientes/list-query-customers.int.test.ts` | `R26 — rechaza pagina o tamano no enteros o menores que 1 sin leer del repositorio` + `R26 — usa 10 por defecto y devuelve 25 como maximo cuando se piden 100, con el total` |
| R27 | `tests/unit/clientes/list-customers.test.ts` + `tests/guards/guard-contrato-listados.test.ts` | `R27 — omite el campo no declarado sin fallar y registra solo su nombre` + la batería del contrato con `clientes` como séptimo módulo |
| R28 | `tests/unit/clientes/list-customers.test.ts` | `R28 — solo son ordenables y filtrables los campos declarados, nunca deletedAt ni companyId` |
| R29 | `tests/integration/clientes/list-query-customers.int.test.ts` | `R29 — sin orden pedido ordena por apellidos y nombres y recorre las paginas sin repetir ni omitir` |
| R30 | `tests/integration/clientes/list-query-customers.int.test.ts` | `R30 — cada palabra debe aparecer en nombres, apellidos o ciudad` *(F1.4: la parte de mayúsculas y comodines la cierra R41)* |
| R31 | `tests/integration/clientes/list-query-customers.int.test.ts` | `R31 — el total describe el conjunto filtrado y el filtro se aplica antes de paginar` |
| R32 | `tests/unit/clientes/customer-actions.test.ts` | `R32 — las mutaciones reciben FormData y las consultas argumentos tipados` (el mismo caso cubre, en su punto 3, que no hay route handler propio ni `fetch` a una ruta interna) |
| R33 | `tests/unit/clientes/customer-actions.test.ts` + `tests/guards/guard-catalogo-de-errores.test.ts` | `R33 — traduce cada error de dominio por su code estable, nunca por el texto` + guardia existente |
| R34 | `tests/unit/errores/catalogo.test.ts` | `las 55 entradas estan, y cada codigo tiene exactamente una clave` + `R34 — customer_not_found tiene clave y texto no vacio` |
| R35 | `tests/guards/guard-arquitectura-modulos.test.ts` + `tests/unit/clientes/scope.test.ts` | guardia existente + `R20 (QC-153), R35 (QC-154) — ningun archivo alcanzable desde el contrato declara 'use server'` y `… — lista cerrada de archivos del modulo` |
| R36 | `tests/unit/clientes/scope.test.ts` + `tests/unit/pagination.test.ts` | `R36 — el modulo clientes no reimplementa el calculo de paginacion` + tests existentes de 10/25 |
| R37 | `tests/unit/clientes/scope.test.ts` | `R37 — la unica migracion nueva es la de busqueda de customers y schema.prisma solo gana sus tres campos` (F1.4) |
| R38 | `tests/unit/clientes/scope.test.ts` | `R38 — no hay nada bajo app/ que nombre clientes` + los dos casos `R28 — sin ningun test E2E de clientes` de QC-153 |
| R39 | `tests/guards/guard-dependencias-aprobadas.test.ts` | `toda dependencia de package.json tiene su fila en el registro` (existente) |
| R40 | `tests/unit/clientes/scope.test.ts` | `R40 — clientes no nombra pedidos ni pedidos nombra clientes` |
| R41 | `tests/integration/clientes/list-query-customers.int.test.ts` + `tests/unit/clientes/customer-text.test.ts` | `R41 — la busqueda ignora acentos y mayusculas y un termino solo de simbolos equivale a no buscar` + `R41 — normaliza sin acentos, en minusculas y sin simbolos, igual que normalizeSupplierName` |
| R42 | `tests/unit/clientes/customer-service.test.ts` + `tests/unit/clientes/schema/customers-schema.test.ts` | `R42 — el alta y la edicion pasan cada forma normalizada emparejada con su dato` + `R4 (QC-153), R42 (QC-154) — censo exacto de columnas de Customer` |
| R43 | `tests/integration/clientes/customers-search-migration.int.test.ts` + `tests/unit/clientes/schema/customers-search-migration.test.ts` | `R43 — el relleno de vivos y dados de baja coincide con normalizeCustomerText` + `R43 — rellena antes de exigir NOT NULL con la lista de translate del precedente` |
| R44 | `tests/integration/clientes/customers-search-migration.int.test.ts` + `tests/unit/clientes/schema/customers-search-migration.test.ts` | `R44 — la base rechaza con 23502 una forma normalizada nula` + `R44 — ninguna forma normalizada lleva UNIQUE` |
| R45 | `tests/unit/clientes/schema/customers-search-migration.test.ts` + `tests/integration/clientes/customers-search-migration.int.test.ts` | `R45 — tres GIN de trigramas parciales sobre vivos y ninguna otra tabla tocada` + `R45 — los tres indices existen con su predicado` |
| R46 | `tests/unit/clientes/schema/customers-search-migration.test.ts` + task **T21** | `R46 — el down.sql quita indices y columnas y no retira pg_trgm` + ciclo real `db:migrate` → `db:rollback` → `db:migrate` |
| R47 | `tests/integration/clientes/list-query-customers.int.test.ts` + `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R47 — filtrar por bogota devuelve Bogota con tilde` + `R47 — ni la ficha ni el listado devuelven formas normalizadas` + `R47 — cada item de listAliveCustomers devuelve exactamente las 11 claves, sin ninguna forma normalizada` |

**Tests que no hay que escribir:** R6 (en parte), R33 (en parte), R35 (en parte), R36 (en parte) y R39
los cierran guardias y tests **que ya existen**; algunos se **amplían** (`design.md > 12`). Ninguno se
relaja salvo los casos de `tests/unit/clientes/scope.test.ts` que `design.md > 11` enumera uno a uno.
