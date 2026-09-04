# QC-62 — pasos-de-receta-enriquecidos · review

> Revisor: `reviewer`. Fecha: 2026-09-04. Rama `feature/QC-62-pasos-de-receta-enriquecidos`,
> worktree `.worktrees/QC-62-pasos-de-receta-enriquecidos`.
> HEAD revisado: `4f57366`. **La rama avanzo durante la revision**: el implementer renombro la
> migracion a mitad de mi corrida, asi que todo lo de abajo esta verificado sobre `4f57366`.
>
> Contrastado contra `specs/QC-62-.../{requirements,design,tasks}.md`,
> `progress/impl_QC-62-....md`, `docs/architecture.md`, `docs/conventions.md`,
> `docs/dependencias.md`, `docs/verification.md` y `CHECKPOINTS.md`.
> No se edito ni una linea de codigo de la feature.

## Veredicto

**OK** — 0 bloqueantes, 7 menores. Ninguno de los menores incumple un requisito ni una decision
cerrada. El unico que impide firmar hoy el checkpoint «./init.sh en verde» es deuda ajena ya
diagnosticada (menor 4), y su cierre es del leader, no del implementer.

## Checklist

### Especificacion
- [x] `requirements.md` con R1–R19 EARS numerados, Alcance, «Lo que NO entra» y 9 decisiones cerradas.
- [x] `design.md` con cuatro alternativas descartadas y su porque (8.1–8.4).
- [~] `tasks.md`: T1–T12 y T14 en `[x]`; **T13 (gate) sigue en `[ ]`** — ver menor 1.

### Trazabilidad (lo que mas pesaba)
- [x] **Los 19 requisitos mapean a un test que existe y que prueba lo que dice.** Verificado uno
      a uno abriendo cada `it(...)`, no leyendo la tabla del implementer.
  - R1, R2, R3, R5, R7, R11, R12 -> `tests/unit/recetas/recipe-step-document.test.ts`. Cada uno
    con caso positivo Y negativo reales: R1 compara `toEqual` sobre el documento completo y
    ademas el vector de `kind`; R2 afirma que el parrafo sin `spans` sobrevive Y que el
    `checklist` sin items cae; R11 usa `MAX_STEP_ELEMENTS` importado y comprueba que el tope se
    cruza tambien sumando items, no solo parrafos.
  - R4 -> mismo archivo, l.109-142: `heading`, `link`, marca desconocida, clave extra en el
    bloque, en el documento y en el item. Es el test que de verdad ejercita `.strict()`.
  - R6, R8, R13 -> `tests/unit/recetas/recipe-input.test.ts`. R8 afirma sobre
    `issue.path.slice(0,2)` igual a `['steps', 1]` y ademas que **no** aparecen los indices 0 y 2:
    identifica la posicion, no solo «hay un error».
  - R9, R10 -> `tests/unit/recetas/recipe-step-contract.test.ts`. R9 en runtime sobre
    `Object.keys(barrel)`; R10 sobre la salida real de `toSteps`, con
    `expect(Object.keys(paso)).toEqual(['blocks'])`, que es lo que cierra «ningun dato derivado».
  - R14, R15, R16 -> `tests/unit/recetas/schema/recipe-steps-reset-migration.test.ts`. Predicados
    aplicados al SQL real Y a versiones mutadas en memoria; las dos mutaciones obligatorias de
    T11 (anadir `WHERE deleted_at IS NULL` y convertir el UPDATE en no-op) estan escritas y hacen
    caer el predicado.
  - R17 -> `tests/unit/recetas/recipe-prisma-steps.test.ts`, incluido el caso «basura en medio»
    devolviendo los dos validos, la cadena suelta heredada y el valor no-array sin lanzar.
  - R18 -> `tests/unit/recetas/authorization.test.ts` (sin cambios; sigue afirmando el rechazo de
    Operador y de actor invalido en los cinco casos de uso, y el actor por parametro).
  - R19 -> `tests/unit/recetas-ui/recipe-form-payload.test.ts` (ida, vuelta, ida-y-vuelta y el
    caso lossy) y `recipe-form.test.tsx` (precarga real montando el formulario, y ausencia del
    selector de tipo por `data-testid`, por `role=combobox` y por texto).
- [x] `progress/impl_QC-62-....md` contiene el mapa `R<n> -> test` con el nombre exacto de cada `it`.

### Las 9 decisiones cerradas, al pie de la letra
- [x] **1 - estructura cerrada.** `z.discriminatedUnion('kind', [paragraph, checklist])`, `spans`
      con `bold`/`italic` booleanos opcionales. Nada mas se puede representar.
- [x] **2 - `type` desaparece de verdad.** El grep de `RECIPE_STEP_TYPES|RecipeStepType` sobre
      `app/`, `lib/` y `tests/` deja 5 coincidencias, todas comentarios o aserciones NEGATIVAS.
      No queda escondido ni derivado: `RecipeStepView = RecipeStepDocument` (alias, no copia) y
      `toSteps` ya no rellena nada. Ningun campo tipo `hasChecklist` en la salida.
- [x] **3 - sin tope de caracteres, tope por elementos.** No hay ni un `.max()` sobre `text`.
- [x] **4 - paso vacio se rechaza.** `superRefine` sobre el documento entero mas `superRefine` de item.
- [x] **5 - se BORRAN, irreversible.** `db/migrations/20260904181500_recipe_steps_reset/`:
      UP `UPDATE "recipes" SET "steps" = '[]'::jsonb;` sin `WHERE`; `down.sql` existe, hace lo
      mismo y **declara por escrito** la irreversibilidad. Cero conversion: el UP no contiene
      `jsonb_build_object`, `jsonb_agg`, `->>` ni `body` (afirmado en el test).
- [x] **6 - nada de esquema.** `git diff origin/dev...HEAD --stat db/schema.prisma` sale **vacio**.
      Confirmado ademas por test (`Recipe.steps` sigue siendo `Json`, no hay `model RecipeStep`).
- [x] **7 - permisos sin cambios.** Ni `authorization.ts`, ni los casos de uso, ni la Server
      Action aparecen en el diff.
- [x] **8 - valida el borde.** Todo en `domain/recipe-input.ts` con zod.
- [x] **9 - tope = 30, UNA sola constante publicada por el contrato.**
      `lib/modules/recetas/domain/recipe-input.ts:149` `export const MAX_STEP_ELEMENTS = 30`,
      reexportada por `lib/modules/recetas/index.ts:32`. El grep del numero sobre
      `lib/modules/recetas` y `app/(private)/produccion/formulas` devuelve **solo** esa linea y su
      comentario: no esta escrito a mano en ninguna otra capa. El `superRefine`, el mensaje de
      error y los tests la importan.

### `.strict()` (el fallo que solo cae si lo buscas)
- [x] Los **cinco** objetos del esquema lo llevan: `recipeStepSpanSchema` (l.85),
      `recipeStepChecklistItemSchema` (l.102), el miembro `paragraph` (l.130), el miembro
      `checklist` (l.136) y el documento `recipeStepSchema` (l.182). Comprobado ademas
      ejecutando: `recipe-step-document.test.ts` rechaza clave extra en los tres niveles, y
      `recipe-input.test.ts:146` rechaza el `type: 'texto'` legacy justamente por `.strict()`.

### Alcance: no se desbordo hacia QC-64
- [x] El diff de `app/` es **solo resta**: se retiran el `<Select>` de tipo, `STEP_TYPE_LABELS`,
      el prop `onChangeType` y el import de `@/components/ui/select`. No hay editor enriquecido,
      ni botones de negrilla/cursiva, ni componente de lectura, ni modal de vista previa, ni
      ningun archivo nuevo de pantalla.
- [x] El puente son dos funciones **puras** en `recipe-form-state.ts` (`textToStepDocument`,
      `stepDocumentToText`), reexportadas por el barrel de componentes. Es exactamente lo que
      `design.md > 6` autoriza. La pantalla NO queda peor de lo que ese design admite (ver
      menor 6 para el unico matiz que el design no habia anticipado).
- [x] Arrastre, equivalente por teclado, asa `min-h-11 min-w-11` y `text-base` en el input
      intactos: `docs/architecture.md > Regla multiplataforma` se sigue cumpliendo. Sin `100vh`,
      sin `:hover` como unica via, sin target menor de 44x44 px, sin `font-size` bajo 16px en
      inputs, sin libreria de UI nueva.

### La guardia `tests/unit/recetas/module-contract.test.ts`
- [x] **No se neutralizo.** La segunda lista `CAMBIO_DE_FORMA_DEL_PASO_QC62` tiene exactamente
      tres rutas nombradas una a una, con su porque; el filtro sigue siendo
      `!AMPLIACIONES_APROBADAS.includes(ruta)` sobre **todo** `lib/modules/recetas/`, asi que un
      septimo archivo lo pone rojo. No se metieron en `AMPLIACION_QC34` (habrian mentido sobre su
      procedencia) y el barrel no se duplico.
- [x] **Sigue cayendo con un route handler bajo `app/api/`**: mutacion real ejecutada por mi
      (`mkdir app/api/recipes`) -> `AssertionError: app/api/recipes no debe existir: expected true
      to be false`. Directorio borrado despues; `git status` limpio.
- [x] **Sigue cayendo si la pantalla vuelve al modulo**: la asercion `fueraDeSuCarpeta` sobre
      `app/` sigue en pie y la lista blanca del modulo no admite ningun archivo de UI.
- [x] La asercion «el rango origin/dev...HEAD no estaba disponible» sigue presente: el caso no
      puede terminar verde sin haber mirado nada.

### Dependencias
- [x] `git diff origin/dev...HEAD --stat package.json pnpm-lock.yaml` sale **vacio**. Ninguna
      dependencia nueva, asi que `docs/dependencias.md` no necesita fila. `design.md > 7`
      documenta ademas por que se descarta proponer `prosemirror-model`/TipTap en el dominio, en
      linea con `docs/architecture.md > Dependencias de terceros`.

### Calidad, seguridad y capas
- [x] `pnpm typecheck` -> verde, sin salida. `pnpm lint` -> verde, sin hallazgos. (Corridos por mi.)
- [x] `pnpm exec vitest run tests/unit/recetas tests/unit/recetas-ui` -> 274 pasan, 1 rojo, el de
      `recipe-route-contract.test.ts` (baseline; ver menor 2).
- [x] Sin tabla nueva -> no aplica RLS ni columna de empresa. Sin webhook. Sin secreto. Sin
      hardcode de contexto (el unico numero de la feature vive en la constante del contrato).
- [x] Capas separadas: `domain/` solo importa `zod`; el adaptador de Prisma importa el esquema del
      dominio por ruta interna del propio modulo; la pantalla consume el barrel por
      `@/lib/modules/recetas`, nunca ruta profunda; el barrel no arrastra servidor.
- [x] La migracion tiene su `down.sql` y su carpeta cumple `<14 digitos>_<nombre>`, que es lo que
      `scripts/db-rollback.ts` exige para poder revertirla.

## Hallazgos

### Mayores (bloqueantes)

**Ninguno.**

### Menores

1. **`menor` - `specs/QC-62-pasos-de-receta-enriquecidos/tasks.md:125` - T13 (gate) sigue sin
   marcar `[x]`.** `CHECKPOINTS.md > Especificacion` pide todas las tasks en `[x]`. Es la tarea
   que por proceso corre el leader (`AGENTS.md`), no el implementer, asi que no es defecto de
   implementacion: queda pendiente de que el leader la cierre junto con el gate. Se anota para
   que no se pase.

2. **`menor` - `tests/unit/recetas-ui/recipe-route-contract.test.ts:555` - la guardia gemela se
   quedo sin actualizar y ahora falla por un motivo NUEVO.** El implementer actualizo la lista
   permitida de `tests/unit/recetas/module-contract.test.ts` pero no la de su gemela, que tiene
   el mismo tipo de asercion sobre el diff de rama. En esta rama ya no falla por el motivo
   estructural que documenta `tests/baseline-rojos.json` (rango vacio), sino por contenido real:
   `["lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts",
   "lib/modules/recetas/domain/recipe-input.ts", "lib/modules/recetas/domain/recipe-view.ts"]`, y
   detras espera la asercion `tocaDb` (l.560), que tambien mordera por la migracion nueva.
   No es violacion de alcance -esos tres archivos los aprobo el humano en F1.4- sino una lista
   blanca desincronizada: **las dos guardias gemelas ahora discrepan sobre lo que QC-62 puede
   tocar**. El baseline tapa el rojo, asi que el gate no lo dice; el propio baseline avisa de que
   «si se toca la pantalla de recetas hay que correrlo a mano en la rama», y esta feature la toco.
   No bloqueante (el rojo estaba pactado y el archivo entero esta exento), pero el leader deberia
   decidir: o replicar alli las dos listas de QC-62, o corregir la nota del baseline para que no
   siga afirmando un motivo que ya no es el real.

3. **`menor` - `specs/QC-62-pasos-de-receta-enriquecidos/tasks.md:120` - el criterio de «hecho»
   de T12 no se cumple literalmente.** El grep que T12 exige devuelve 5 coincidencias. Las revise
   una a una: `module-contract.test.ts:366` y `recipe-step-contract.test.ts:6` son comentarios;
   `recipe-step-contract.test.ts:32,34` es la asercion negativa que prueba que el simbolo murio;
   `recipe-input.test.ts:146` es el fixture que mete la clave vieja para comprobar que
   `.strict()` la rechaza. **El criterio estaba mal escrito, el codigo esta bien**: satisfacer ese
   grep habria exigido borrar los tests que mas vigilan la decision cerrada 2. El implementer lo
   dejo razonado en su bitacora. Se acepta; se anota para que nadie «arregle» el grep despues.

4. **`menor` - `./init.sh` completo termina en ROJO, y no por esta feature.** Corrido por mi con
   el entorno exportado: `Test Files 10 failed | 174 passed`, `Tests 79 failed | 2019 passed`. El
   comparador reporta **9 archivos de integracion en rojo fuera del baseline**: los tres de
   `inventario`, `pedidos/pedidos-constraints`, `proveedores/catalog-line`,
   `unidades/unidades-constraints` y los tres de `recetas`. **Todos** caen con el mismo
   `PrismaClientKnownRequestError: Null constraint violation on the fields: (name_normalized)` en
   `db.product.create()`. Verificado que es ajeno: (a) el leader lo reprodujo identico sobre `dev`
   para los dos de recetas; (b) `prisma migrate status` muestra que la base compartida tiene
   aplicada `20260904160000_list_query_indexes`, que **no existe ni en esta rama ni en
   `origin/dev`**; (c) corri `recipe-crud.int.test.ts` en aislado y sus 3 rojos son todos
   `PrismaClientKnownRequestError`, ninguno de forma del paso -los otros 6 casos, con las fixtures
   ya migradas a documentos, pasan-. Es drift de la base compartida, la quinta vez que aparece
   segun la bitacora. **No es defecto de QC-62**, pero mientras siga asi no se puede firmar
   `CHECKPOINTS.md > Verificacion final > ./init.sh en verde`: antes de la PR el leader tiene que
   arreglar la base o anadir los 9 archivos a `tests/baseline-rojos.json` con motivo y fecha, y
   decirlo en la PR.

5. **`menor` - la migracion de borrado nunca se ha ejecutado.** `prisma migrate status` la lista
   como `have not yet been applied`. Es coherente con el plan (T11 la verifica de forma estatica
   y `design.md > 4` lo asume), y no la aplique yo a proposito porque **borra datos de forma
   irreversible** en una base compartida por varios worktrees. Lo dejo dicho para que quede claro
   que R14/R15 estan probados por el contrato del SQL, no por ejecucion: el dia que corra
   `migrate deploy` sera la primera vez que ese `UPDATE` toca datos.
   Nota positiva relacionada: el implementer detecto y corrigio en `4f57366` una **colision de
   marca de tiempo** con la migracion foranea (`20260904160000` repetido) renombrando a
   `20260904181500_recipe_steps_reset` con `git mv` y actualizando la unica referencia literal del
   test. Comprobado: la carpeta y `migrationDir` (l.36) coinciden y los 7 casos pasan.

6. **`menor` - el puente hace que lo que el usuario VE no sea lo que se GUARDA, y `design.md` no
   lo habia anticipado.** `app/(private)/produccion/formulas/components/recipe-form-state.ts`
   (`stepDocumentToText`) une los parrafos con un salto de linea, pero el control es un `<Input>`
   de una sola linea: el DOM sanea el salto al pintarlo mientras el estado de React lo conserva,
   asi que el payload vuelve al contrato con el salto intacto. El test lo afirma tal cual, sin
   maquillarlo (`recipe-form.test.tsx`, «la precarga aplana el documento del paso a texto...»:
   valor pintado `Mezclardespacio` frente a payload con el salto). `design.md > 6` preveia que el
   puente fuera lossy, **no** esta divergencia entre lo mostrado y lo enviado. Hoy es una ventana
   cerrada de verdad -R14 deja todas las recetas sin pasos y el puente es el unico escritor, y
   solo produce documentos de un parrafo-, asi que no bloquea. Si QC-64 se retrasara, deja de
   serlo: entonces habria que cerrar el hueco antes.

7. **`menor` - nada pinta el error de un paso invalido en pantalla.** Con el esquema viejo el
   `issue.path` de un paso vacio era `['steps', i, 'body']`; ahora es
   `['steps', i, 'blocks', 0, 'spans', 0, 'text']`. `extractStepErrors`
   (`recipe-form-state.ts:226`) sigue funcionando porque solo mira `path[0]` y `path[1]` -lo
   verifique leyendolo-, pero **ningun test cubre `extractStepErrors` ni el
   `data-testid="recipe-step-field-error-N"`**: el grep sobre `tests/` no devuelve nada. La laguna
   es anterior a esta feature, pero la forma del `path` cambio aqui, asi que ahora es un cambio
   sin red. No cuenta como bloqueante porque ningun requisito de QC-62 lo exige; candidato claro
   para QC-64.

## Nota sobre lo que NO he perseguido

Por instruccion del leader, y verificado por mi que el sintoma coincide:
`tests/integration/recetas/recipe-lines.int.test.ts` y `recipe-crud.int.test.ts`
(`name_normalized`), el flake de `userEvent` de `tests/unit/proveedores-ui/*`, y el rojo de
baseline de `recipe-route-contract.test.ts` **como rojo estructural**. Lo que si reporto es que en
esta rama ese ultimo archivo cae por un motivo distinto del documentado (menor 2): eso es
informacion nueva, no el rojo ya diagnosticado.
