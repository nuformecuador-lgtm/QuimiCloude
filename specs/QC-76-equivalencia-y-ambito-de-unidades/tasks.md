# QC-76 — equivalencia-y-ambito-de-unidades · tasks.md

> Requisitos en `requirements.md` (R1–R38), diseño en `design.md`. `[P]` = paralelizable con la
> tarea indicada. Cada tarea dice **qué archivos toca** y **cuándo está hecha**. Nada se marca sin
> que su criterio se cumpla; el cierre de tanda es `./init.sh --rapido` y el cierre de feature
> `./init.sh` completo (regla 5 de `CLAUDE.md`).
>
> **Sin preguntas abiertas.** La escala del resultado cuando la división no termina la **cerró el
> humano el 2026-09-07** (última fila de la tabla de decisiones): **12 decimales, truncando**, en una
> **constante con nombre** documentada en el contrato. T7 y T8 la implementan y la prueban como
> requisito firme (R23), no como posición por defecto.

## Fase A — Esquema y base de datos

- [ ] **T1. `db/schema.prisma`: `model Unit` gana `companyId`, `baseUnitId` y `factor`.**
  - Toca: `db/schema.prisma`.
  - Las tres columnas **opcionales**, `factor` como `Decimal? @db.Decimal(14,4)`, `companyId` y
    `baseUnitId` como **escalares sin `@relation`** (`design.md > 2.1`). Los dos `@@index`
    (`units_company_id_idx`, `units_unit_id_idx`). **Se retira `@@unique([nameNormalized])`** y en su
    lugar va el comentario `///` que avisa de que los cuatro únicos son parciales, viven en la
    migración y por qué volver a poner un `@unique` aquí rompe R14 en silencio.
  - **Hecho cuando**: `pnpm prisma validate` pasa, `pnpm typecheck` en verde y el modelo conserva su
    `/// @module unidades`. Cubre: R1, R3, R11, R12, R31, R32.

- [ ] **T2. Migración nueva: `migration.sql` (UP).** (depende de T1)
  - Toca: `db/migrations/<timestamp>_units_equivalence_and_scope/migration.sql` (nueva carpeta).
  - `pnpm run db:migrate:create` para generar el esqueleto, y **completar a mano** en el orden de
    `design.md > 3.1`: columnas → los tres `CHECK` y las dos FK `ON DELETE RESTRICT` → los dos
    índices de FK → `DROP` del único global y los **cuatro únicos parciales** → función y disparador
    de derivación → paréntesis `NO FORCE` / `UPDATE` de las cuatro filas con comprobación de filas
    afectadas / `ENABLE` + `FORCE`.
  - **No se toca** `20260903121404_units_catalog` (R27). Ningún `INSERT`, ningún `DELETE` (R29).
  - **Hecho cuando**: `pnpm run db:migrate` aplica sin error sobre la base de desarrollo y
    `SELECT name, unit_id, factor, company_id FROM units` devuelve las cuatro filas de R28.
    Cubre: R2, R4, R5, R6, R7, R8, R9, R13, R14, R15, R27, R28, R29, R30, R31.

- [ ] **T3. `down.sql` con su guardia de datos.** (depende de T2)
  - Toca: la misma carpeta de migración.
  - Aborta primero si hay alguna unidad con empresa o alguna derivada que no sean las dos que dejó el
    UP (R34); después revierte exactamente el UP y **recrea `units_name_normalized_key` global**,
    dejando la RLS activada y forzada.
  - **Hecho cuando**: `pnpm run db:rollback` deja el esquema idéntico al previo —comprobado con un
    diff de `\d units`— y volver a aplicar T2 funciona; y con una unidad de empresa creada a mano el
    rollback **falla con su mensaje** y no borra nada. Cubre: R33, R34.

- [ ] **T4. Tests de esquema y de migración.** (depende de T3) [P con T5]
  - Toca: `tests/unit/unidades/schema/unidades-schema.test.ts`,
    `tests/unit/unidades/schema/unidades-migration.test.ts`.
  - Esquema: las tres columnas con su tipo y su opcionalidad, `units` **sin** `deleted_at`, **sin**
    columna de sistema y **sin ningún `@@unique`/`@unique`**.
  - Migración: la carpeta de QC-32 sigue byte a byte igual; el SQL nuevo declara los cuatro índices
    parciales, los tres `CHECK`, las dos FK con `RESTRICT`, el disparador, el `UPDATE` de las cuatro
    filas, **cero `INSERT`/`DELETE`** sobre `units`, y termina en `ENABLE` + `FORCE`; el `down.sql`
    existe y trae su guardia.
  - **Hecho cuando**: los dos archivos están en verde y fallan si se borra cualquiera de esos objetos
    del SQL. Cubre: R3, R11, R12, R27, R29, R30, R31, R32, R33.

- [ ] **T5. Tests de integración de las restricciones.** (depende de T3) [P con T4]
  - Toca: `tests/integration/unidades/unidades-constraints.int.test.ts`.
  - Un caso por regla, con `INSERT`/`UPDATE`/`DELETE` directos: pareja incompleta; factor `0`, `-1` y
    `0.5000`; cuatro decimales que vuelven intactos; auto-referencia; dos niveles en las dos
    direcciones; padre de otra empresa; empresa inexistente; borrar una unidad con hija; nombre
    repetido dentro del ámbito y **no** repetido entre ámbitos; símbolo igual, símbolo nulo repetido;
    cambiar factor y base con un producto y una línea de receta apuntando; marcar
    `companies.deleted_at` y ver las unidades intactas.
  - **Hecho cuando**: cada caso comprueba el código de error de Postgres esperado (`23514`, `23505`,
    `23503`) y no solo «lanza algo». Cubre: R1, R2, R4, R5, R6, R7, R8, R9, R10, R13, R14, R15, R16.

## Fase B — El ámbito en el listado

- [ ] **T6. `Actor` gana `companyId` y el listado lo propaga hasta el `where`.** (depende de T1)
  - Toca: `lib/modules/unidades/domain/actor.ts`, `domain/unit-scope.ts` (nuevo),
    `domain/list-units.ts`, `ports/unit-repository.ts`,
    `adapters/driven/persistence/unit-prisma.ts`, `adapters/driving/unit-actions.ts`,
    `lib/modules/unidades/index.ts`.
  - `companyScopeWhere(scope)` es la **única** definición del `OR` y `buildUnitWhere(query, scope)`
    **exige** el ámbito en su firma (`design.md > 4.2`). La Server Action resuelve
    `getSessionUser()` **y** `getSessionContext()` y devuelve actor `null` si falta cualquiera de las
    dos. `requirePermission` sigue siendo la primera línea del caso de uso, antes de zod.
  - **No se toca** `unit-catalog-prisma.ts` (R36).
  - **Hecho cuando**: `pnpm typecheck` en verde y quitar el `scope` de cualquier llamada **no
    compila**. Cubre: R17, R18, R19, R20, R21, R36.

- [ ] **T7. La conversión, en el dominio.** (depende de T1) [P con T6]
  - Toca: `lib/modules/unidades/domain/convert-quantity.ts` (nuevo), `domain/errors.ts`
    (`IncompatibleUnitsError`), `lib/modules/unidades/index.ts`.
  - Función **pura**, decimales como texto, aritmética con `BigInt` sobre enteros escalados, base
    efectiva `baseUnitId ?? id` y factor efectivo `factor ?? '1'` (`design.md > 5.2`). La escala de
    la división no exacta —**12 decimales, truncando**, R23— va en **una sola constante con nombre**
    (`CONVERSION_SCALE`), con su JSDoc explicando el porqué de los 12 (4 decimales es la escala
    máxima que guarda el ERP, QC-33). **Ninguna dependencia nueva** (R38).
  - **Hecho cuando**: el barrel la exporta, `module-contract.test.ts` sigue verde (nada de servidor
    en el cierre de imports), `pnpm typecheck` pasa y la escala aparece **una sola vez** en el
    módulo (`rg 12 lib/modules/unidades/domain/convert-quantity.ts` no revela literales sueltos).
    Cubre: R22, R23, R25, R38.

## Fase C — Verificación

- [ ] **T8. Tests unitarios de la conversión.** (depende de T7) [P con T9, T10]
  - Toca: `tests/unit/unidades/domain/convert-quantity.test.ts` (nuevo).
  - Casos: unidad consigo misma; derivada → su base (1 litro = `1000` mililitros); base → derivada;
    dos derivadas de la misma base; factor menor que 1 (media garrafa); resultado muy pequeño
    (1 gramo en toneladas → `0.000001`, **nunca** `0`, R23); bases distintas →
    `IncompatibleUnitsError`; entradas inválidas → `ValidationError`; **división que no termina**
    (factor de destino `3.0000`) → exactamente **12 decimales truncados**, comprobando que la última
    cifra es la truncada y **no** una redondeada hacia arriba (R23).
  - **Hecho cuando**: todos verdes y los nombres describen el comportamiento
    (`docs/conventions.md > Tests`). Cubre: R23, R24, R25.

- [ ] **T9. Tests del filtro de empresa.** (depende de T6) [P con T8, T10]
  - Toca: `tests/unit/unidades/unit-prisma-where.test.ts` (nuevo),
    `tests/integration/unidades/unit-repository.int.test.ts`,
    `tests/unit/unidades/unit-actions.test.ts`, `tests/unit/unidades/list-units.test.ts`.
  - Unitario: el `where` de los **dos** modos lleva el `OR` empresa-o-sistema y el `count` usa el
    mismo objeto que el `findMany`. Integración con dos empresas y unidades de sistema: cada empresa
    ve las suyas más las de sistema, ninguna ve las de la otra, y el `total` de la página cuenta solo
    lo visible. Action: sin contexto de sesión no se llama al repositorio.
  - **Hecho cuando**: todos verdes y el test de integración falla si se borra el `OR`.
    Cubre: R17, R18, R19.

- [ ] **T10. Los tests que ya existen siguen verdes sin relajar expectativas.** (depende de T6)
    [P con T8, T9]
  - Toca: `tests/unit/unidades/list-units.test.ts`, `list-units-query.test.ts`,
    `unit-actions.test.ts`, `module-contract.test.ts` y los fixtures de actor que hayan cambiado de
    forma.
  - Solo se ajusta la **construcción del actor** (ahora lleva `companyId`); ninguna aserción de
    orden, búsqueda, paginación o permiso se debilita.
  - **Hecho cuando**: el diff de esos archivos no borra ni afloja ninguna aserción previa.
    Cubre: R20, R21.

- [ ] **T11. Cierre de límites de alcance.** (depende de T6, T7)
  - Toca: nada de producción; comprobación sobre el árbol.
  - `rg convertQuantity lib/ app/ components/` no devuelve nada fuera de `lib/modules/unidades`
    (R26); no hay adaptador driving nuevo, ni ruta, ni pantalla (R35); `findUnitRefs` sigue sin
    ámbito y sus llamantes intactos (R36); `presentations` sin cambios (R37); `package.json` y
    `pnpm-lock.yaml` sin tocar (R38).
  - **Hecho cuando**: las cinco comprobaciones están anotadas en `progress/impl_QC-76-*.md` con su
    salida. Cubre: R26, R35, R36, R37, R38.

- [ ] **T12. Gate completo y mapa de trazabilidad.** (depende de T4, T5, T8, T9, T10, T11)
  - Toca: `progress/impl_QC-76-equivalencia-y-ambito-de-unidades.md`.
  - `./init.sh` completo en verde —incluidas todas las guardias— y el mapa `R1..R38 → test concreto`
    escrito, siguiendo la tabla de `design.md > 9`. Un requisito sin test es un fallo de la feature
    (regla 4 de `CLAUDE.md`).
  - **Hecho cuando**: gate verde y las 38 filas del mapa apuntan a un test que existe y se ejecuta.
