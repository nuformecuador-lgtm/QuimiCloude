# QC-62 — pasos-de-receta-enriquecidos · design.md

> Cómo se implementa lo que dice `requirements.md`. Las **decisiones cerradas** de ese archivo son
> entrada, no materia opinable aquí. Lo que este archivo sí decide: la forma exacta del documento,
> dónde vive cada pieza, cómo se ejecuta el borrado, qué queda roto al desaparecer `type` y con qué
> mínimo se cierra, y el número del tope (propuesta a aprobar en F1.4).

## 1. Alcance técnico en una frase

Se reescribe `recipeStepSchema` en `lib/modules/recetas/domain/recipe-input.ts` —de
`{ body: string; type: 'texto' | 'checklist' }` a un **documento de estructura cerrada**—, se
alinea `RecipeStepView`, el barrel y el adaptador de Prisma, se borra el contenido de la columna
`recipes.steps` con una migración de datos, y se deja la pantalla de fórmulas en un **puente de
texto plano** hasta QC-64. **No se abre `db/schema.prisma`.**

## 2. Forma del documento del paso

Un paso es un **documento**: una lista ordenada de bloques. Nada de envoltorio con metadatos —no
hay versión, ni id, ni tipo—, porque nadie los necesita todavía y un campo que nadie lee es un
campo que acaba mintiendo (mismo criterio que la decisión cerrada 2 sobre `type`).

```ts
// lib/modules/recetas/domain/recipe-input.ts (forma; el esquema zod es la fuente)
type RecipeStepSpan = {
  readonly text: string;          // >= 1 carácter (R3); NO se recorta (R5)
  readonly bold?: boolean;        // marca de negrilla (R3)
  readonly italic?: boolean;      // marca de cursiva  (R3)
};

type RecipeStepBlock =
  | { readonly kind: 'paragraph'; readonly spans: readonly RecipeStepSpan[] }   // spans puede ir vacío: línea en blanco (R2)
  | { readonly kind: 'checklist'; readonly items: readonly RecipeStepChecklistItem[] };

type RecipeStepChecklistItem = { readonly spans: readonly RecipeStepSpan[] };   // >= 1 span con texto no blanco (R7)

type RecipeStepDocument = { readonly blocks: readonly RecipeStepBlock[] };
```

Notas que no son decorativas:

- **`kind` es un discriminante de BLOQUE, no el `type` que desaparece.** El `type` de la decisión
  cerrada 2 clasificaba el paso entero y era derivable de su contenido; `kind` clasifica **un
  bloque** y no es derivable de nada: sin él, un objeto con `spans` y otro con `items` sólo se
  distinguen por adivinación de campos. R9 prohíbe el primero, no el segundo.
- **Las marcas son booleanos opcionales, no una lista de marcas.** `{ bold: true, italic: true }`
  se combina sin ambigüedad y añadir una marca nueva sería un campo nuevo — que hoy R4 rechaza. Un
  `marks: string[]` admitiría duplicados y orden, dos formas de escribir lo mismo.
- **`.strict()` en cada objeto del esquema.** Por defecto zod **descarta** las claves desconocidas
  en silencio; R4 exige rechazarlas. Sin `.strict()` un documento con `href` o `level` pasaría el
  borde recortado y nadie se enteraría.
- **Un `checklist` sin ítems se rechaza**; un `paragraph` sin `spans` se acepta (R2: es la línea en
  blanco). La asimetría es intencional: una lista de verificación vacía no representa nada.
- **`RecipeStepView` pasa a ser el mismo documento** (`domain/recipe-view.ts` deja de importar
  `RecipeStepType`). Entrada y salida comparten forma porque el paso no tiene ningún campo que
  nazca en el servidor —ni id, ni orden derivado (R16)—. Se declara como alias del tipo del
  documento, no como una copia: dos definiciones que hay que mantener sincronizadas a mano se
  desincronizan.
- **`stepCount` de `RecipeSummary` no cambia**: sigue contando pasos, no elementos.

### Qué NO se puede representar, dicho antes de que sorprenda

Negrilla/cursiva **anidando bloques** (una lista dentro de un ítem), listas numeradas, encabezados
y enlaces. Es exactamente lo que la decisión cerrada 1 excluye; se escribe aquí para que QC-64 no
lo descubra montando el editor.

## 3. Reglas de validación y dónde vive cada una (R6, R7, R11, R12, R13)

Todo en `domain/recipe-input.ts`, con zod, y por tanto en el borde (R38 de QC-25):

| Regla | Cómo | Requisito |
| --- | --- | --- |
| Forma cerrada del documento | `z.discriminatedUnion('kind', …)` + `.strict()` en cada objeto | R1–R4 |
| Texto tal cual | `z.string().min(1)`, **sin `.trim()`** | R3, R5 |
| Paso no vacío | `.superRefine` sobre el documento: al menos un carácter no blanco en todo el documento | R7 |
| Ítem no vacío | `.superRefine` sobre el ítem: al menos un carácter no blanco | R7 |
| Tope de elementos | `.superRefine` sobre el documento: `párrafos + ítems <= MAX_STEP_ELEMENTS` | R11 |
| Sin tope de caracteres | ausencia deliberada de `.max()` en `text` | R12 |
| 50 pasos | `z.array(recipeStepSchema).max(50).default([])`, sin cambios | R13 |
| Posición del paso que falla | la da zod sola: `issue.path === ['steps', <índice>, …]` | R8 |

**El conteo de elementos es `nº de párrafos + nº de ítems`**; el bloque `checklist` en sí no suma
(es el envoltorio de sus ítems). Es literalmente lo que dice la decisión cerrada 3 —«párrafos e
ítems»—, y se implementa en **una función pura exportada** (`countRecipeStepElements`) para que el
test cuente igual que el esquema en vez de replicar la aritmética.

`MAX_STEP_ELEMENTS` se exporta desde el barrel (R11): la pantalla de QC-64 necesitará el número
para avisar antes de enviar, y la única forma de que no se duplique es que exista una sola
constante.

### El número del tope: propuesta, no decisión (pregunta abierta 1)

**Propuesta: `MAX_STEP_ELEMENTS = 30`.** Razón:

- El techo que se retira eran 1.000 caracteres por paso. Treinta elementos es holgadamente más
  contenido del que hoy cabía, así que nadie pierde capacidad con el cambio.
- El caso real más largo que se puede anticipar en una fórmula química es una lista de
  verificación de reactivos o de EPP; ~25 ítems cubre eso con margen, y 30 lo deja con aire.
- Con el tope de 50 pasos vigente (R13), el techo por receta queda en 1.500 elementos: acota el
  tamaño del JSON y del render de QC-64 sin que nadie choque contra él en uso normal.
- **La asimetría manda**: subir el tope después es cambiar un número (sólo relaja validación, no
  toca datos); bajarlo después deja recetas ya guardadas que su propio esquema rechaza al
  reeditarlas. Ante la duda, un número que no se roce.

**Riesgo que esto deja abierto y que el humano debe ver al aprobar:** sin tope de caracteres
(decisión cerrada 3), 30 elementos pueden ser un JSON arbitrariamente grande. El único freno real
hoy es el límite de cuerpo de las Server Actions de Next —el valor por defecto, porque
`next.config.ts` **no** configura `serverActions.bodySizeLimit`—, y ese freno da un error genérico,
no un mensaje de validación. Se acepta por ahora porque el escenario es un usuario Administrador
pegando texto, no una entrada pública; si algún día molesta, la salida es un tope de caracteres del
documento completo, que es una decisión de producto y **no se toma aquí**.

## 4. Persistencia y borrado de los pasos existentes (R14, R15, R16)

**Esquema: sin cambios.** `recipes.steps JSONB NOT NULL DEFAULT '[]'` ya existe
(`db/migrations/20260902163256_recipes_and_recipe_lines/migration.sql`, línea 33) y sigue igual.
`db/schema.prisma` no se abre.

**El borrado va en una migración, no en un script.** Una migración queda registrada en
`_prisma_migrations`, corre exactamente una vez por entorno y viaja con el despliegue; un script
suelto depende de que alguien se acuerde de ejecutarlo en producción, y este borrado tiene que
ocurrir **sí o sí** antes de que la aplicación nueva lea la columna. Como no hay drift de esquema,
`pnpm run db:migrate:create` responderá «no changes»: la carpeta se crea **a mano** con la misma
convención de siempre (`db/migrations/<timestamp>_recipe_steps_reset/`) y `prisma migrate deploy`
la aplica igual — Prisma aplica lo que hay en la carpeta, no exige haberlo generado él.

```sql
-- migration.sql (UP)
-- QC-62 R14: los pasos guardados NO se convierten, se BORRAN (decisión cerrada 5).
-- Sin WHERE deleted_at IS NULL: alcanza también a las recetas borradas lógicamente.
UPDATE "recipes" SET "steps" = '[]'::jsonb;
```

```sql
-- down.sql (DOWN)
-- QC-62 R15: IRREVERSIBLE por decisión del humano (decisión cerrada 5). No hay copia de los
-- pasos anteriores en ninguna parte, así que aquí no hay nada que restaurar. Se deja el estado
-- consistente con el UP en vez de fingir una vuelta atrás.
UPDATE "recipes" SET "steps" = '[]'::jsonb;
```

El `down.sql` **existe** —es obligatorio por `docs/architecture.md > Migraciones up/down` y por
`CHECKPOINTS.md`— y es honesto: dice por qué no restaura. Consecuencia que se acepta y se comunica:
**las recetas existentes quedan sin pasos, para siempre**.

**Lectura (`recipe-prisma.ts > toSteps`).** Se reescribe: hoy tolera pasos guardados como cadena
suelta y rellena `type: 'texto'`; esa tolerancia **se elimina** —lo que toleraba ya no existe tras
el UPDATE—. En su lugar valida cada elemento del array con el esquema del dominio y **descarta el
que no pase** (R17), devolviendo los demás. Se descarta en vez de fallar la lectura porque una fila
escrita a mano en la consola no debe tumbar la pantalla de recetas de todo el mundo; el adaptador
puede importar `zod` y `../../domain` sin romper la regla de dependencias.

**Escritura:** sin cambios estructurales. `steps` sigue viajando por el puerto como
`readonly RecipeStepView[]` y el adaptador lo escribe tal cual en la columna.

## 5. Contrato público (`lib/modules/recetas/index.ts`)

Se retira:

```ts
export { RECIPE_STEP_TYPES, type RecipeStepType, … } from './domain/recipe-input';
```

Se publica en su lugar: `recipeStepSchema` (nueva forma), `type RecipeStepInput`,
`type RecipeStepDocument`, `type RecipeStepBlock`, `type RecipeStepSpan`,
`type RecipeStepChecklistItem`, `MAX_STEP_ELEMENTS`, `countRecipeStepElements`, y
`type RecipeStepView` desde `./domain/recipe-view`. Todo son tipos, un esquema zod, una constante y
una función pura: el barrel no gana nada de servidor (sigue importable desde cliente).

`createRecipeSchema` / `updateRecipeSchema` **no cambian de nombre ni de resto de campos**: sólo
cambia lo que hay dentro de `steps`.

## 6. Qué queda roto al desaparecer `type`, y con qué mínimo se cierra

Inventario completo, verificado por `grep` sobre el worktree. Sin el punto 4 de esta tabla el repo
**no compila**, así que arreglarlo es alcance de esta ficha aunque la pantalla bonita sea QC-64.

| # | Archivo | Qué rompe | Mínimo que se hace aquí |
| --- | --- | --- | --- |
| 1 | `lib/modules/recetas/domain/recipe-input.ts` | `RECIPE_STEP_TYPES`, `RecipeStepType`, `recipeStepSchema` | Se reescriben (sección 2 y 3) |
| 2 | `lib/modules/recetas/domain/recipe-view.ts` | `RecipeStepView` importa `RecipeStepType` | Pasa a ser el documento |
| 3 | `lib/modules/recetas/index.ts` | Reexporta los símbolos que mueren | Sección 5 |
| 4 | `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts` | `toSteps` construye `{ body, type }` | Sección 4 (lectura) |
| 5 | `lib/modules/recetas/adapters/driving/recipe-actions.ts` | **Nada**: sólo maneja `RecipeDetail`/`CreateRecipeInput` como tipos opacos | Sin cambios (se verifica con typecheck) |
| 6 | `app/(private)/produccion/formulas/components/recipe-form-state.ts` | `RecipeStepFormValue.type`, `RecipeStepPayload.type`, `buildRecipePayload` | Puente (abajo) |
| 7 | `app/(private)/produccion/formulas/components/recipe-steps-field.tsx` | `RECIPE_STEP_TYPES`, `STEP_TYPE_LABELS`, el `<Select>` de tipo | Se retira el selector |
| 8 | `app/(private)/produccion/formulas/components/recipe-form.tsx` | precarga `text: step.body, type: step.type` | Puente (abajo) |
| 9 | `tests/unit/recetas/recipe-input.test.ts` | 21 aserciones sobre `body`/`type`/1.000 caracteres | Se reescriben (T4) |
| 10 | `tests/unit/recetas-ui/recipe-form.test.tsx`, `recipe-form-payload.test.ts` | esperan `{ body, type }` | Se ajustan al puente (T7) |
| 11 | `tests/unit/recetas/recipe-service.test.ts`, `recipe-actions.test.ts`, `recipe-image-*.test.ts`, `recipe-lines-catalog.test.ts`, `authorization.test.ts` | fixtures con `steps: [{ body, type }]` | Fixture única nueva (T3) |
| 12 | `tests/integration/recetas/*.int.test.ts` | fixtures de `steps` | Igual que 11 |

### El puente de la pantalla (R19)

**Lo que se hace:** el campo de pasos sigue siendo el mismo `<Input>` de texto con arrastre; lo
único que se retira es el `<Select>` de tipo. En el envío, cada paso se proyecta a
`{ blocks: [{ kind: 'paragraph', spans: [{ text }] }] }`; en la precarga de edición, el documento
se aplana a texto concatenando el `text` de los `spans` de sus párrafos, separados por salto de
línea. Dos funciones puras en `recipe-form-state.ts`, testeables sin montar React.

**Lo que el puente pierde, dicho sin adornos:** las marcas y las listas de verificación. Si alguien
guardara un documento rico y luego lo editara desde el puente, lo aplanaría. **Hoy eso no puede
pasar**: R14 deja todas las recetas sin pasos y el puente es la única vía de escritura hasta QC-64,
así que el único documento que puede aplanar es uno que él mismo creó (un párrafo, un fragmento,
sin marcas). Es una ventana cerrada, no un riesgo latente — y se cierra del todo cuando entra
QC-64, que **reemplaza** estas dos funciones.

**Lo que NO se hace aquí:** editor enriquecido, botones de negrilla/cursiva, lista de verificación
en pantalla, componente de lectura y modal de vista previa. Todo eso es QC-64.

## 7. Dependencias nuevas

**Ninguna.** La validación del documento se resuelve entera con **`zod`**, que ya está en
`package.json` y en `docs/dependencias.md` (fila `zod`, `heredada`, 2026-09-01):
`discriminatedUnion`, `strict`, `superRefine` y la recursividad por composición cubren R1–R13 sin
escribir un parser a mano, que es lo que prohíbe `docs/architecture.md > Dependencias de terceros`.

Se evaluó y **se descarta proponer** una librería de modelo de documento (`prosemirror-model` o el
esquema JSON de TipTap) para el dominio: obligaría a `domain/` a importar un paquete que no es puro
—y a acoplar el contrato guardado en base de datos a la versión de un editor—, cuando lo que
necesitamos son cuatro nodos. No se anotan sus cuatro checks de salud porque **no se propone su
entrada**; si QC-64 necesita un editor, esa ficha traerá su propia propuesta con los cuatro checks,
y ahí sí lo aprueba el humano.

## 8. Alternativas descartadas

**8.1. Guardar el paso como cadena de HTML o de Markdown *(descartada)*.** Es lo más barato de
escribir: el editor de QC-64 emite HTML y se guarda. Se descarta porque «estructura cerrada»
(decisión cerrada 1) dejaría de ser verificable: validar que un HTML sólo trae `<p>`, `<strong>`,
`<em>` y checkboxes exige sanitizar —una dependencia nueva y una superficie de inyección— y aun así
admite mil formas de escribir lo mismo. Un documento tipado se valida con zod, se compara en un
test con `toEqual`, y no puede contener un `<script>`.

**8.2. Adoptar tal cual el JSON de ProseMirror/TipTap *(descartada)*.** Ahorraría la conversión en
QC-64. Se descarta por dos motivos: mete al **dominio** en dependencia de la forma interna de un
editor concreto —cambiar de editor sería migrar datos ya guardados— e incumple el espíritu de la
regla de dependencias del dominio (`docs/architecture.md`: sólo paquetes puros). QC-64 hará la
conversión en su capa de UI, que es donde el editor vive; el precio es escribir ese mapeo, y se
acepta.

**8.3. Conservar `type` como campo derivado y calculado al leer *(descartada)*.** Ahorraría tocar
la pantalla y los tests de la 6-12. La descarta la **decisión cerrada 2**, y además reintroduciría
justo lo que QC-33 evitó con el total del pedido: un dato derivado que se guarda y puede
contradecir a su origen. Quien necesite saber si un paso tiene lista de verificación mira sus
bloques.

**8.4. Borrar los pasos con un script en vez de una migración *(descartada)*.** `scripts/` está
exento de las guardias y sería más fácil de escribir. Se descarta porque no queda registro de si se
ejecutó en cada entorno y no viaja con el despliegue: el borrado tiene que ocurrir **antes** de la
primera lectura del código nuevo, y eso sólo lo garantiza `migrate deploy`.

## 9. Riesgos

1. **El borrado es irreversible y afecta a datos de usuario.** Mitigación: ninguna técnica —lo
   decidió el humano (decisión cerrada 5)—. Lo que sí se hace es dejarlo escrito en el `down.sql`,
   en `tasks.md` y en el resumen de la PR, para que nadie lo aplique creyendo que es reversible.
2. **JSON sin tope de caracteres** (sección 3): riesgo aceptado, freno de facto en el límite de
   cuerpo de la Server Action.
3. **El puente es lossy por construcción** (sección 6): la ventana está cerrada mientras QC-64 no
   entre, pero si QC-64 se retrasara mucho **y** alguien escribiera documentos ricos por otra vía,
   dejaría de estarlo.
4. **`.strict()` puede romper a un cliente descuidado**: cualquier campo extra que la pantalla
   envíe pasa de ignorarse a rechazar la operación entera. Es lo que R4 pide; se nombra para que el
   fallo se lea como intencional y no como bug.
