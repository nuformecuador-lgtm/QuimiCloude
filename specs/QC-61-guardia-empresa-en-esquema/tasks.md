# QC-61 — guardia-empresa-en-esquema · tasks.md

> Checklist del implementer. Cada task dice **qué archivos toca**, de **qué depende** y cuál es su
> criterio de **hecho**. `[P]` = paralelizable con las otras `[P]` de su bloque.
> El mapa `R<n> -> test` está en `§ Trazabilidad`, al final, y se copia a
> `progress/impl_QC-61-guardia-empresa-en-esquema.md` (`CHECKPOINTS.md > Trazabilidad`).
>
> **Comentarios** (`docs/conventions.md > Comentarios`, `design.md > 10`): en el archivo de la
> guardia no se cita `QC-<n>`, `R<n>` ni `design.md` en comentarios; `R<n>` va **en el nombre** de
> cada `it(...)`. Los motivos de `EXENTAS` tampoco citan fichas.
>
> **Sin migración, sin E2E, sin dependencias.** No se toca `db/`, `lib/`, `app/`, `components/`,
> `package.json` ni `scripts/`.

## Bloque 1 — La guardia

- [x] **T1 — Lector del esquema.**
  Archivos: `tests/guards/guard-empresa-en-esquema.test.ts` (nuevo).
  Contenido: `findRepoRoot`, `leerModelos(schemaSource)` según `design.md > 3` (normaliza `\r\n?`,
  quita `//`/`///` por línea, bloques `model`, tabla por `@@map` o nombre, columnas por `@map` o
  nombre de campo, `@@…` fuera). Casos con fixtures en memoria: solo en comentario, solo en
  relación, CRLF = LF, `enum` ignorado, `@@map` ausente → tabla = nombre del modelo.
  Depende de: —.
  Hecho cuando: los casos de R5 y R11 pasan en verde **y** cada uno falla si se quita el paso que
  lo protege (normalizar CRLF / quitar comentarios) — comprobado a mano y anotado en `progress/`.
  Cubre: R1, R5, R11.

- [x] **T2 — `EXENTAS` y los dos juicios.**
  Archivos: el mismo de T1.
  Contenido: `EXENTAS` con las ocho tablas de [D1] y un motivo por entrada (catálogo compartido;
  la propia empresa; cuelga de un usuario que ya tiene empresa; hereda la empresa de su receta y
  la guardia no lo comprueba); `hallazgosSinEmpresa` y `hallazgosExentasSinMotivo`
  (`design.md > 3`). Fixtures: modelo no exento sin columna, columna obligatoria y opcional, exenta
  sin columna, `users` sin columna, `Role` con `@@map("roles_v2")`, motivo vacío.
  Depende de: T1.
  Hecho cuando: cada fixture da el hallazgo exacto de `design.md > 7` (mensaje comparado con
  `toEqual`, no con `toContain`) y su simétrico da `[]`.
  Cubre: R2, R3, R4, R6, R8, R9.

- [x] **T3 — El esquema real y la lista exacta.**
  Archivos: el mismo de T1.
  Contenido: `it` sobre `db/schema.prisma` real: al menos un modelo (si no, rojo), cero hallazgos,
  `users` juzgada por su `company_id`; `it` que compara el conjunto de `EXENTAS` con las ocho
  tablas escritas literalmente en el test, sin `users`, todas con motivo; `it` que comprueba que el
  archivo vive en `tests/guards/` y su nombre casa con `guard`.
  Depende de: T2.
  Hecho cuando: `pnpm run test:guardias` lista el archivo y los tres `it` en verde.
  Cubre: R7, R10, R12, R13.

## Bloque 2 — Documentación

- [x] **T4 [P] — Corregir `docs/architecture.md > Dominio`.**
  Archivos: `docs/architecture.md` (l. 30-32).
  Contenido: el bullet «Toda tabla de negocio nueva nace con su columna de empresa.» nombra las
  ocho tablas de [D1] con su motivo agrupado, dice que basta con que la columna exista [D3], nombra
  la guardia y conserva «es BLOQUEANTE». Ninguna tabla no exenta entre comillas invertidas en ese
  bullet (`design.md > 8`).
  Depende de: — (paralela a T1-T3).
  Hecho cuando: el bullet ya no nombra `users` como exenta y sus tablas entre comillas invertidas
  son exactamente las ocho.
  Cubre: R14 (texto).

- [x] **T5 — Test «doc = guardia».**
  Archivos: el mismo de T1.
  Contenido: localiza el bullet por su frase inicial, extrae identificadores `^[a-z][a-z_]*$` entre
  comillas invertidas, descuenta `company_id`, compara con `EXENTAS`. Rojo si no encuentra el
  bullet. Fixture en memoria con una tabla de más y otra de menos.
  Depende de: T2, T4. **Aprobada en F1.4-C el 2026-09-18** (`design.md > 9`): si el humano la rechaza, esta
  task se elimina y R14 queda a cargo de la revisión.
  Hecho cuando: verde sobre el doc real y rojo con los dos fixtures.
  Cubre: R14.

- [x] **T7 [P] — Corregir `CHECKPOINTS.md` y `.claude/agents/reviewer.md`.**
  Archivos: `CHECKPOINTS.md` (l. 28-30), `.claude/agents/reviewer.md` (l. 33-35).
  Contenido: sustituir «las tres del sistema (`users`, `roles`, `document_types`)» por una remisión
  a la lista de `docs/architecture.md > Dominio` y a la guardia.
  Depende de: T4. **Aprobada en F1.4-A el 2026-09-18.**
  Hecho cuando: ninguno de los dos archivos nombra `users` como exenta.
  Cubre: — (coherencia; se verifica en la revisión).

## Bloque 3 — Condicional

- [x] **T8 — Rojo por exenta que sobra.**
  Archivos: el mismo de T1.
  Contenido: `hallazgosExentasQueSobran(modelos, exentas)`: entrada cuya tabla no existe en el
  esquema o que ya declara `company_id`. Fixtures de los dos casos y su simétrico; `it` sobre el
  esquema real con `[]`.
  Depende de: T3. **Aprobada en F1.4-B el 2026-09-18.**
  Hecho cuando: los dos fixtures dan su hallazgo exacto y el esquema real da `[]`.
  Cubre: R16.

## Bloque 4 — Cierre

- [x] **T6 — Probar que muerde sobre el archivo real.**
  Archivos: ninguno queda modificado.
  Contenido: `cp db/schema.prisma` a una copia; (a) quitar la línea `companyId` de `model Product`;
  (b) añadir un `model Foo` sin `company_id`; en cada caso `pnpm run test:guardias` > archivo,
  leer `$?` (sin pipe a `head`/`tail`), confirmar `1` y el mensaje; restaurar desde la copia.
  Igual con `docs/architecture.md` (añadir `users` al bullet) si T5 entró.
  Depende de: T3 (y T5 si entró).
  Hecho cuando: los tres desenlaces (`0`, `1`, `1`) quedan anotados en
  `progress/impl_QC-61-guardia-empresa-en-esquema.md` y `git status` no muestra cambios en `db/` ni
  en `docs/`.
  Cubre: R2, R10 (en el gate real).

- [x] **T9 — Gate y trazabilidad.**
  Archivos: `progress/impl_QC-61-guardia-empresa-en-esquema.md`.
  Contenido: `./init.sh --rapido` y después `./init.sh` completo; `git diff origin/dev -- package.json`
  vacío; mapa `R<n> -> test` copiado de `§ Trazabilidad`. Un rojo del gate se compara contra la
  línea base de `dev` antes de atribuírselo a esta rama.
  Depende de: todas las anteriores que hayan entrado.
  Hecho cuando: los dos gates en verde (o sus rojos acreditados como de línea base) y el mapa
  completo, sin R huérfanas.
  Cubre: R13, R15.

## Trazabilidad

| R | Test (en `tests/guards/guard-empresa-en-esquema.test.ts` salvo indicación) | Task |
|---|---|---|
| R1 | `R1 lee db/schema.prisma sin cliente generado ni red` (el caso real de T3 + `leerModelos` puro) | T1, T3 |
| R2 | `R2 da rojo a un modelo sin company_id que no esta exento` | T2 |
| R3 | `R3 acepta la columna obligatoria y la opcional` | T2 |
| R4 | `R4 no juzga a una exenta sin columna` | T2 |
| R5 | `R5 no cuenta company_id en comentario ni en fields de una relacion` | T1 |
| R6 | `R6 un modelo llamado como una exenta con otra tabla da rojo` | T2 |
| R7 | `R7 EXENTAS son exactamente las ocho y users no esta` | T3 |
| R8 | `R8 cada entrada de EXENTAS lleva su motivo` | T3 |
| R9 | `R9 una exenta sin motivo da rojo` | T2 |
| R10 | `R10 el esquema real queda en verde y users se juzga por su columna` | T3, T6 |
| R11 | `R11 CRLF y LF dan los mismos hallazgos` | T1 |
| R12 | `R12 un esquema sin modelos da rojo` | T3 |
| R13 | `R13 la guardia vive en tests/guards y la selecciona el patron guard` | T3, T9 |
| R14 | `R14 la lista de docs/architecture.md coincide con EXENTAS`  | T4, T5 |
| R15 | `tests/guards/guard-dependencias-aprobadas.test.ts` + diff de `package.json` vacío | T9 |
| R16 | `R16 una exenta que sobra da rojo`  | T8 |
