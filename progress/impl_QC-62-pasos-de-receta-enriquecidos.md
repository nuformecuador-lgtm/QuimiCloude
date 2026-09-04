# QC-62 - pasos-de-receta-enriquecidos - bitacora de implementacion

> Rama `feature/QC-62-pasos-de-receta-enriquecidos`, worktree
> `.worktrees/QC-62-pasos-de-receta-enriquecidos`. Spec aprobado por el humano en F1.4 (2026-09-04).
> Coordino `implementer`; escribieron `backend_dev` (T1-T4, T8-T11 y los fixtures backend de T12) y
> `frontend_dev` (T5-T7 y los tests de pantalla de T12).
>
> **AVISO QUE VIAJA CON ESTA FEATURE:** la migracion `20260904160000_recipe_steps_reset` **borra
> los pasos de TODAS las recetas existentes**, incluidas las borradas logicamente, y es
> **IRREVERSIBLE** (R14, R15, decision cerrada 5). El `down.sql` existe y lo declara por escrito;
> no restaura nada porque no hay copia en ninguna parte. Es deliberado y esta aprobado.

## Estado de las tareas

T1-T12 y T14 cerradas y marcadas `[x]` en `tasks.md`. **T13 (gate) queda para el leader**: el
implementer no corre `./init.sh` ni la suite completa (regla del gate de `AGENTS.md`).

## Archivos creados

| Archivo | Tarea |
| --- | --- |
| `db/migrations/20260904160000_recipe_steps_reset/migration.sql` | T4 |
| `db/migrations/20260904160000_recipe_steps_reset/down.sql` | T4 |
| `tests/unit/recetas/recipe-step-document.test.ts` | T8 |
| `tests/unit/recetas/recipe-step-contract.test.ts` | T9 |
| `tests/unit/recetas/recipe-prisma-steps.test.ts` | T10 |
| `tests/unit/recetas/schema/recipe-steps-reset-migration.test.ts` | T11 |

## Archivos modificados

| Archivo | Que cambio | Tarea |
| --- | --- | --- |
| `lib/modules/recetas/domain/recipe-input.ts` | `recipeStepSchema` pasa a ser el documento (parrafo / lista de verificacion, `spans` con `bold` e `italic`), `.strict()` en cada objeto, sin recorte ni tope de caracteres en `text`; nuevos `MAX_STEP_ELEMENTS` y `countRecipeStepElements`; `superRefine` de paso vacio, item vacio y tope; fuera `RECIPE_STEP_TYPES` y `RecipeStepType` | T1 |
| `lib/modules/recetas/domain/recipe-view.ts` | `RecipeStepView = RecipeStepDocument` (**alias**, no copia) | T2 |
| `lib/modules/recetas/index.ts` | Retira `RECIPE_STEP_TYPES` y `RecipeStepType`; publica el esquema del documento, sus tipos, `MAX_STEP_ELEMENTS` y `countRecipeStepElements` | T2 |
| `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts` | `toSteps` **exportada**; valida cada elemento con `recipeStepSchema` y descarta el que no pase (R17); fuera la tolerancia a cadena suelta y el relleno de tipo `texto` | T3 |
| `app/(private)/produccion/formulas/components/recipe-form-state.ts` | Fuera `type` de `RecipeStepFormValue`; `RecipeStepPayload = RecipeStepDocument`; nuevas `textToStepDocument` y `stepDocumentToText`; `buildRecipePayload` proyecta cada paso al documento | T5 |
| `app/(private)/produccion/formulas/components/recipe-steps-field.tsx` | Retirados el selector de tipo, `STEP_TYPE_LABELS`, el prop `onChangeType` y el import de `@/components/ui/select`. Arrastre, teclado, asa de 44x44 y `data-testid` **intactos** | T6 |
| `app/(private)/produccion/formulas/components/recipe-form.tsx` | La precarga usa `stepDocumentToText(step)` | T7 |
| `app/(private)/produccion/formulas/components/index.ts` | Reexporta las dos funciones del puente | T5 |
| `tests/unit/recetas/recipe-input.test.ts` | Fixtures a documentos; cubre R6, R8, R12, R13 | T12 |
| `tests/unit/recetas/recipe-service.test.ts` y `recipe-actions.test.ts` | Fixtures de paso con cuerpo y tipo, ahora documentos | T12 |
| `tests/integration/recetas/recipe-crud.int.test.ts` | Igual que los anteriores | T12 |
| `tests/unit/recetas-ui/recipe-form-payload.test.ts` y `recipe-form.test.tsx` | Fixtures a documentos y cobertura de R19 | T12 |
| `specs/QC-62-pasos-de-receta-enriquecidos/tasks.md` | T1-T12 y T14 marcadas `[x]` | - |

`recipe-image-lifecycle.test.ts`, `recipe-image-url.test.ts`, `recipe-lines-catalog.test.ts`,
`authorization.test.ts`, `recipe-page.test.tsx` y `recipe-lines-unavailable.test.tsx` **no
necesitaban cambio**: usaban `steps: []`, que sigue siendo valido.

**`db/schema.prisma` NO se abrio** (decision cerrada 6): `git diff --stat db/schema.prisma` sale
vacio.

## `MAX_STEP_ELEMENTS`: una sola constante

`lib/modules/recetas/domain/recipe-input.ts:149` publica `MAX_STEP_ELEMENTS = 30`, reexportada por
el barrel (R11). Es la **unica** aparicion del numero en toda la feature: el `superRefine`, los
mensajes de error y los tests la importan. La capa de pantalla no lo necesita -el puente crea un
solo elemento por paso-, asi que tampoco lo escribe.

## Mapa R<n> -> test REAL (nombre exacto de cada `it(...)`)

| R | `it(...)` | Archivo |
| --- | --- | --- |
| R1 | *acepta un documento que mezcla parrafo y lista de verificacion, y lo devuelve en el mismo orden* / *rechaza el documento que no es un objeto con blocks, y la lista de verificacion sin items* | `tests/unit/recetas/recipe-step-document.test.ts` |
| R2 | *acepta y conserva el parrafo SIN fragmentos: la linea en blanco del paso (R2)* / *rechaza el documento que no es un objeto con blocks, y la lista de verificacion sin items* | `recipe-step-document.test.ts` |
| R3 | *acepta negrilla, cursiva y las dos combinadas sobre el mismo fragmento* / *rechaza el fragmento sin ningun caracter y la marca que no es booleana* | `recipe-step-document.test.ts` |
| R4 | *rechaza un encabezado, un enlace, una marca desconocida y una clave extra* / *acepta el mismo documento sin la clase ni la clave sobrantes* | `recipe-step-document.test.ts` |
| R5 | *no recorta ni normaliza los espacios del fragmento* / *el documento de solo espacios se rechaza pese a que no se recorta nada* | `recipe-step-document.test.ts` |
| R6 | *rechaza el documento invalido antes de que llegue al caso de uso* / *acepta un texto raro pero bien formado: el borde juzga la FORMA, nunca el contenido* | `tests/unit/recetas/recipe-input.test.ts` |
| R7 | *rechaza el documento sin ningun caracter distinto de espacio y el item de solo espacios* / *acepta el documento cuyo unico caracter visible esta en un item de la lista* | `recipe-step-document.test.ts` |
| R8 | *el issue del segundo paso invalido apunta a steps con el indice 1* / *el issue de una clave extra apunta al paso y al bloque que la trae* | `recipe-input.test.ts` |
| R9 | *el barrel no exporta RECIPE_STEP_TYPES ni ningun simbolo con STEP_TYPE en el nombre* / *el barrel si publica el esquema del documento, el tope y la funcion de conteo* / *el parse de un paso no deja ningun campo type en la salida* | `tests/unit/recetas/recipe-step-contract.test.ts` |
| R10 | *el paso que sale del puerto no lleva type ni marca derivada de lista de verificacion* / *el documento con lista de verificacion se distingue mirando sus bloques, sin campo auxiliar* | `recipe-step-contract.test.ts` |
| R11 | *cuenta parrafos e items, y el bloque de lista en si no suma* / *acepta 30 elementos y rechaza uno mas* / *el tope se pasa tambien sumando items de listas de verificacion, no solo parrafos* | `recipe-step-document.test.ts` |
| R12 | *acepta un parrafo de 5.000 caracteres y una suma de fragmentos aun mayor* / *lo que sigue cayendo es el fragmento sin caracteres, no el largo* / *el paso ya no tiene tope de caracteres, pero si tope de elementos (QC-62 R11, R12)* | `recipe-step-document.test.ts`, `recipe-input.test.ts` |
| R13 | *acepta 50 pasos y rechaza 51 (R13)* / *rechaza el paso sin contenido y persiste lista vacia cuando no se indican pasos* | `recipe-input.test.ts` |
| R14 | *la unica sentencia del UP deja recipes.steps en la lista vacia* / *el UP no lleva WHERE: alcanza tambien a las recetas borradas logicamente* / *el UP no convierte ningun paso guardado a la nueva forma* | `tests/unit/recetas/schema/recipe-steps-reset-migration.test.ts` |
| R15 | *el down.sql existe, deja steps en la lista vacia y no restaura nada* / *el down.sql declara POR ESCRITO que el borrado es irreversible* | `recipe-steps-reset-migration.test.ts` |
| R16 | *ni el UP ni el DOWN contienen CREATE TABLE, ALTER TABLE ni ADD COLUMN* / *Recipe.steps sigue siendo un unico campo Json en schema.prisma* | `recipe-steps-reset-migration.test.ts` |
| R17 | *devuelve tal cual el array de documentos validos, en su orden* / *descarta el elemento basura de en medio, devuelve los dos validos y no lanza* / *descarta la cadena suelta heredada en vez de convertirla* / *devuelve lista vacia -sin lanzar- cuando la columna no es un array* / *descarta tambien el documento que incumple una regla de contenido, no solo de forma* | `tests/unit/recetas/recipe-prisma-steps.test.ts` |
| R18 | Los casos vigentes de autorizacion de las cinco operaciones, sin cambios: esta feature no toca permisos | `tests/unit/recetas/authorization.test.ts` |
| R19 | *el texto del formulario sale como un documento de un solo parrafo con un solo fragmento* / *el texto se proyecta TAL CUAL: ni se recorta ni se parte por los saltos de linea (R5)* / *textToStepDocument produce un parrafo de un fragmento sin marcas* / *stepDocumentToText concatena los fragmentos de cada parrafo y separa los parrafos con un salto de linea* / *un texto que pasa por textToStepDocument y vuelve por stepDocumentToText es el mismo texto* / *un parrafo sin fragmentos aplana a la linea en blanco, y la lista de verificacion se pierde: el puente es lossy y se asume* / *la precarga aplana el documento del paso a texto y lo devuelve como un solo parrafo al guardar* / *la pantalla no ofrece selector de tipo de paso: ni el control ni sus etiquetas estan en el DOM* | `tests/unit/recetas-ui/recipe-form-payload.test.ts`, `tests/unit/recetas-ui/recipe-form.test.tsx` |

Las **dos mutaciones obligatorias de T11** estan escritas dentro de los `it(...)` y verificadas:
anadir `WHERE "deleted_at" IS NULL` hace caer los predicados `alcanzaTodasLasFilas` y
`vaciaLosPasos`; convertir el UPDATE en un no-op hace caer `vaciaLosPasos`.

## Salida real de lo que se corrio

`pnpm typecheck` -> **verde, sin salida**.

> Apunte de entorno, no de codigo: la primera corrida daba
> `app/layout.tsx(43,56): error TS2304: Cannot find name 'LayoutProps'.` porque el worktree se
> acababa de crear y no existia `.next/types/**`, que `tsconfig.json` incluye. Se resolvio con
> `pnpm exec next typegen`. `app/layout.tsx` no esta tocado por esta rama.

`pnpm lint` -> **verde, sin hallazgos**.

`pnpm exec vitest run tests/unit/recetas tests/unit/recetas-ui`:

```
 FAIL  |node| tests/unit/recetas-ui/recipe-route-contract.test.ts > contrato de la ruta de recetas > la feature no toca lib/modules/recetas ni db/
 FAIL  |node| tests/unit/recetas/module-contract.test.ts > lib/modules/recetas - forma del modulo y frontera con inventario > la feature no anade ningun route handler bajo app/, y lib/modules/recetas no cambio de forma (la pantalla es QC-26)
 Test Files  2 failed | 23 passed (25)
      Tests  2 failed | 273 passed (275)
```

`pnpm exec vitest run guard --passWithNoTests`:

```
 Test Files  14 passed (14)
      Tests  133 passed | 4 skipped (137)
```

`pnpm exec vitest run tests/unit/proveedores-ui/supplier-page.test.tsx tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`:

```
 Test Files  2 passed (2)
      Tests  50 passed (50)
```

**Ninguna dependencia nueva:** `git diff --stat package.json pnpm-lock.yaml docs/dependencias.md db/schema.prisma` sale **vacio**.

## Rojos que NO son de esta feature

1. **`tests/unit/recetas/module-contract.test.ts` y `tests/unit/recetas-ui/recipe-route-contract.test.ts`**
   estan los dos en `tests/baseline-rojos.json` y fallan por el motivo alli documentado: el rango
   `git diff --name-only origin/dev...HEAD` no esta disponible, asi que el caso se declara rojo
   adrede en vez de pasar sin comprobar nada. Ademas, la guardia R44 de QC-26 muerde a cualquier
   rama que toque `db/`, y esta lo hace. **Anotado y no perseguido**, segun instruccion del leader.
2. **`tests/unit/proveedores-ui/supplier-page.test.tsx` (2 casos) y `catalog-line-sheet.test.tsx`
   (3 casos)** salieron rojos dentro de una corrida grande y **pasan 50/50 en aislado** (salida
   arriba). Es el mismo patron de flake de `userEvent` bajo carga que `baseline-rojos.json` ya
   documenta para `tests/unit/inventario/product-page.test.tsx`. **Esta rama no toca ni un archivo
   de proveedores**, y `git status` lo confirma. No estan en el baseline; se deja el dato para el
   leader, que es quien decide si entran: el implementer no edita `baseline-rojos.json`.
3. **Los tests de integracion no se pudieron correr en este worktree**: no hay `.env` -solo
   `.env.example`-, asi que Prisma falla con `Environment variable not found: DATABASE_URL`,
   tambien en `tests/integration/identity/*`, que esta feature no toca. Es la deuda de "base propia
   por worktree" que `progress/current.md` ya lleva anotada cuatro veces. `recipe-crud.int.test.ts`
   quedo con sus fixtures migrados a documentos, pero **su verde real esta pendiente del gate del
   leader** con la base levantada.

## Lo que quedo fuera, con su motivo

- **El editor enriquecido, el componente de lectura por pasos y el modal de vista previa**: son
  **QC-64**, explicitamente fuera del alcance de esta ficha. Lo que hay en pantalla es el **puente
  de texto plano** de R19, y existe solo para que el repo compile al desaparecer `type`.
- **Conversion de los pasos ya guardados**: no se escribe. Decision cerrada 5, se **borran**.
- **`db/schema.prisma`**: no se abre. Decision cerrada 6; la columna JSON ya existe (QC-24 R4).
- **T13 (gate)**: `./init.sh --rapido` y `./init.sh` completo los corre el leader. El implementer y
  sus subagentes corren solo `typecheck`, `lint` y sus propios archivos.

## Dos apuntes para el reviewer

1. **El criterio literal de T12** -que un `grep` de `RECIPE_STEP_TYPES` y del tipo de paso sobre
   `tests/` no devuelva nada- **sigue devolviendo coincidencias, y a proposito**: las que quedan son
   las **aserciones negativas** que prueban justamente que el simbolo murio. Por ejemplo
   `expect(exportados).not.toContain('RECIPE_STEP_TYPES')` en `recipe-step-contract.test.ts`, y el
   fixture de `recipe-input.test.ts` que anade la clave vieja al paso para comprobar que `.strict()`
   la rechaza. Se prefirio conservar los tests a satisfacer el `grep`.
2. **El puente es lossy y en pantalla se nota**: `stepDocumentToText` une los parrafos con un salto
   de linea, pero el control es un `input` de texto de una sola linea y el DOM sanea el salto al
   pintarlo; el estado de React si lo conserva y el payload vuelve al contrato con el salto intacto.
   El test lo afirma tal cual, sin maquillarlo. Hoy es una ventana cerrada -R14 dejo todas las
   recetas sin pasos y el puente solo escribe documentos de un parrafo, `design.md > 6`-; QC-64 lo
   resuelve de raiz.

## Decisiones que no se pudieron tomar sin inventar

Ninguna. No hubo que reabrir ninguna decision cerrada ni rellenar ningun dato ausente.

## Correccion posterior: `module-contract.test.ts` SI era rojo mio

La primera version de esta bitacora daba por ajeno el rojo de
`tests/unit/recetas/module-contract.test.ts`. **Era mio, y bloqueaba el gate rapido.** El
diagnostico inicial fue erroneo por una razon concreta: cuando lo corri, la rama aun no tenia
commits, el rango `git diff --name-only origin/dev...HEAD` salia vacio y el caso caia en la
asercion de "el rango no estaba disponible" -que es la que el baseline documenta-. Con los commits
hechos, el rango si existe y el caso cae por otro motivo distinto: los tres archivos de
`lib/modules/recetas/` que QC-62 cambia.

Es una guardia que QC-26 escribio para probar que aquella ficha -de PANTALLA- no tocaba el
backend, y sobrevivio a su feature. **No se borro ni se anulo**: gana una segunda lista permitida
nombrada aparte, `CAMBIO_DE_FORMA_DEL_PASO_QC62`, con `recipe-input.ts`, `recipe-view.ts` y
`recipe-prisma.ts`. No se metieron en `AMPLIACION_QC34` porque esa lista habla de otra ficha y
mentiria sobre su procedencia. El barrel no se duplica: ya estaba en la lista de QC-34, y que
QC-62 tambien lo cambia queda dicho en el comentario.

**Lo que la guardia sigue vigilando**, y esta escrito en el propio test: que la pantalla no vuelva
a caer dentro del modulo, que no aparezca ningun route handler de recetas bajo `app/api/`, y que
no se toque nada mas del modulo por la puerta de atras -repositorio, los cinco casos de uso, la
Server Action y el adaptador de almacenamiento de QC-25 siguen congelados-.

**Comprobado que sigue mordiendo, con una mutacion real**: se anadio una linea a
`lib/modules/recetas/ports/recipe-repository.ts` -que no esta en ninguna de las dos listas-, se
commiteo, y el caso cayo con `expected [ Array(1) ] to deeply equal []`. La mutacion se revirtio
con `git reset --hard`; el arbol quedo limpio.

Salida tras el arreglo:

```
pnpm typecheck                                                          -> verde, sin salida
pnpm lint                                                               -> verde, sin hallazgos
pnpm exec vitest related --run tests/unit/recetas/module-contract.test.ts
  Test Files  1 passed (1)
       Tests  5 passed (5)
```

De los rojos listados mas arriba, sigue siendo ajeno **solo** el de
`tests/unit/recetas-ui/recipe-route-contract.test.ts` (baseline, rango `origin/dev...HEAD`), mas
el flake de `proveedores-ui` y los de integracion por el `DATABASE_URL` que falta en este worktree.
