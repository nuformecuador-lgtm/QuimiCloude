# QC-20 — crud-de-productos · review

> Reviewer, 2026-09-02. Worktree `.worktrees/QC-20-crud-de-productos`, rama
> `feature/QC-20-crud-de-productos`, diff `git diff origin/dev...HEAD` (53 archivos,
> +6606/-46). **No se editó código.** Las dos mutaciones que hice para comprobar hallazgos
> están revertidas y `git status --short` sale vacío.

## Veredicto

**RECHAZADO** — **1 mayor (bloqueante)**, **10 menores**.

El bloqueante es de **documento, no de conducta**: ninguna línea de código está mal, ningún
requisito se queda sin test y ningún checkpoint falla. Es la **tercera afirmación falsa del
diseño** que el leader pidió buscar, y está en la sección **normativa** (§ 7), propagada a un
archivo de código (`ports/presentation-repository.ts`) y al `schema.prisma`. Se arregla
editando texto en tres sitios y re-corriendo el gate.

---

## Checklist de CHECKPOINTS.md

### Especificación
- [x] `requirements.md` con R1–R37 en EARS.
- [x] `design.md` con alternativas descartadas y su porqué (§ 11.1–11.8, ocho).
- [x] `tasks.md`: **16/16 marcadas `[x]`**, cero pendientes.

### Trazabilidad
- [x] Cada `R<n>` mapea a un test concreto. **Abiertos y leídos uno por uno**; ver § 1.
- [x] `progress/impl_QC-20-crud-de-productos.md` contiene el mapa `R1→R37 -> test`.

### Calidad de código (corrido por mí en el worktree, no leído de la bitácora)
- [x] `pnpm run typecheck` → limpio.
- [x] `pnpm run lint` → limpio.
- [x] `pnpm run test:guardias` → **7 archivos / 78 tests** verdes.
- [x] `pnpm exec vitest run tests/unit/inventario/ tests/unit/pagination.test.ts` → **13 / 136** verdes.
- [x] `pnpm exec vitest run tests/integration/inventario/` → **3 / 31** verdes.
- [~] E2E de flujo crítico: la ficha toca **permisos** y no hay E2E. Lo cierra **D4**
      (decisión humana, antes del spec) y **R34**: sin pantalla no hay flujo navegable que
      Playwright pueda visitar. Waiver humano documentado; ver menor m9.
- [n/a] Regla multiplataforma: la feature **no aporta UI** (0 archivos en `app/`,
      `components/`, `hooks/`), vigilado por `tests/unit/inventario/scope.test.ts`.
- [x] Dependencias: `package.json` y `docs/dependencias.md` **no aparecen en el diff**
      (verificado con `git diff --name-only`). Cero dependencias nuevas (R33).

### Datos y seguridad
- [x] **Permiso validado en el SERVICE, con su test.** `requireAdmin` es la primera línea de
      los **nueve** casos de uso. Verificado por mutación propia; ver § 6.
- [x] RLS: la migración no la toca. Consultado `pg_class` en la base del worktree:
      `products` y `presentations` con `relrowsecurity=true` **y** `relforcerowsecurity=true`.
- [x] Acceso a datos solo por el repositorio Prisma. Ningún cliente de Supabase en el módulo.
- [x] Migración reversible: `down.sql` existe, revierte los seis objetos en orden inverso,
      todo con `IF EXISTS`; ciclo real de un salto verificado en T13 (0 diferencias en cinco
      dimensiones). Composición de dos `down.sql`: ver § 2(a).
- [x] Sin secretos hardcodeados (barrido de `localhost:5432`, `postgres://`, `password=` en el
      módulo, el util y la migración: ninguno).
- [n/a] Webhooks: no hay.

### Módulos hexagonales
- [x] `domain/` y `ports/` no importan framework, DB, `shared` ni adaptadores. Verificado por
      grep: las únicas apariciones de `@prisma/client`, `shared/db/prisma`, `shared/pagination`,
      `next/` y `composition` en `domain/`+`ports/` son **comentarios**.
- [x] De otro módulo solo el contrato. `inventario` no toca `User` por ningún camino.
- [x] Ningún driving instancia su driven: los nueve casos de uso salen de `lib/composition`.
- [x] `lib/shared/pagination.ts` es hoja: no importa nada.
- [x] Ningún `use server` reexportado desde `index.ts`.
- [x] `@module inventario` en los dos modelos tocados; ningún modelo ajeno consultado.
- [x] No reaparecen `lib/services/`, `lib/repositories/`, `lib/interfaces/`.
- [x] En la raíz de `lib/` siguen solo `modules/`, `shared/`, `composition/`, `utils.ts`.
- [x] **La lógica está en `domain/`, no en la Server Action** — comprobado a mano, porque la
      guardia no lo mira. Ningún caso de uso es delegación pura; ver § 6.

### Permisos / Configuración / Verificación final
- [n/a] Páginas protegidas y componentes `private/`: sin UI en esta ficha.
- [x] Mutaciones por Server Action, no por API route (`scope.test.ts` lo vigila sobre el disco).
- [x] Nada que cambie entre entornos quedó hardcodeado.
- [~] `./init.sh`: **no reportado como hallazgo** (aborta dentro del worktree por los specs de
      QC-9/QC-21, invisibles desde aquí; desde la raíz el validador pasa). Gate acreditado por
      partes, corrido por mí.
- [ ] `progress/history.md`: **sin entrada todavía** (m10).
- [ ] Worktree desmontado y base `QuimiCloude_QC20` borrada: pendiente, declarado como deuda en
      `progress/current.md`.

---

## 1. Trazabilidad real, no declarada

Leí los **13 archivos de test** de la feature línea a línea buscando aserciones tautológicas,
verdes por construcción y tests que comprueban algo adyacente. **No encontré ningún requisito
sin red real.** Lo que encontré son dos aserciones débiles (m2, m3), ninguna de las cuales deja
un requisito descubierto — y eso lo comprobé mutando, no leyendo.

Lo que quiero dejar acreditado, porque es lo que distingue trazabilidad real de declarada:

- **R2/R3 (`authorization.test.ts`)** es el mejor test de la feature. Tabla de los nueve casos de
  uso, repositorio **nuevo por caso**, doble que **lanza si lo llaman**, y las nueve aserciones
  `not.toHaveBeenCalled()` tras cada rechazo. Incluye `expect(CASOS_DE_USO).toHaveLength(9)`, que
  hace visible olvidar un caso de uso futuro, y un barrido estático de `domain/` con guarda
  `expect(archivos.length).toBeGreaterThan(0)` — o sea, no puede quedarse en placebo sobre cero
  archivos. Los patrones se buscan **tras quitar comentarios**, así que no mide prosa.
- **R6, mitad «sin alterar el autor de la creación»**: con dobles es indemostrable (el puerto
  `updateAlive` ni recibe `createdBy`, el tipo impide el fallo). Está cerrada contra Postgres en
  `product-crud.int.test.ts` › `conserva created_by al editar y al borrar…`, creando con el
  usuario A y editando/borrando con el B. Correcto, y honestamente anotado dentro del propio
  `product-service.test.ts`.
- **R7** se afirma sobre el **SQLSTATE crudo** (`23503` leído de `meta.code`), no sobre el texto
  del mensaje, con INSERT crudo porque la API tipada solo da `P2003`. Correcto.
- **R19** es tabla de ejemplos con los tres casos literales de D12 más `Ñandú`, guiones y espacios.
- **R30** no es un `toContain` decorativo: `isEnglishSnakeCase` parte por guion bajo y exige que
  **cada pieza** esté en una lista blanca, y hay un test que confirma que la guardia **cae** con
  `creado_por`, `nombre_normalizado` y `Created_By`, **y sigue aceptando** los ingleses.
- **R32** compara conjuntos de columnas, constraints e índices creados contra los dropeados y
  exige simetría exacta, longitud exacta del DOWN e `IF EXISTS` en cada sentencia; y tiene **dos
  mutaciones en memoria** que demuestran que la simetría es falsable en las dos direcciones.
- **R34** es falsable de verdad: el bug que la bitácora confiesa (mirar el nombre del archivo en
  vez de la ruta completa, que no cazaba una pantalla llamada `page.tsx` dentro de una carpeta
  `products/`) está corregido — compara sobre la ruta relativa completa.

**Los 37 requisitos tienen test y ninguno es un test vacío.** No hay bloqueante por aquí.

## 2. Las dos entradas declaradas como no-cobertura plena: las dos son honestas

**(a) Composición de los dos `down.sql` — honesta, y verificada por mí.**
Abrí `scripts/db-rollback.ts`: `findLastMigration()` hace `readdirSync(MIGRATIONS_DIR)…sort()` y
`.at(-1)` (líneas 69-75), y la única consulta a `_prisma_migrations` es el `DELETE` posterior
(línea 116). **La herramienta no puede encadenar**; no es que no se quisiera comprobar. Lo
verificado sí cubre lo que `CHECKPOINTS.md` exige de esta feature —toda migración nueva con su
`down.sql`, y `db:rollback` dejando `_prisma_migrations` coherente—, con el snapshot de cinco
dimensiones de T13. La deuda, con sus tres efectos y una propuesta de arreglo, está escrita en
`progress/current.md > Deudas`, y **no se parcheó a mano**, que es lo correcto: es infraestructura
compartida y entra por `/afinar-regla`. **No es excusa.**

**(b) R33 vía `guard-dependencias-aprobadas.test.ts` — honesta, con un matiz.**
Abrí la guardia, como pedía la bitácora. Afirma lo que promete: lee `dependencies` y
`devDependencies` de `package.json`, exige una fila con el nombre entre backticks en
`docs/dependencias.md` —para que la prosa no cuente como aprobación— y además comprueba lo
inverso (registro sin fantasmas). Matiz: la guardia verifica «toda dependencia está aprobada», no
«esta feature no añadió ninguna». El falsador directo de R33 es que **`package.json` y
`docs/dependencias.md` no aparecen en el diff**, y eso lo comprobé yo. Con las dos cosas juntas,
R33 queda cerrado. Y no hay utilidad escrita a mano que ya resuelva una librería del stack: la
normalización usa `String.prototype.normalize` del estándar y la paginación son dos líneas de
aritmética, justificado en `design.md > 9`.

## 3. Los seis archivos ajenos modificados

| Archivo | Veredicto |
| --- | --- |
| `db/schema.prisma` | **Justificado.** Solo añade; ningún modelo de `identity` ni de `recetas` tocado. |
| `lib/composition/index.ts` | **Justificado.** Se añade la fachada `inventario`; el bloque de `identity` no pierde una línea. |
| `lib/modules/inventario/index.ts` | **Justificado.** Conserva el reexport de `ProductCatalog` de QC-24. |
| `tests/integration/inventario/inventario-constraints.int.test.ts` | **Justificado.** Andamiaje por la columna NOT NULL nueva. 0 líneas `expect(` eliminadas. |
| `tests/integration/recetas/recetas-constraints.int.test.ts` | **Justificado.** Su helper usaba un nombre de presentación fijo y se invoca hasta tres veces en la misma transacción: con el índice único nuevo chocaría. Resuelto con su propio `token()`, que sobrevive a la normalización. Ninguna aserción cambia de significado. |
| `tests/unit/inventario/schema/inventario-schema.test.ts` | **Justificado, con dos menores** (m4, m5). |

**Ninguna vigilancia se levantó de más.** Las tres cláusulas de QC-14 retiradas (`domain/` vacía,
`adapters/driving` vacía, contrato vacío) eran **imposibles de cumplir por definición** para la
ficha que le da contenido al módulo, y lo que vigilaban aterrizó en `scope.test.ts` y en
`guard-arquitectura-modulos` (bloques 4, 6 y 13). El bucle que comprueba la ausencia de
`app/api/products`, `app/api/presentations` y `app/api/inventario` sigue vivo. Y el archivo
**gana** aserciones: la nueva sobre `createdBy`/`updatedBy` incluye
`expect(product.body).not.toMatch(/\bUser\b/)`, que es exactamente la garantía de `design.md > 2.1a`.

**La aserción reformulada de acuerdo con la sesión de QC-24 — analizada como se pidió:**

- **¿Prohíbe que la UI importe Server Actions por su subruta?** **No.** Lo verifiqué sobre el
  regex: exige la comilla de cierre **pegada** a `inventario`, así que un especificador
  `.../inventario/adapters/driving/product-actions` no casa por ninguna de sus dos ramas (la
  relativa tampoco: el especificador no termina en `modules/inventario`). Bien resuelto: no
  prohíbe el patrón que `docs/architecture.md` prescribe.
- **¿Pierde lo que protegía la vieja?** **En lo esencial no; en el alcance, un poco** (m5). La
  vieja era global *por construcción*: si el barrel no tiene runtime, nadie puede depender de él
  desde ningún sitio. La nueva es un barrido de texto sobre **cuatro raíces** (`lib/modules`,
  `app`, `components`, `hooks`), así que `lib/shared/**`, `middleware.ts`, `scripts/` y `e2e/`
  quedan fuera de *esta* aserción; el hueco de `lib/shared` lo tapa el **bloque 9** de la guardia
  hexagonal, que es donde toca. En cambio la nueva es **más** estricta donde el riesgo real está:
  cubre `app/`, `components/` y `hooks/`, que la vieja solo alcanzaba por efecto colateral, y deja
  pasar a `lib/composition`, que es el único sitio que legítimamente necesita el runtime.
  **Neto: aceptable**, y el acuerdo entre las dos sesiones fue la forma correcta de resolverlo.

## 4. Los dos tests permanentes de mutación de esquema — confirmado, no desmentido

Corrí `tests/integration/inventario/` (31/31 verde) y consulté el catálogo de Postgres de
`QuimiCloude_QC20` **antes y después**, con un script propio que borré al terminar:

```
indices presentations : presentations_name_normalized_key, presentations_pkey   (idénticos antes/después)
fks products          : products_created_by_fkey       confdeltype=r confupdtype=c
                        products_presentation_id_fkey  confdeltype=r confupdtype=c
                        products_updated_by_fkey       confdeltype=r confupdtype=c   (idénticos)
conteos               : products=0  presentations=0  users=0  roles=0
rls                   : products y presentations  rowsecurity=true  forcerowsecurity=true
migraciones           : 6, sin cambios
```

**La base no queda tocada.** El `DROP INDEX` y el `ALTER TABLE … DROP CONSTRAINT` son DDL
transaccional en Postgres y viven dentro de la transacción que `inRolledBackTransaction` siempre
deshace; además cada test **vuelve a comprobar fuera** de la transacción que el objeto sigue en
pie, y el de la FK afirma `confdeltype=r`, no solo su existencia. Las dos afirman lo que dicen:
sin el índice quedan **dos** filas con el mismo `name_normalized`; sin el `RESTRICT` el DELETE
afecta **una** fila y el producto queda huérfano. Que sean **permanentes** es la parte buena:
impiden que R20 y R21 se vuelvan verdes por construcción el día que alguien retire el índice o la FK.

*(Nota: `document_types` sale con **1** fila y no es residuo de fixture: la siembra la migración
`20260806122638_users_and_roles`, línea 28.)*

## 5. La desviación de aislamiento — riesgo bien acotado

Es correcto que los puertos de `design.md > 7` no reciben `Prisma.TransactionClient` y que, por
tanto, una llamada al adaptador «dentro» de `prisma.$transaction` no participa de esa transacción.
El reparto elegido es el adecuado: lo que verifica una **restricción de la base** (R7 y todo
`presentation-uniqueness`) usa `tx` + `SAVEPOINT` + `ROLLBACK`; lo que ejercita **el adaptador de
verdad** usa fixtures reales con borrado por id en `finally`. Ningún test hace afirmaciones
globales del tipo «hay N productos»: todos filtran por lo que ellos mismos sembraron.

Lo confirmo con dato propio: tras mi pasada, los conteos de `products`, `presentations`, `users` y
`roles` son **0, 0, 0, 0**. El coste declarado —un test interrumpido entre el fixture y su
`finally` puede dejar filas— es real y está **acotado a la base propia del worktree**, que es
justamente para lo que se montó. La salida limpia (puertos que acepten `TransactionClient`) es
rediseño de nueve firmas y no es alcance de T14; queda anotada en `progress/current.md` dirigida a
quien toque esos puertos. **Bien resuelto y bien declarado.**

## 6. Autorización — verificada por mutación, no por lectura

- `requireAdmin` es la **primera línea** de los nueve casos de uso, antes de zod y antes de
  cualquier puerto. Comprobado archivo por archivo.
- **No se llega al repositorio**: el doble lanza si lo llaman **y** se afirman las nueve
  `not.toHaveBeenCalled()` tras cada rechazo, con repositorio nuevo por caso.
- **Mutación propia:** quité `requireAdmin` de `get-product.ts` y de `list-presentations.ts` a la
  vez. `authorization.test.ts` → **2 tests rojos**, uno con el mensaje
  `get-product deberia rechazar con actor undefined: expected Error: el repositorio no debe ser
  llamado to be an instance of UnauthorizedError`. Revertido; `git status` limpio. Confirmo el
  dato de la bitácora: `product-service.test.ts` sigue verde sin `requireAdmin`, así que
  `authorization.test.ts` es la **única** red de R1, R2 y R3 en toda la feature.
- `requireAdmin` compara por **igualdad exacta**, y el test incluye `Administradores externos`,
  que es justo el caso que se colaría con un `includes`.
- **Ningún caso de uso es delegación pura.** El más fino es `get-product`, y aun así decide tres
  cosas: autoriza, traduce `null` a `NotFoundError` y **delega el filtro de borrados al puerto**
  (`findAliveById`) en vez de a un `if` propio. `delete-presentation` traduce el resultado
  discriminado (`not_found` / `in_use`) a dos errores distintos de dominio; los dos `list-*`
  validan con `pageQuerySchema` antes de tocar el puerto, y hay test de que **no** lo tocan;
  `create-presentation` y `update-presentation` calculan la forma normalizada y traducen el
  `duplicate` del puerto. Las Server Actions no repiten ninguna regla: solo traducen entrada y
  errores.

## 7. `ON DELETE RESTRICT` en las FK de auditoría — decisión correcta, la respaldo

El spec no la fijaba y decidirla era obligado. Las tres razones se sostienen, y verifico las dos
comprobables:

1. **Convención del repo:** las tres FK preexistentes usan `Restrict` + `Cascade` sin excepción.
   Verificado en `db/schema.prisma` y contra `pg_constraint` (`confdeltype=r`, `confupdtype=c` en
   las tres de `products`).
2. `users` tiene borrado lógico, así que el DELETE físico no ocurre por ningún camino de la
   aplicación: hoy los dos comportamientos son equivalentes y solo se diferencian en **cómo fallan**.
3. **El argumento decisivo es el correcto:** R7 exige «referencia real a un usuario existente», y
   `SET NULL` la convierte en `NULL` **en silencio**. En una columna de auditoría eso destruye la
   atribución sin avisar; `RESTRICT` la rompe con ruido, el día que alguien escriba un script de
   purga, que es cuando conviene enterarse.

Añado una razón que la refuerza y ninguna que la contradiga: como la migración deja `created_by`
**anulable** a propósito (para las filas anteriores a la feature), con `SET NULL` un `NULL`
sobrevenido sería **indistinguible** de un `NULL` histórico y ni siquiera se podría auditar el
daño. Con `RESTRICT`, `NULL` significa exactamente una cosa: fila anterior a QC-20.
**Decisión acertada.**

---

## Hallazgos

### MAYOR (bloqueante) — 1

**M1 · BLOQUEANTE — La tercera afirmación del diseño que el código contradice sigue viva, y está
en la sección normativa.**

`design.md > 11.4` se corrigió para **retirar** la frase «la comprobación previa se mantiene, pero
solo para dar un mensaje decente». Esa misma afirmación **sigue escrita en `design.md > 7`**, que
es la sección normativa de los puertos:

- `specs/QC-20-crud-de-productos/design.md:401` — «…la garantía de R20 sigue siendo del índice:
  la comprobación previa por `nameNormalized` es una cortesía para dar buen mensaje…»

Y **propagada a dos artefactos de código**:

- `lib/modules/inventario/ports/presentation-repository.ts:12` — «…esta comprobación previa por
  `nameNormalized` es solo una cortesía de mensaje…»
- `db/schema.prisma:109` — «…la comprobación previa por igualdad es solo cortesía de mensaje…»

**Por qué es falso:** no existe ninguna comprobación previa. `create-presentation.ts` y
`update-presentation.ts` llaman al puerto y traducen `duplicate`, sin más. Y **no puede existir**:
el `PresentationRepository` —el mismo que documenta esa línea— expone `create`, `rename`,
`deleteById` y `list`, y **ningún método de búsqueda por `nameNormalized`**. Es exactamente el
razonamiento con el que § 11.4 la retiró.

**Por qué bloquea, siendo solo texto:** es el patrón que este repo declara caro por escrito —«un
diseño que afirma algo falso es peor que uno incompleto, porque nadie va a buscar donde el
documento dice que no hay nada», lección de QC-8 citada en la propia bitácora § 8—, y el
implementer aplicó ese estándar dos veces corrigiendo el documento. Esta tercera instancia se
quedó, y **está peor colocada que las dos corregidas**: § 7 es normativo, y la frase se copió al
doc-comment del **puerto**, que es el contrato que van a leer QC-22 y QC-25. Quien lo lea
concluirá que falta implementar una comprobación previa, o la añadirá, y estará metiendo justo el
camino **no atómico** que § 11.4 prohíbe.

**Qué falta para cumplirlo:** corregir la frase en los **tres** sitios (`design.md:401`,
`lib/modules/inventario/ports/presentation-repository.ts:12`, `db/schema.prisma:109`) para que
digan lo que hace el código —la unicidad la garantiza el índice único y **no hay** comprobación
previa, por diseño (§ 11.4)— y re-correr el gate. No hay cambio de conducta.

*(No hay que tocar `requirements.md:116` ni el comentario de `migration.sql:71`: citan el
enunciado hipotético de R20 —«dos altas simultáneas **que superen la comprobación previa**»—, que
es prosa de requisito, no una afirmación sobre lo implementado.)*

### MENORES — 10

**m1 · menor — Nombres de test que son un número de requisito, no una conducta.**
`docs/conventions.md > Tests` exige que el nombre describa el comportamiento. Quedan al menos dos
`it` que son solo la lista de requisitos, en
`tests/unit/inventario/product-service.test.ts`: línea 172 (`R15, R16`) y línea 227
(`R23, R24, R25, R26, R35, R36`). La bitácora (Grupo B) afirma haber dado la vuelta a este
anti-patrón; se le escaparon estos dos. Cosmético, pero contradice su propia acta.

**m2 · menor — Un test que verifica el `replace` de JavaScript, no el repo.**
`tests/unit/inventario/schema/inventario-audit-migration.test.ts:185`
(«la sensibilidad de la FK cae si se relaja a ON DELETE CASCADE») toma la sentencia, sustituye
`ON DELETE RESTRICT` por `ON DELETE CASCADE` **en una cadena en memoria** y afirma que el
resultado cambió y ya no casa con `RESTRICT`. Eso es una propiedad de `String.replace`, no del
código: lo único del repo que comprueba —que la FK lleva `ON DELETE RESTRICT`— ya lo afirma el
test inmediatamente anterior. Es el hermano degenerado de las dos mutaciones en memoria del
`down.sql` (líneas 302 y 309), que sí ejercitan funciones del propio archivo (`droppedColumns`,
`addedColumns`) y sí son informativas. Sugerencia: borrarlo, o convertirlo en mutación real sobre
`statements()`.

**m3 · menor — El test citado para R23 no es el que guarda R23.**
`tests/unit/pagination.test.ts:10` afirma que `pagina.items.length` es menor o igual que
`pagina.pageSize` con 3 items y `pageSize: 3` construidos por el propio test: es un pass-through
de sus argumentos, y `buildPage` no recorta nada. La sustancia de R23 —«devolver como máximo
tantos elementos como el tamaño de página»— vive en el `take: limit` del adaptador. **Lo comprobé
por mutación:** quité `take: limit` de `listAliveProducts` y el que se pone rojo es
`product-crud.int.test.ts` › R26, **no** el de paginación. Revertido. O sea: **R23 no está
descubierto**, pero el mapa lo atribuye al más débil de sus dos guardianes. Sugerencia: añadir
`product-crud.int.test.ts` a la fila de R23 del mapa, o una aserción de que una lista con más
filas que `pageSize` devuelve exactamente `pageSize` elementos.

**m4 · menor — Exención muerta en la aserción reformulada.**
En `inventario-schema.test.ts`, `composicionDir` se usa en un `if (...) continue`, pero
`lib/composition` **no está** entre `raicesVigiladas` (`lib/modules`, `app`, `components`,
`hooks`), así que ningún archivo de composición llega nunca a ese `continue`. El comentario la
presenta como una de las «dos exenciones deliberadas» y sugiere que hace trabajo. Es inocua, pero
es una línea que dice algo que no ocurre.

**m5 · menor — La reformulación estrecha el alcance respecto de la aserción vieja.**
Detallado en § 3. `lib/shared/**`, `middleware.ts`, `scripts/` y `e2e/` quedan fuera de esta
aserción concreta; `lib/shared` lo cubre el bloque 9 de la guardia hexagonal, los otros tres no
tienen vigilancia específica. **No bloquea** —la versión nueva es más estricta donde el riesgo
real está—, pero conviene que el acuerdo entre sesiones quede con su límite escrito.

**m6 · menor — `design.md > 12` atribuye R21 y R22 al test que explícitamente los desmiente.**
La tabla dice `presentation-service.test.ts | R17, R18, R21, R22`; el propio archivo declara en su
cabecera que R20, R21 y R22 los cierran los de integración y que él solo demuestra la traducción
del resultado discriminado. El mapa de la bitácora **sí** los atribuye bien
(`presentation-uniqueness.int.test.ts`). Es el documento el que quedó desalineado.

**m7 · menor — `presentation-actions.ts` no tiene ningún test unitario.**
Las cuatro Server Actions de presentación solo están vigiladas por `scope.test.ts`, que comprueba
que declaran `use server`. El razonamiento de la bitácora —mismo patrón, sin conversión numérica,
ya demostrado en `product-actions.test.ts`— es defendible y ningún requisito se queda sin red por
ello, pero un fallo en el `currentActor()` o el `toErrorState()` de ese archivo hoy no lo caza
nada. Leí el archivo: son correctos y estructuralmente idénticos a los de producto.

**m8 · menor — Recuento equivocado en la bitácora.** § 3 dice «`domain/` (16 archivos …)» y a
continuación enumera **17** (actor, errores, page, normalización, 2 esquemas zod, 2 vistas y los 9
casos de uso). En disco hay 17. Dato menor, pero la bitácora de esta feature se ha ganado su
reputación corrigiendo premisas falsas propias; ésta se le pasó.

**m9 · menor — El waiver de E2E cubre la decisión, no la letra del checkpoint.**
`CHECKPOINTS.md` líneas 19-20 exigen un E2E cuando la feature toca **permisos**, y ésta los toca,
sin cláusula de excepción escrita (esa cláusula existe solo en el punto de UI). Aquí la excepción
la cerró el **humano** en D4 antes del spec, con motivo sólido —sin pantalla no hay flujo
navegable— y la decisión pasa a QC-22. **No lo cuento como bloqueante**: una decisión humana
previa manda sobre la lectura literal. Lo dejo escrito para que QC-22 no lo herede en silencio:
**el E2E de permisos del catálogo es deuda con dueño.**

**m10 · menor — Cierre pendiente.** Falta la entrada en `progress/history.md`, y quedan por
desmontar el worktree y por borrar la base `QuimiCloude_QC20` (hoy el Postgres local tiene tres
bases). Lo segundo está declarado en `progress/current.md`; lo primero, no. Son pasos del cierre,
no de la implementación.

---

## Lo que hice yo, para que se pueda auditar

| Comprobación | Resultado |
| --- | --- |
| `pnpm run typecheck` / `pnpm run lint` | limpios |
| `pnpm run test:guardias` | 7 archivos / 78 tests verdes |
| `pnpm exec vitest run tests/unit/inventario/ tests/unit/pagination.test.ts` | 13 archivos / 136 tests verdes |
| `pnpm exec vitest run tests/integration/inventario/` | 3 archivos / 31 tests verdes |
| Catálogo de Postgres antes y después de la suite de integración | índice único presente, 3 FK con `confdeltype=r`, RLS true/true, 0 filas residuales — **idéntico** |
| **Mutación 1:** quitar `requireAdmin` de `get-product.ts` + `list-presentations.ts` | `authorization.test.ts` → 2 rojos. **Revertida** |
| **Mutación 2:** quitar `take: limit` de `listAliveProducts` | `product-crud.int.test.ts` › R26 → rojo (el de paginación **no**). **Revertida** |
| `git status --short` al terminar | vacío |
| `scripts/db-rollback.ts` | confirmado: elige por disco (líneas 69-75), nunca consulta `_prisma_migrations` para elegir |
| `package.json` y `docs/dependencias.md` en el diff | ausentes (R33 cerrado) |
| Capas: `@prisma/client`, `shared/db/prisma`, `shared/pagination`, `next/`, `composition` en `domain/` y `ports/` | solo en comentarios, cero imports |

*No reporté como hallazgo el aborto de `./init.sh` dentro del worktree por los specs de QC-9 y
QC-21, tal como se indicó.*

---

## Qué falta para pasar a OK

Solo **M1**: corregir en tres sitios la afirmación de la comprobación previa que no existe
(`design.md:401`, `lib/modules/inventario/ports/presentation-repository.ts:12`,
`db/schema.prisma:109`) y re-correr el gate. Los diez menores son recomendables pero no bloquean;
**m3** y **m9** son los dos que más conviene atender antes de que QC-22 los herede.

Fuera de eso, es una feature bien construida: la autorización tiene la única red posible y la
tiene bien puesta, los dos tests permanentes de mutación de esquema son la respuesta estructural
correcta al problema de los verdes por construcción, y las tres desviaciones —aislamiento por
fixtures, composición de los `down.sql`, `ON DELETE RESTRICT`— están declaradas y no disimuladas.

---
---

# RONDA 2 — revisión del cierre (no de la feature entera)

> Reviewer, 2026-09-02, tras los commits `432251d`, `f97a9de`, `e6ad5e2`, `63c08de`.
> Alcance: **solo el cierre**. La ronda 1 de arriba **no se reescribe**.
> **No se editó código.** Las cuatro mutaciones que hice están revertidas: `git diff` vacío y
> `git status --short` solo con este archivo, sin trackear.

## Veredicto de la ronda 2

**APROBADO.**

| | Ronda 1 | Ronda 2 |
| --- | --- | --- |
| Mayores (bloqueantes) | 1 | **0** |
| Menores | 10 | **4 nuevos**, ninguno bloqueante |
| Cerrados | — | M1 + 7 menores (m1, m3, m4, m6, m7, m8, m9) |
| Anotados como deuda con motivo | — | 3 (m2, m5, m10) |

**M1 está cerrado bien**, no solo cambiado. Los cuatro menores nuevos son de texto y de
redundancia: ninguno deja un requisito sin red ni un checkpoint sin cumplir.

---

## 1. M1 en sus tres sitios — cerrado, y el texto nuevo es correcto **y suficiente**

No me limité a comprobar que cambió. Juzgué si **quien lea el puerto entiende que la ausencia es
deliberada y por qué**, que era el criterio.

**`lib/modules/inventario/ports/presentation-repository.ts` (el peor de los tres):** el texto
nuevo dice tres cosas, y las tres hacen falta:

1. la unicidad la da **solo** el índice `presentations_name_normalized_key`;
2. **este puerto no expone ningún método de búsqueda** —y los nombra: `findBy`, `search`,
   `exists`—, así que la comprobación previa es **inexpresable**, no solo inexistente;
3. y aunque lo fuera, sería **una carrera**: entre el `SELECT` y el `INSERT` cabe otra transacción.

Eso es exactamente lo que faltaba. Antes el lector concluía «falta implementar algo»; ahora
concluye «esto no se hace, y aquí está el porqué». Nombrar los tres métodos que **no** existen es
mejor de lo que yo pedí: convierte la ausencia en una afirmación comprobable en vez de en un
silencio. **Suficiente.**

**`db/schema.prisma`** y **`design.md > 7`** dicen lo mismo con el mismo par de razones, y
`design.md > 7` añade a dónde va el lector para el detalle (§ 11.4). Correcto.

**Barrido de las ocurrencias que quedan:** las cinco de `design.md`, la del puerto y las tres de
`presentation-service.test.ts` **niegan** la existencia de la comprobación previa. Las dos que la
mencionan en positivo son `requirements.md:116` y el comentario de `migration.sql:71`, que citan el
enunciado hipotético de R20 —dos altas simultáneas **que superen la comprobación previa**— y que
pedí expresamente no tocar. `git diff ab8a416..HEAD` de esos dos archivos: **vacío**. Correcto.

## 2. Que la ronda fue documental — verificado, y la aritmética cuadra sola

| Suite | Ronda 1 | Ronda 2 | Delta |
| --- | --- | --- | --- |
| unit + ui | 49 archivos / 482 tests | 50 / 501 | **+1 archivo, +19 tests** = exactamente m7 |
| integración | 8 / 106 | 8 / 106 | **0** |
| guardias | 7 / 78 | 7 / 78 | **0** |
| **total** | 64 / 666 | **65 / 685** | +1 / +19 |

`50+8+7 = 65` y `501+106+78 = 685`, que es el gate que corriste. **Ningún test se añadió, se quitó
ni cambió de resultado por M1**: todo estaba verde y sigue verde con los mismos recuentos salvo el
archivo nuevo.

Y el caso que había que mirar de cerca: M1 tocó `db/schema.prisma`, que **sí** parsea
`inventario-schema.test.ts`. Lo corrí: **20/20**, el mismo número que en la ronda 1. El texto nuevo
va en un doc-comment de tres barras y `stripComments` lo retira antes de afirmar, así que no puede
influir. Los otros dos sitios de M1 no los lee ningún test. **Confirmado: M1 fue documento.**

## 3. m7 — no es un calco (con una excepción, n1), y **sí compro el matiz**

**Corrí el archivo yo: 19/19 verdes.** Y lo muté donde importa: hice que `toErrorState` dejara de
traducir el error de presentación en uso. Cayó **exactamente 1 test**, y es el propio de
presentaciones (`traduce PresentationInUseError … al borrar una presentacion con productos
asignados (R21)`). Revertido; `git diff` vacío. La aserción que distingue este archivo del de
producto **es real y falsable**.

**No es un calco**, y lo sostienen tres de las cuatro conductas que alega la bitácora:
`DuplicateNameError` a `duplicate_name` al crear **y** al renombrar (R18, que producto no tiene
porque su nombre no es único, D14); `PresentationInUseError` a `presentation_in_use` (R21, que
producto no tiene en absoluto); y la distinción de R37/D22 —un nombre que normaliza a vacío da
`invalid_input` y **nunca** `duplicate_name`—, con una aserción explícita `not.toBe` sobre el
código de duplicado. La cuarta fila es falsa y va como menor **n1**. Y, correctamente, **no** trae
la conversión numérica de `FormData`: presentación solo tiene `name`.

**El matiz sobre R28: lo compro, y está bien argumentado.** La asimetría es la correcta en
hexagonal, y la razón es concreta, no estética:

- `product-actions.ts` **tiene que** convertir antes de validar, porque `FormData` entrega cadenas
  y `createProductSchema` exige `z.number()` en cinco campos. Esa conversión puede fallar, y su
  fallo **el dominio no lo puede ver**: `Number` de una cadena no numérica da `NaN`, y `NaN` pasa
  `z.number().int()` como número válido. Por eso la action necesita un rechazo **propio**
  (`INVALID_NUMBER`) y por eso ese rechazo necesita test **en la action**.
- `presentation-actions.ts` no tiene nada que convertir: `name` ya es cadena y llega intacto a
  `createPresentationSchema`. Validar `name` en la action sería **regla de negocio duplicada fuera
  del dominio**, que es justo lo que `CHECKPOINTS.md > Módulos hexagonales` prohíbe. Que estos
  tests demuestren **traducción** y no validación no es una carencia: es la consecuencia de que la
  action no decida nada, que es lo que queremos.
- Y no queda hueco: la validación de `name` la cierran `presentation-service.test.ts` —rechaza
  antes de llamar al puerto, con `not.toHaveBeenCalled()`— y `product-input.test.ts` —los esquemas
  zod, incluido el límite de 60 y el `refine` de R37—.

La única validación propia que **sí** tiene `presentation-actions.ts` —el `id` faltante en el
borrado— está testeada como toca, con `not.toHaveBeenCalled()` sobre el caso de uso.

## 4. m4 — comprobado en **tres** direcciones, no en dos

La exención muerta se eliminó, y el comentario nuevo explica algo mejor que lo que había: que
`lib/composition` **no necesita exención porque no está entre las raíces barridas**, y que
precisamente por eso es el único sitio que puede importar las factories en runtime.

Lo verifiqué yo, con archivos temporales que borré después:

| Caso | Esperado | Observado |
| --- | --- | --- |
| `lib/modules/recetas/…` importa el barrel **en runtime** | rojo | **rojo**, con el mensaje de que fuera de `lib/composition` debe ser import de tipo |
| `lib/modules/recetas/…` importa el barrel como **import de tipo** | verde | **verde**, 20/20 |
| `lib/composition/…` importa el barrel **en runtime** | verde | **verde**, 20/20 |

La tercera fila es la que el implementer propone como criterio reutilizable, y tiene razón:
verificar solo el rojo habría dejado pasar el caso en que la exención se lleva por delante algo
legítimo. **No perdió alcance:** el regex, las cuatro raíces y el `continue` de `inventarioDir`
están intactos, así que la aserción **sigue siendo la acordada con la sesión de QC-24**. Solo se
quitó una rama inalcanzable.

## 5. m3, m6, m8, m9 — los cuatro cerrados; los dos que marqué como importantes, bien

**m3 — el mapa apunta ahora al test que de verdad guarda R23.** La fila cita **primero**
`product-crud.int.test.ts` › `recorre las paginas sin repetir ni omitir productos homonimos`
—«es donde vive la sustancia: el `take: limit` del adaptador»— y **después** el unitario, descrito
por lo que es: aritmética de `buildPage`. Es el orden correcto, y es el que probé por mutación en
la ronda 1: quitar `take: limit` enrojece el de integración, no el de paginación. **Cerrado bien.**

**m9 — cubre la letra de `CHECKPOINTS.md`.** El waiver nuevo hace las cinco cosas que hacían falta:
cita la línea literal, **admite que por la letra el checkpoint no se cumple** en vez de maquillarlo,
nombra quién decidió la excepción (el humano, D4, antes del spec), da el motivo estructural —un E2E
visita una pantalla y R34 prohíbe que exista, así que escribirlo obligaría a violar R34—, nombra al
heredero (**QC-22**) y, lo mejor, **declara qué sigue sin cubrir**: que la Server Action entregue de
verdad al caso de uso el actor de la sesión del navegador, extremo a extremo. Eso es deuda con
dueño, no un checkbox marcado. **Cerrado bien.**

**m6** — la fila de `design.md > 12` dice ahora explícitamente que `presentation-service.test.ts`
**NO** cierra R20, R21 ni R22, alineándose con la cabecera del propio archivo y con el mapa de la
bitácora. Correcto.

**m8** — corregido a 17, y **con más precisión de la que yo tenía**: en disco hay **18** archivos en
`domain/`, y el decimoctavo es `product-catalog.ts`, que trajo QC-24. Lo verifiqué: el archivo
existe en `origin/dev`, y `git diff --diff-filter=A` sobre `domain/` da **17** archivos creados por
QC-20. El dato corregido es exacto.

**m1** (que no estaba en tu lista, pero se cerró igual) — los dos `it` renombrados a conducta, con
los números de requisito movidos a comentario. Ninguna aserción cambia.

## 6. m2, m5 y m10 como deuda — los tres motivos son honestos

**m5 — el mejor motivo de los tres, y el correcto.** No se toca porque **es un acuerdo con la
sesión de QC-24**, y cambiarlo unilateralmente repetiría exactamente el fallo de coordinación que
esa misma sesión documentó como deuda en `progress/current.md`. Coincido sin reservas: el límite
queda escrito y la decisión es de las dos sesiones. Es la respuesta correcta a un hallazgo que
**no** debía cerrarse por un lado solo.

**m10 — correctamente devuelto al leader.** La entrada en `progress/history.md`, el desmontaje del
worktree y el borrado de `QuimiCloude_QC20` son pasos posteriores al merge.

**m2 — el motivo es honesto** (test de poco valor, no agujero: lo único del repo que comprueba ya
lo afirma el test inmediatamente anterior), pero **la evidencia que cita es de otro hallazgo**: ver
menor **n3**.

## 7. Una vuelta más a la trampa de siempre, sobre el texto NUEVO

Releí las tres correcciones de M1, la fila nueva de `design.md > 12`, el comentario nuevo de
`inventario-schema.test.ts` y las 208 líneas nuevas de la bitácora, buscando la cuarta.

**En `design.md` no encontré ninguna.** Las cuatro afirmaciones nuevas —el índice único como
garantía única, la ausencia deliberada de comprobación previa por ser carrera, la misma ausencia
por ser inexpresable con el puerto, y el mensaje saliendo del resultado discriminado traducido— las
contrasté contra `create-presentation.ts`, `update-presentation.ts`, `presentation-prisma.ts` y el
puerto, y las cuatro se sostienen. La fila nueva de § 12 también.

**Sí encontré dos en la bitácora (n1, n3) y una imprecisión en el doc-comment del puerto (n4).** En
los tres casos la conclusión es correcta y lo que falla es un dato de apoyo — que es, literalmente,
el patrón que esta feature lleva toda la jornada persiguiendo. Van como menores porque viven en la
bitácora y en un paréntesis, no en el diseño ni en un contrato ejecutable.

---

## Hallazgos nuevos de la ronda 2 — 4 menores, 0 mayores

**n1 · menor — La cuarta fila de la tabla «no es un calco» es falsa, y es justo la fila calcada.**
La bitácora presenta, bajo el encabezado *«Por qué producto NO la tiene»*, esta fila:
*«`deletePresentationAction` rechaza el `id` faltante antes de llamar al caso de uso»*. **Producto
sí la tiene**, idéntica: `deleteProductAction` hace el mismo `readFormString` y el mismo rechazo de
la cadena vacía con el mismo `MISSING_ID_ERROR`, y **ya está testeada** en
`product-actions.test.ts:188` (`rechaza cuando falta el id, sin llamar al caso de uso`). O sea que
ese test del archivo nuevo es **el único que sí es un calco** del de producto, y está listado como
prueba de lo contrario. **No cambia el veredicto de m7**: las otras tres filas son genuinamente
propias de presentaciones, y la del error de presentación en uso la muté para comprobarlo. El test
en sí es correcto y vale la pena tenerlo — solo no distingue nada. Corregir la fila.

**n2 · menor — Un `it.each` de tres casos que es la misma aserción tres veces.**
`presentation-actions.test.ts:119-136` parametriza tres nombres inválidos (vacío, solo espacios, de
más de 60 caracteres) pero **el mock rechaza incondicionalmente** con `ValidationError`, así que el
valor de `name` **no influye en el resultado**: las tres iteraciones ejecutan el mismo camino y
afirman lo mismo. No es infalsable —verifica que `toErrorState` mapea `ValidationError` a
`invalid_input`—, pero la parametrización **promete** cubrir tres formas de nombre inválido y no
cubre ninguna: eso lo hace `product-input.test.ts` sobre el esquema. Es coherente con el matiz
honesto que la propia bitácora escribió —estos tests demuestran traducción, no validación—, pero el
`it.each` lo contradice visualmente. Sugerencia: un solo test, o mover la parametrización a donde el
valor sí decide.

**n3 · menor — La justificación de m2 cita la evidencia de m3.**
El apartado de m2 dice: *«el reviewer verificó que el requisito no queda descubierto: quitar
`take: limit` enrojece R26 en integración»*. Esa mutación fue la evidencia de **m3** (paginación,
R23), no de m2, que trata del test de `ON DELETE RESTRICT`. Lo que sostiene a m2 es otra cosa, y es
cierta: la aserción inmediatamente anterior del mismo archivo ya afirma que las dos FK llevan
`ON DELETE RESTRICT` y que **no** llevan `SET NULL`, `CASCADE`, `SET DEFAULT` ni `NO ACTION`, así
que el requisito no queda descubierto si se borra el test degenerado. Conclusión correcta, premisa
prestada del hallazgo de al lado.

**n4 · menor — Imprecisión en el doc-comment nuevo del puerto.**
Dice que el mensaje al usuario sale del resultado `duplicate` que devuelve el adaptador *«cuando
Postgres rechaza el `INSERT`»*. Vale para `create`, pero **`rename` también devuelve `duplicate`** y
ahí lo que Postgres rechaza es un `UPDATE`, no un `INSERT`. La misma frase aparece en
`db/schema.prisma`. Es un paréntesis, no una afirmación estructural, pero es texto nuevo escrito
deprisa en el archivo que más lectores externos va a tener. Sugerencia: «cuando Postgres rechaza la
escritura».

---

## Lo que hice yo en la ronda 2, para que se pueda auditar

| Comprobación | Resultado |
| --- | --- |
| `git diff ab8a416..HEAD` completo (7 archivos) | leído entero: solo doc-comments, dos filas de tabla, una línea muerta, dos nombres de test, un recuento y el archivo de test nuevo |
| Barrido de «comprobación previa» en `specs/`, `lib/`, `db/`, `tests/` | todas las de QC-20 niegan su existencia salvo las dos de prosa de requisito, intactas |
| `git diff ab8a416..HEAD` de `requirements.md` y `db/migrations/` | **vacío**, como pedí |
| `pnpm exec vitest run tests/unit/inventario/schema/inventario-schema.test.ts` | 20/20, mismo número que la ronda 1 pese a que M1 tocó `schema.prisma` |
| `pnpm exec vitest run tests/unit/inventario/presentation-actions.test.ts` | 19/19 |
| **Mutación A:** import de runtime del barrel desde `lib/modules/recetas/` | rojo. **Revertida** |
| **Mutación B:** el mismo import, como import de tipo | verde, 20/20. **Revertida** |
| **Mutación C:** import de runtime del barrel desde `lib/composition/` | verde, 20/20. **Revertida** |
| **Mutación D:** `toErrorState` deja de traducir el error de presentación en uso | **exactamente 1 test** rojo, el propio de presentaciones. **Revertida** |
| `git diff` y `git diff --stat` al terminar | **vacíos**; `git status --short` solo con este archivo, sin trackear |
| Procedencia de `domain/product-catalog.ts` y `--diff-filter=A` sobre `domain/` | 18 en disco, 17 creados por QC-20: el recuento corregido de m8 es exacto |
| `deleteProductAction` y `product-actions.test.ts:188` | producto **sí** valida el id faltante y **sí** lo testea, de donde sale n1 |

---

## Veredicto final

**APROBADO.** El bloqueante de la ronda 1 está cerrado en los tres sitios, con texto que además
explica el porqué mejor de lo que pedí; la ronda fue efectivamente documental y la aritmética de los
recuentos lo demuestra sola; m7 se cerró con un test propio de presentaciones y falsable, no un
calco; y m4 se verificó en las dos direcciones que hacían falta, más una tercera.

Quedan **cuatro menores nuevos** —n1, n2, n3 y n4—, todos de texto o de redundancia, **ninguno
bloqueante**, y **tres deudas anotadas con motivo honesto** —m2, m5 y m10—, de las cuales m5 no debe
cerrarse unilateralmente y m10 es del leader tras el merge.

Recuento final de la ronda 2: **0 mayores, 4 menores nuevos, 3 deudas con dueño.**
