# QC-14 — modelo-producto · revision

> Reviewer, 2026-09-01. Worktree `.worktrees/QC-14-modelo-producto/`, rama
> `feature/QC-14-modelo-producto`. Alcance revisado: `git diff 5708bc3..HEAD`
> (commits `c2a4f43`, `ebd7555`, `c2a9c7b`, `cf2bf6a`, `c497bc9`).
>
> **Veredicto: APROBADO.** Ningun hallazgo bloqueante. Ocho hallazgos menores, todos de
> documentacion, de robustez futura o preguntas abiertas del humano; ninguno incumple
> `requirements.md`, `docs/` ni `CHECKPOINTS.md`.

## Que se ejecuto en esta revision (no se confio en la bitacora)

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | verde |
| `pnpm run lint` | verde |
| `pnpm exec vitest run inventario` | **52 passed (3 files)** |
| `pnpm exec vitest run tests/integration/inventario --reporter=verbose` | **19 passed**, caso a caso, contra Postgres real |
| `pnpm run test:guardias` | **65 passed (5 files)** |
| `pnpm run db:rollback` + `pnpm run db:migrate` (ciclo completo, reproducido por el reviewer) | ver R22 abajo |
| Recuento de filas residuales tras la corrida de integracion | `{"products":"0","presentations":"0"}` |

`./init.sh` completo NO se corrio: lo corre el leader en T8, y la regla del gate para
subagentes lo dice explicitamente.

### R22 reproducido de forma independiente

La evidencia del ciclo la produjo el **leader**, no el implementer, y la bitacora lo atribuye
de forma explicita. No se dio por buena: se repitio el ciclo capturando un snapshot completo
del esquema (`information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_class` con
`relrowsecurity` / `relforcerowsecurity`, `pg_extension` y `_prisma_migrations`) en tres
momentos.

- **Tras el rollback:** cero apariciones de `products` o `presentations` en el snapshot
  entero — ni tabla, ni columna, ni restriccion, ni indice, ni fila de `_prisma_migrations`.
  Quedan solo `document_types`, `roles`, `users` y `_prisma_migrations`. `pgcrypto` intacta.
- **Tras reaplicar:** el snapshot es identico, linea a linea, al previo al rollback.
- Los 52 tests de la feature vuelven a pasar despues del ciclo.

Es exactamente lo que R22 pide («sin dejar tablas, restricciones, indices ni columnas
residuales»), y queda demostrado por dos vias independientes. La atribucion al leader es
correcta y la evidencia sostiene lo que promete.

## Checklist

### Especificacion
- [x] `requirements.md` con R1–R24 en EARS, mas el bloque de Alcance y las 17 decisiones
      cerradas intactos: spec_author no los reabrio ni los reescribio.
- [x] `design.md` con cinco alternativas descartadas y su porque (secciones 8.1 a 8.5).
- [x] `tasks.md`: todas marcadas `[x]` salvo **T8**, pendiente a proposito porque es del
      leader (merge con `dev` + gate completo).

### Trazabilidad — los 24, uno por uno, abriendo el test

Verificado leyendo cada caso, no la tabla de `tasks.md`. **Cero requisitos sin trazabilidad
verificada.**

| R | Test que lo cierra | Verificado |
| --- | --- | --- |
| R1 | S «Presentation declara id uuid propio y name obligatorio» + I «no cambia al renombrarla» | El caso renombra y relee por el mismo `id`: si el identificador derivara del nombre, el `findUnique` no traeria nada. Afirma lo que promete. |
| R2 | I «rechaza una presentacion sin nombre» | `INSERT` crudo omitiendo `name`, SQLSTATE 23502. Es la unica columna obligatoria omitida, asi que el codigo solo puede venir de ella. |
| R3 | S «exactamente dos modelos nuevos» + S «los ocho datos en una sola tabla» + I «crea un producto con todos sus datos» | La lista de modelos se compara con un `toEqual` cerrado y se prohiben `InventoryItem`, `Inventory`, `StockItem` e `Item`. La lista de columnas escalares tambien es `toEqual` cerrado. |
| R4 | S «name y presentationId obligatorios y sin default» + I «rechaza el alta si falta el nombre o la presentacion» | Dos rechazos 23502, cada uno con un solo obligatorio omitido, y despues se busca lo que cada intento habria escrito con un dato centinela. |
| R5 | S «los cinco opcionales, sin default» + I «los devuelve como ausencia de valor» | `toBeNull()` en los cinco, mas `not.toBe(0)` y `not.toBe('')`. Distingue las tres cosas que R5 exige distinguir. |
| R6 | S + M «min_purchase es INTEGER NOT NULL DEFAULT 0» + I «queda con compra minima 0» | Cubre la lectura de la decision 8 tal como la razona el diseño. |
| R7 | S «los cuatro son Int» + M «los cuatro se declaran INTEGER» + I «integer en information_schema» | El de integracion mira el tipo REAL en la base, no el declarado, y ademas comprueba que un `7.4` no conserva parte decimal. El requisito habla de «sin parte decimal», no de rechazo: el test es correcto y la bitacora lo anota. |
| R8 | S «Decimal(14,4) y ningun Float» + M con sensibilidad + I «cuatro decimales exactos, columna numeric(14,4)» | Compara con `Prisma.Decimal.equals` y `toString`, nunca convirtiendo a `number`, y distingue `...1234` de `...1235`. |
| R9 | M «los cuatro CHECK, y el test cae si se relaja el >= 0» + I «SQLSTATE 23514» | Cuatro altas, cada una con un unico valor negativo, cada una en su SAVEPOINT. Ademas comprueba que el cero y el valor ausente si pasan. |
| R10 | S «unit String opcional, sin enum» + I «acepta cualquier texto como unidad» | Seis unidades muy distintas vuelven tal cual, sin normalizar, mas el caso sin unidad. |
| R11 | S «ninguna columna derivada» + I «no cambia ninguna otra columna» | La comparacion es de la fila entera, con `qtyAlert` y `updatedAt` neutralizados. Fuerte de verdad. |
| R12 | S «relacion obligatoria» + M «FK ON DELETE RESTRICT» + I «sin presentacion o con una inexistente» | 23502 y 23503 por separado. |
| R13 | S «presentationId sin unicidad» + I «cinco productos con la misma presentacion» | |
| R14 | S «onDelete Restrict» + M con sensibilidad sobre las cuatro acciones referenciales + I (dos casos) | El caso fino esta y es el que importa: presentacion cuyo unico producto esta borrado logicamente, 23503, y despues las dos filas quedan identicas comparando la fila entera. |
| R15 | I «permite borrar una presentacion sin productos asignados» | Afirma por `id`, no sobre el total de la tabla. |
| R16 | S «sin @unique ni @@unique» + M «ningun indice unico» + I «mismo nombre y distintas mayusculas» | Tres altas, tres ids distintos, nombres conservados sin normalizar. |
| R17 | S «deletedAt opcional» + I «el borrado logico conserva la fila» | La fila entera se compara con la previa neutralizando solo `deletedAt` y `updatedAt`. |
| R18 | S «createdAt y updatedAt en los dos modelos» + I «se rellenan solos y updated_at cambia» | Con espera real y comparacion de `getTime()`, en producto y en presentacion. |
| R19 | S «snake_case en ingles» + M «todos los identificadores en ingles» + M de sensibilidad | El predicado usa vocabulario cerrado, cae con identificadores en español y con acentos, y sigue aceptando los reales: no es un `expect(false)` disfrazado. |
| R20 | S «los dos modelos declaran /// @module inventario» + G2 | Lee el texto CRUDO, no el des-comentado, y comprueba ademas que `identity` conserva sus tres modelos. |
| R21 | M «ENABLE + FORCE en las dos tablas» + sensibilidad + G1 | `pg_class` lo confirma en el ciclo que reproduje: `relrowsecurity` y `relforcerowsecurity` en `true` en las dos. Es correcto que NO haya test de RLS con Prisma: saldria verde pase lo que pase. |
| R22 | M «down.sql revierte exactamente lo que crea migration.sql» + ciclo real | Reproducido por el reviewer con snapshot completo, ver arriba. |
| R23 | S «ni adaptadores driving, ni rutas, ni contrato de dominio» | Se comprueba sobre el arbol de archivos y sobre `lib/modules/inventario/index.ts`, que sigue siendo `export {};`. Confirmado ademas por el diff: `lib/` y `app/` no se tocaron. |
| R24 | G3 | `package.json` y `pnpm-lock.yaml` no aparecen en el diff. |

- [x] `progress/impl_QC-14-modelo-producto.md` contiene el mapa `R<n> -> test` con salida real.

### Las cinco decisiones contraintuitivas: respetadas, ninguna «mejorada»
- [x] `presentations` **sin** `deleted_at`, y no por descuido: el esquema lo explica, el test
      lo afirma en positivo y el caso de integracion del producto borrado logicamente
      demuestra por que la columna neutralizaria R14.
- [x] `min_purchase` es `INTEGER NOT NULL DEFAULT 0`, razonado en `design.md > 8.1` y anotado
      como pregunta abierta 1.
- [x] Ni `products.name` ni `presentations.name` llevan unicidad. Verificado en el esquema, en
      el SQL y contra la base.
- [x] `delivery_time` **sin** `CHECK`, con un test que afirma en positivo que no lo lleva para
      que nadie lo «arregle». Es la decision 7 al pie de la letra.
- [x] Sin `CHECK` de nombre no vacio; anotado en `design.md > 9` y diferido a QC-20.

### Alcance: nada de QC-20 se colo
- [x] Ni CRUD, ni service, ni endpoint, ni Server Action, ni pantalla, ni ruta.
- [x] Ni imagenes, ni evaluacion de la cantidad de alerta, ni conversion de unidades.
- [x] El diff se limita a `db/`, `specs/`, `progress/` y `tests/`. `lib/`, `app/`,
      `components/` y `package.json` intactos.

### Migracion
- [x] `migration.sql` con cabecera que declara lo escrito a mano y avisa del drift.
- [x] `down.sql` con exactamente dos `DROP TABLE IF EXISTS`, en orden inverso, sin tocar `pgcrypto`.
- [x] Ciclo apply, rollback y apply verificado por el reviewer con snapshot completo.
- [x] `_prisma_migrations` coherente en los tres momentos.

### Arquitectura hexagonal (QC-15)
- [x] Los dos modelos con `/// @module inventario` dentro de su bloque de comentarios.
- [x] Direccion de dependencias respetada: no hay codigo nuevo en `lib/`, asi que no hay
      import que pueda violarla. El contrato del modulo sigue siendo el slot vacio.
- [x] `prisma.product` y `prisma.presentation` solo aparecen en `tests/`, que esta exento.
- [x] Guardia de modulos en verde.

### Aislamiento de los tests de integracion: el defecto de QC-7 NO se repite
- [x] Cada `it` corre en `prisma.$transaction` que termina en ROLLBACK; los rechazos van en
      SAVEPOINT y ROLLBACK TO SAVEPOINT.
- [x] **Ninguna asercion sobre el estado global de una tabla.** Revisado caso por caso: toda
      comprobacion de «no se creo nada» filtra por `id` o por un dato centinela propio.
- [x] Verificado desde fuera: tras mis corridas, las dos tablas quedan a cero filas.
- [x] Se afirma sobre SQLSTATE (23502, 23503, 23514), nunca sobre el texto del mensaje.

### Calidad y seguridad
- [x] RLS activado y forzado en las dos tablas nuevas.
- [x] Sin secretos: el `.env` esta git-ignorado y ninguna cadena de conexion se versiono.
- [x] Sin webhooks en esta feature: idempotencia y firma no aplican.
- [x] Capas separadas: esta feature no cruza ninguna.
- [x] Permisos: no aplica, no hay service. `requirements.md` lo difiere a QC-20 de forma explicita.

### Multiplataforma
No aplica: `zone: backend` y la feature no toca UI. Ni un archivo bajo `app/` o `components/`.

### Dependencias
- [x] `package.json` no aparece en el diff. Cero dependencias nuevas (R24). `design.md > 7`
      razona ademas por que `decimal.js` no hace falta: `Prisma.Decimal` viene con el cliente
      y aqui no se hace aritmetica. Ninguna utilidad escrita a mano que reimplemente una
      libreria del stack.

## Hallazgos

**Mayores (bloqueantes): ninguno.**

### Menores

1. **menor — La bitacora se contradice consigo misma.** La seccion `## Estado`
   (`progress/impl_QC-14-modelo-producto.md`, lineas 9 a 25) sigue diciendo «T6 queda a
   medias», «R22 sigue sin cerrarse en su forma real», T6 `[ ]` y T9 `[ ]`, mientras la
   seccion final (lineas 296 a 348) documenta el ciclo ya ejecutado y cierra R22, y
   `tasks.md` marca T6 y T9 como `[x]`. El estado real es el de la seccion final —lo
   reproduje—, pero quien se pare en la cabecera concluira lo contrario. Lo mismo con el
   bloqueo numero 1 de `## Bloqueos`, que describe un bloqueo ya resuelto. Conviene
   reconciliar la cabecera antes de cerrar la feature.

2. **menor — Asercion tautologica en el test de R2.** En «rechaza una presentacion sin
   nombre», la comprobacion residual `SELECT "id" FROM "presentations" WHERE "name" IS NULL`
   no puede devolver nada nunca, porque la columna es `NOT NULL`: es un `expect([]).toEqual([])`
   disfrazado. No compromete R2 —lo cierra la asercion sobre el SQLSTATE 23502, que si es
   sustantiva—, pero esa linea no vigila nada.

3. **menor — Comentario desalineado con el caso, en el test de R11.** Dice «La alerta (10)
   queda muy por encima de la existencia (3)» cuando el producto se crea con `qtyAlert: 50` y
   el UPDATE la baja a 10. La asercion es correcta y fuerte; el comentario induce a error.

4. **menor — El test de R10 afirma sobre TODO el esquema, no sobre `inventario`.**
   `expect(schema).not.toMatch(/enum .../)` prohibe cualquier `enum` en `db/schema.prisma`,
   incluido uno legitimo de otro modulo en una feature futura: ese dia el rojo saldra en un
   test de QC-14 por un cambio que no es suyo. Acotarlo al cuerpo de `Product` seria mas
   preciso. Comentario analogo, mas leve, para la prohibicion global de `@db.Real` y
   `@db.DoublePrecision` en el test de R8, aunque ahi la prohibicion global si es politica del
   repo (`docs/architecture.md > Dominio`, punto 4).

5. **menor — `design.md > 4` llama «task T7» al ciclo apply, rollback y apply**, que en
   `tasks.md` es la **T6**. Referencia cruzada rota.

6. **menor — T9 esta marcada `[x]` declarando `Dep: T8`, y T8 esta pendiente.** El contenido
   de T9 (el mapa `R<n> -> test` con salida real) esta hecho y verificado, asi que es una
   incoherencia en las dependencias declaradas, no trabajo faltante: la dependencia real de
   T9 es T7, no T8.

7. **observacion — `delivery_time` sin `CHECK` de no negatividad.** Es correcto respecto de la
   decision cerrada 7, que enumera cuatro columnas y no lo incluye, y esta anotado como
   pregunta abierta 4 del diseño. **No es un defecto.** Se anota solo porque un plazo de
   entrega negativo no significa nada y el `ALTER TABLE ... ADD CONSTRAINT` es barato mientras
   no haya datos negativos cargados. Lo decide el humano, no el implementer.

8. **observacion — `presentations.name` sin unicidad.** Igual: nadie lo decidio, el diseño no
   lo invento (regla 6 de `CLAUDE.md`) y lo dejo como pregunta abierta 3. El catalogo admite
   duplicados hasta que se decida, y añadirlo despues exigira limpiar los que haya.

### Lo que NO se cuenta como hallazgo de esta feature

- **T8 pendiente.** Es del leader (merge con `dev` mas `./init.sh` completo), no del implementer.
- **Base propia `QuimiCloude_QC14`.** Deliberada: la creo el leader para esquivar el drift de
  QC-7 en la base compartida, y el `.env` que la apunta esta git-ignorado. Es lo correcto.
- **Rojo de la suite de integracion de `identity` en la base compartida.** Son los fixtures
  `qc7_e2e_*` que QC-7 deja sin limpiar. Contra la base limpia de este worktree esa suite pasa
  entera. No es de QC-14.

## Veredicto

**APROBADO.**

Los 24 requisitos tienen un test que de verdad afirma lo que promete —revisados uno a uno,
abriendo el caso, no leyendo la tabla—. Las 17 decisiones cerradas se respetan, incluidas las
cinco contraintuitivas, y las tres que podrian confundirse con un olvido (`presentations` sin
`deleted_at`, el nombre sin unicidad y `delivery_time` sin `CHECK`) llevan un test que afirma
su ausencia **en positivo**, que es justo lo que impide que alguien las «arregle». El alcance
no se desborda hacia QC-20 en ninguna linea. El ciclo apply, rollback y apply lo reproduje yo
mismo con snapshot completo del esquema y sale identico. Cero dependencias nuevas.

Los ocho hallazgos menores son documentacion (1, 3, 5, 6), una asercion decorativa (2), una
guardia mas ancha de lo necesario (4) y dos preguntas abiertas que corresponden al humano
(7, 8). Ninguno justifica devolver la feature al implementer.

Queda para el leader: T8 (merge con `dev` y `./init.sh` completo), la entrada en
`progress/history.md` y el desmontaje del worktree.
