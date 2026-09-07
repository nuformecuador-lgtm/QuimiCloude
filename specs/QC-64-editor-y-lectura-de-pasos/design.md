# QC-64 — editor-y-lectura-de-pasos · design.md

> Cómo se implementa lo que dice `requirements.md`. Las **decisiones cerradas** de ese archivo son
> entrada, no materia opinable aquí. Lo que este archivo sí decide: **qué librería** se propone y
> con qué checks, cómo se **impide** producir algo fuera del esquema cerrado, cómo se mapea el
> editor al documento de **QC-62** sin inventar un contrato paralelo, dónde vive el asistente de
> lectura para que **QC-63** lo monte sin tocarlo, y qué se retira del puente de QC-62.

## 1. Alcance técnico en una frase

Se sustituye el `<Input>` de texto plano de `recipe-steps-field.tsx` por un **editor enriquecido de
esquema cerrado**, se reemplazan las dos funciones puente de `recipe-form-state.ts`
(`textToStepDocument` / `stepDocumentToText`) por un **mapeo bidireccional editor ↔ documento del
contrato**, y se añade un **asistente de lectura reutilizable** en `components/shared/` que esta
ficha monta **sólo** dentro de un modal de «Vista previa» del formulario. **No se abre
`db/schema.prisma`, no se toca `lib/modules/recetas/domain/**` ni sus adaptadores, y no se cambia
ninguna Server Action.**

## 2. La dependencia: propuesta a aprobar en F1.4 (R25)

> Esto es lo que exige la **regla 7 de `CLAUDE.md`** y `docs/architecture.md > Dependencias de
> terceros`. **No se instala nada aquí**, y **no se añade la fila a `docs/dependencias.md`**: la
> propuesta se aprueba junto con este spec.

### 2.1. Qué se propone

**TipTap v3 sobre ProseMirror**, con **extensiones sueltas** y **sin `@tiptap/starter-kit`**.
Paquetes candidatos, como entradas **directas** de `package.json`:

| Paquete | Para qué |
| --- | --- |
| `@tiptap/react` | El binding de React: `useEditor`, `<EditorContent>` |
| `@tiptap/core` | `Editor`, `Extension`, tipos del esquema y de los comandos |
| `@tiptap/pm` | El bundle de ProseMirror que TipTap requiere como par (`prosemirror-model`, `-state`, `-view`…) en **una sola** entrada, en vez de una docena |
| Las extensiones de `document`, `paragraph`, `text`, `bold`, `italic` y **lista de verificación** | Las cuatro construcciones de R2 y nada más |

**El nombre y el reparto exacto de esos paquetes de extensión NO se fijan aquí, y es deliberado**:
en v3 varias extensiones se reagruparon en paquetes-paraguas y decir de memoria en cuál vive
`TaskList`/`TaskItem` sería inventar (regla 6). **La tarea T1 lo verifica contra el paquete
publicado antes de instalar** —mismo criterio con el que la fila de `@tanstack/react-table` de
`docs/dependencias.md` corrigió sobre el paquete instalado qué `feature` aportaba `getStart()`—.
Lo que sí queda cerrado como criterio, y el reviewer puede exigir:

- **`@tiptap/starter-kit` NO entra.** Trae encabezados, listas numeradas, cita, bloque de código,
  regla horizontal y más. Un esquema cerrado que se construye **quitando** cosas de un paquete que
  las trae todas se rompe en la siguiente actualización menor que añada un nodo; uno que se
  construye **declarando** sólo cuatro no puede crecer sin que alguien escriba una línea.
- **Cada entrada directa nueva lleva su propia fila** en `docs/dependencias.md`. Las transitivas
  no: la guardia `guard-dependencias-aprobadas.test.ts` compara sólo entradas directas.

### 2.2. Qué código nos ahorra

Lo que ahorra **no** es «los botones de negrilla»: eso son cincuenta líneas. Es todo lo demás, y es
exactamente lo que `docs/architecture.md > Dependencias de terceros` prohíbe reescribir a mano:

- **La gestión de la selección y del caret** sobre `contenteditable`, que es donde vive la
  diferencia entre navegadores y donde Safari/WebKit —el motor de iOS, que la regla multiplataforma
  obliga a soportar— se comporta distinto de Chrome.
- **El pegado**: `contenteditable` inserta por defecto el HTML del portapapeles **tal cual**, con
  sus `<h1>`, `<a>`, `<img>` y estilos en línea. Escribir a mano un sanitizador que sólo deje pasar
  cuatro construcciones es una superficie de inyección y una lista negra que nunca está completa.
- **Deshacer/rehacer** coherente con las transacciones del documento, y la **entrada por IME**
  (teclados de móvil, composición de acentos), que un `onKeyDown` propio rompe.
- **El modelo tipado del documento**: nodos, marcas y sus transiciones, con la garantía dura de la
  sección 3.

### 2.3. Los cuatro checks — **CORRIDOS POR EL LEADER el 2026-09-06: los cuatro PASAN**

**No se han corrido, y esto no es un «sí» disfrazado.** `spec_author` corre en este arnés **sin
shell ni red**: sólo puede leer y escribir archivos. `docs/architecture.md` lo dice sin rodeos —«Si
no puedes verificarlo (sin red, dato no público), no es un sí: es un **desconocido**, y se dice
(regla 6 de `CLAUDE.md`)»—, así que la tabla va con el resultado **en blanco** y con el comando
exacto que lo llena. Quien apruebe en F1.4 los corre —o los corre el leader y los pega— **para cada
paquete de la lista de 2.1**:

```bash
npm view <pkg> deprecated time.modified license   # checks 1, 2 y 4
npm view <pkg> versions --json | tail -3          # la versión que se instalaría
# check 3 (descargas semanales), que `npm view` no da:
curl -s https://api.npmjs.org/downloads/point/last-week/<pkg>
npm view <pkg> peerDependencies                   # NO es un check, pero ver 2.5
```

> **Nota del leader (2026-09-06).** `spec_author` dejó esta tabla en blanco porque corre sin
> shell ni red, y lo dijo en vez de rellenarla de memoria. La corrió el leader, que sí tiene
> shell, con los comandos exactos de arriba. Lo de abajo es **salida real del registro de npm**,
> no conocimiento previo. Sigue siendo el humano quien aprueba en F1.4.

**Versión que se instalaría: `3.31.3` en todos los paquetes** (TipTap publica el monorepo con
versión única), **publicada el 2026-09-04** —dos días antes de esta verificación—.

| Paquete | 1. deprecated | 2. última release | 3. descargas/semana | 4. licencia | ¿Pasa? |
| --- | --- | --- | --- | --- | --- |
| `@tiptap/react` | no | 2026-09-04 | 14.924.978 | MIT | **sí** |
| `@tiptap/core` | no | 2026-09-04 | 18.613.079 | MIT | **sí** |
| `@tiptap/pm` | no | 2026-09-04 | 18.519.925 | MIT | **sí** |
| `@tiptap/extension-document` | no | 2026-09-04 | 17.572.196 | MIT | **sí** |
| `@tiptap/extension-paragraph` | no | 2026-09-04 | 17.933.591 | MIT | **sí** |
| `@tiptap/extension-text` | no | 2026-09-04 | 18.021.485 | MIT | **sí** |
| `@tiptap/extension-bold` | no | 2026-09-04 | 17.636.206 | MIT | **sí** |
| `@tiptap/extension-italic` | no | 2026-09-04 | 17.606.513 | MIT | **sí** |
| `@tiptap/extension-list` | no | 2026-09-04 | 13.587.154 | MIT | **sí** |

Ninguno pasa cerca del límite: el más bajo de los nueve tiene **1.358 veces** el mínimo de
10.000 descargas semanales, y la release es de anteayer. **Ninguna fila nace como `excepcion`.**

**Dónde viven `TaskList`/`TaskItem` — resuelto contra el paquete publicado, no de memoria.** Era
la incertidumbre que 2.1 dejó abierta a propósito y el riesgo 3 de la sección 10. Se descargó
`@tiptap/extension-list@3.31.3` con `npm pack` y se miraron sus `exports`:

```
'.', './bullet-list', './item', './keymap', './kit',
'./ordered-list', './task-item', './task-list'
```

**`@tiptap/extension-list` exporta las dos**, en `./task-list` y `./task-item`, y `index.d.ts`
declara `TaskList` y `TaskItem`. O sea que **la lista de verificación no añade paquete propio**:
son **nueve** entradas directas, no once. Los paquetes sueltos `@tiptap/extension-task-list` y
`@tiptap/extension-task-item` existen y tampoco están deprecados, pero **declaran
`@tiptap/extension-list` como par**, o sea que instalarlos sería añadir dos filas para llegar al
mismo código del paquete que ya entra. **No entran.**

**Ojo con lo que esto NO significa**: `@tiptap/extension-list` también trae `BulletList`,
`OrderedList` y un `./kit`. Que estén en el paquete no los mete en el esquema —el esquema lo
declaran las extensiones que se **registran**, sección 3—, pero es exactamente el bulto que 2.1
quería evitar con `starter-kit`, a menor escala. La guardia de esquema de la sección 3 y la de
aislamiento (T12) tienen que morder también aquí: **importar de `./task-list` y `./task-item`,
nunca de `./kit` ni de la raíz del paquete**.

**`peerDependencies` contra lo que hay en `package.json` (`react@19.2.8`, `react-dom@19.2.8`,
`next@16.3.0`) — punto 1 de 2.5, verificado:**

- `@tiptap/react` declara `react` y `react-dom` `^17.0.0 || ^18.0.0 || ^19.0.0`, y lo mismo para
  `@types/react` y `@types/react-dom`. **React 19 entra sin `--force`.**
- El resto declara como par el propio `@tiptap/core` / `@tiptap/pm` fijados a `3.31.3`, o sea que
  **los nueve tienen que ir a la misma versión exacta**. Nada del árbol de TipTap declara par
  contra `next`.

Lo que **sigue sin verificar** de 2.5, porque no se puede sin instalar ni sin correr el navegador:
el punto 2 (Safari/WebKit y Chrome Android, que cierra el E2E de R28) y el punto 3 (si
`npx shadcn add dialog checkbox toggle-group` mete entradas nuevas en `package.json`; se comprueba
con `git diff package.json` justo después de correr el CLI, en T2).

Lo que sí se puede afirmar sin red, y se separa a propósito de la tabla porque **no la sustituye**:
TipTap se distribuye históricamente bajo **MIT** y es una librería de uso masivo. Eso es
conocimiento previo del agente, **no una verificación contra el registro**, y no vale como acta. Si
al correr los comandos alguno falla, la salida está en 2.4 y la fila nace como `excepcion` con el
check fallado escrito —el precedente exacto es `@dnd-kit/*`, que entró así el 2026-09-03—.

### 2.4. La fila que iría en `docs/dependencias.md`

Una por paquete directo, con la misma redacción; se rellenan los cuatro huecos con la salida real
de 2.3. **La añade el humano/leader al aprobar, no `spec_author`.**

```
| `@tiptap/react` | Editor enriquecido de esquema cerrado para redactar los pasos de una receta (QC-64): binding de React sobre ProseMirror, gestión de selección y caret, pegado coercionado por el esquema, deshacer/rehacer e IME | <aprobada|excepcion> | <fecha> | **Los cuatro checks <PASAN|falla el N>**, verificados contra el registro de npm el <fecha>: deprecated=<...>; última release `<version>` del <fecha>; <N> descargas semanales; licencia <...>. Aprobada por el humano al aprobar el spec de QC-64 (F1.4). **NO se instala `@tiptap/starter-kit`**, y ese «no» es el diseño: el esquema cerrado se declara con cuatro construcciones (párrafo, negrilla, cursiva, lista de verificación) en vez de quitárselas a un paquete que las trae todas — así una versión menor que añada un nodo no puede ampliar el esquema por su cuenta (`specs/QC-64-editor-y-lectura-de-pasos/design.md > 2.1`). **Aislada en los archivos que enumera `design.md > 7`**, para que sustituirla sea reescribirlos y no buscarla por todo el repo. `peerDependencies` verificadas contra `react@19.2.8` |
```

### 2.5. Lo que hay que comprobar **además** de los cuatro checks

Ninguno de estos es un check de salud, y ninguno se puede dar por bueno de memoria:

1. **`peerDependencies` contra `react@19.2.8` y Next 16.3.0** (lo que hay en `package.json`). Si el
   par declarado no incluye React 19, no se instala con `--force`: se dice y se decide.
2. **Safari/WebKit y Chrome Android**, que `docs/architecture.md > Regla: multiplataforma` exige
   verificar **antes** de añadir la dependencia de UI. Un editor es justo el tipo de librería donde
   iOS se comporta distinto. La verificación real es el E2E de R28, que ya corre en los dos
   proyectos de Playwright del repo (Chromium y WebKit; ver la cabecera de `e2e/recetas.spec.ts`).
3. **`npx shadcn add dialog checkbox toggle-group`**: hoy `components/ui/` **no tiene** `dialog`,
   `checkbox` ni `toggle`/`toggle-group` (sí `alert-dialog`, `sheet`, `popover`, `tooltip`). Si el
   CLI añade una entrada nueva a `package.json` —y no sólo código sobre el `@base-ui/react` que ya
   está—, esa entrada **también necesita fila**. Se comprueba con `git diff package.json` justo
   después de correr el CLI, no se supone.

## 3. El esquema cerrado: cómo se impide producir algo más (R2, R3, R4, R5)

Tres capas, y cada una tapa lo que la anterior no puede:

**Capa 1 — el esquema del editor (la garantía dura).** En ProseMirror, un documento **no puede
contener** un nodo o una marca que su esquema no declare: no es una validación que corre después,
es que la estructura no existe. Al pegar, el parser de HTML **coerciona**: lo que no encaja se
convierte en lo más cercano que sí encaja (un `<h1>` acaba siendo un párrafo con su texto) o se
descarta (`<img>`). Esto es lo que cierra R3 sin escribir un sanitizador. Se declara el esquema con
**seis extensiones y ninguna más** —`Document`, `Paragraph`, `Text`, `Bold`, `Italic`, lista de
verificación—; se desactivan explícitamente los atajos de teclado de cualquier extensión que traiga
más de lo pedido, y **no se registra ninguna extensión de enlace, encabezado, imagen ni tabla**.

**Capa 2 — el mapeo (sección 4).** La función que traduce del editor al contrato **construye** las
formas del contrato; no copia el JSON del editor. Un nodo inesperado no tiene rama que lo escriba:
o se proyecta a párrafo/fragmento, o no llega al payload. Es una lista blanca por construcción.

**Capa 3 — `recipeStepSchema.safeParse` antes de enviar, y el borde del módulo después.** El
formulario ya valida con los esquemas del contrato antes de invocar la acción
(`recipe-form.tsx > handleSubmit`), y el `.strict()` de QC-62 rechaza cualquier clave que el
contrato no declare (QC-62 R4). El servidor revalida igual: el cliente nunca es la frontera.

**Lo que el editor no puede representar, dicho antes de que sorprenda** (ya lo avisaba
`specs/QC-62/design.md > 2`): listas anidadas, listas numeradas, encabezados, enlaces, tablas y
cualquier marca dentro de un ítem que no sea negrilla o cursiva. Un párrafo dentro de un ítem
tampoco: el ítem es una lista de fragmentos, no un contenedor de bloques.

## 4. El mapeo editor ↔ documento del contrato

Archivo nuevo: `app/(private)/produccion/formulas/components/recipe-step-document.ts`. **Sin
React y sin DOM**, dos funciones puras, mismo criterio con el que `recipe-form-state.ts` se escribió
sin React para poder testearse sin montar nada:

```ts
import type { RecipeStepDocument } from '@/lib/modules/recetas';

/** Editor -> contrato. Lista blanca: lo que no tiene rama, no se escribe. */
export function editorJsonToStepDocument(json: unknown): RecipeStepDocument;

/** Contrato -> editor. Total: el documento del contrato SIEMPRE tiene representación. */
export function stepDocumentToEditorJson(document: RecipeStepDocument): unknown;
```

Reglas del mapeo, que son las que los tests unitarios afirman:

| Contrato (QC-62) | Editor | Nota |
| --- | --- | --- |
| `{ kind: 'paragraph', spans: [] }` | párrafo vacío | R4: la línea en blanco se conserva, no se colapsa |
| `{ kind: 'paragraph', spans: [{text,bold?,italic?}] }` | párrafo con `text` marcado | Marcas **combinables** sobre el mismo fragmento |
| `{ kind: 'checklist', items: [{spans}] }` | lista de verificación con sus ítems | El estado de marcado **no existe** en el contrato |
| — | cualquier otro nodo/marca | **no se escribe**: no hay rama (capa 2 de la sección 3) |

Dos detalles que no son decorativos:

- **`checked` no viaja, ni de ida ni de vuelta (R5, R6).** La extensión de lista de verificación de
  TipTap lleva un atributo de marcado en cada ítem; el contrato no lo tiene. Al mapear hacia el
  contrato **se ignora**, y al mapear hacia el editor se fija siempre en «sin marcar». Y como un
  valor que se puede fijar y se pierde en silencio es un engaño, **el checkbox del editor se
  renderiza no interactivo** (`pointer-events:none` + `aria-hidden` sobre el control, con el ítem
  editable): marcar es un acto de **lectura**, y la lectura es el asistente de la sección 5.
- **El texto no se recorta ni se normaliza** (QC-62 R5). El mapeo no llama a `trim()` en ningún
  punto; un test lo afirma con un texto que empieza y acaba en espacio.

**Se retiran** `textToStepDocument` y `stepDocumentToText` de `recipe-form-state.ts` —el puente de
QC-62 R19, provisional por diseño y declarado como tal en su propio comentario— junto con sus
tests. `RecipeStepFormValue.text: string` pasa a ser **el documento del contrato**, no una cadena:

```ts
export type RecipeStepFormValue = { readonly key: string; readonly document: RecipeStepDocument };
```

`buildRecipePayload` deja de proyectar texto y pasa cada `step.document` tal cual. El orden de los
pasos lo sigue mandando el array del estado, que es lo que el arrastre reordena (QC-26 R32).

## 5. El asistente de lectura (R14–R22)

**Dónde vive:** `components/shared/step-reader/` con su barrel, **no** en la carpeta de la ruta.
`docs/architecture.md` sólo promueve a `shared/` lo que necesitan **dos** features — y aquí son
dos: esta y **QC-63**, que ya está en el board con `depends_on: QC-64` y que lo montará en una ruta
del Operador (decisión cerrada 2). Nace ahí para que QC-63 sea «montarlo», no «moverlo y arreglar
los imports».

**API, y nada más que esto (R20):**

```ts
export type StepReaderProps = {
  readonly steps: readonly RecipeStepDocument[];
  readonly onFinish: () => void;      // qué hace Finalizar lo decide QUIEN lo monta
  readonly title?: string;
};
```

Sin `recipeId`, sin fetch, sin Server Action, sin `lib/composition`, sin `useRouter`. Es lo que
permite que QC-63 le enchufe otro `onFinish` sin tocar el componente, y lo que hace que la pregunta
abierta 1 —la vía de escape del bloqueo— se pueda resolver **allí** añadiendo una prop, sin reabrir
nada de aquí.

**Estado interno, todo en memoria (R19):** el índice del paso actual y un conjunto de ítems
marcados con clave `${índiceDePaso}:${índiceDeBloque}:${índiceDeÍtem}`. **Sin `localStorage`, sin
`sessionStorage`, sin URL**: cerrar el modal desmonta el componente y el estado se va con él. Un
test unitario afirma que ningún archivo del componente menciona `localStorage`/`sessionStorage`, y
otro que al remontarlo los ítems vuelven sin marcar.

**El bloqueo (R17, R18):** el botón de avanzar se renderiza `disabled` **y** con un párrafo de
motivo visible junto a él («Marca los N elementos pendientes para continuar»), asociado al botón
por `aria-describedby`. `disabled` a secas no basta: un botón deshabilitado sin motivo es una
pantalla que no responde y no dice por qué, y el motivo no puede vivir en un `title` porque en
táctil no hay `:hover` (R26). Los ítems pendientes se cuentan sobre el **paso actual**; un paso sin
lista de verificación tiene cero pendientes y avanza sin más (R18).

**Un paso por pantalla (R14):** se renderiza **sólo** `steps[index]`; los demás no están en el DOM
—no ocultos con CSS, que un test de «no hay dos pasos» no distinguiría—. La cabecera indica «Paso
i de n» y el cambio se anuncia en una región `aria-live="polite"` (R27), mismo mecanismo que ya usa
`recipe-steps-field.tsx` para el arrastre.

**Renderizado del documento:** los párrafos como `<p>` —el párrafo sin fragmentos como línea en
blanco con altura—, los fragmentos con `<strong>` y `<em>`, y cada ítem como un `<label>` con un
control marcable de ≥44×44 px. **Nada de `dangerouslySetInnerHTML`**: se recorre el documento
tipado. Es una de las razones por las que QC-62 no guardó HTML.

## 6. La vista previa (R11, R12, R13, R22)

Un `Dialog` de shadcn (`npx shadcn add dialog`) dentro de `recipe-form.tsx`, abierto por un botón
«Vista previa» junto a Guardar y Cancelar. Al abrir, **proyecta el estado actual** del formulario:
`state.steps.map((s) => s.document)`. No guarda, no llama a ninguna acción, no navega (R11). Cerrar
—por el botón, por `Esc` o por Finalizar (R22)— desmonta el asistente y devuelve el foco al botón
que lo abrió; el estado del formulario no se toca (R13).

**Sin ruta propia (R12).** No se añade nada a `lib/shared/routes.ts` y no se crea ninguna carpeta
con `page.tsx`. Un test de contrato de ruta afirma que el asistente no aparece en ninguna `page.tsx`
fuera del formulario — el repo ya tiene el precedente en
`tests/unit/recetas-ui/recipe-route-contract.test.ts`.

## 7. Inventario de archivos y aislamiento de la librería (R25)

| Archivo | Qué pasa | Importa la librería |
| --- | --- | --- |
| `app/(private)/produccion/formulas/components/recipe-step-editor.tsx` | **nuevo**: el editor de un paso, con su barra de formato | **SÍ** |
| `app/(private)/produccion/formulas/components/recipe-step-schema.ts` | **nuevo**: la lista de extensiones y su configuración (sección 3, capa 1) | **SÍ** |
| `app/(private)/produccion/formulas/components/recipe-step-document.ts` | **nuevo**: el mapeo de la sección 4 | no (tipos del contrato y JSON plano) |
| `app/(private)/produccion/formulas/components/recipe-steps-field.tsx` | el `<Input>` da paso al editor; el arrastre y su asa **no se tocan** | no |
| `app/(private)/produccion/formulas/components/recipe-form-state.ts` | `RecipeStepFormValue.document`; se **retiran** las dos funciones puente | no |
| `app/(private)/produccion/formulas/components/recipe-form.tsx` | precarga con documentos, botón y modal de vista previa | no |
| `app/(private)/produccion/formulas/components/index.ts` | barrel: entra lo nuevo | no |
| `components/shared/step-reader/*` | **nuevo**: el asistente (sección 5) | no |
| `components/ui/dialog.tsx`, `checkbox.tsx`, `toggle-group.tsx` | por CLI de shadcn (R24) | no |

**Sólo dos archivos importan la librería del editor**, y una **guardia de fuente** lo hace cumplir
—copiando el patrón que QC-26 usó para `@dnd-kit` (`recipe-steps-field.tsx` es su único
importador)—. Es lo que hace barata la salida si el editor hay que cambiarlo: se reescriben esos
dos y el mapeo, y el resto del repo ni se entera.

## 8. Multiplataforma y accesibilidad (R26, R27)

- **Barra de formato:** botones reales (`<button>`), ≥44×44 px, **siempre visibles** —nada de una
  barra flotante que aparece al pasar el ratón sobre la selección, que en táctil no existe—, con
  `aria-pressed` reflejando si la marca está activa en la selección.
- **El área editable** con `text-base` (≥16 px), o iOS hace zoom al enfocar.
- **Teclado:** los botones de la barra entran en el orden natural del tabulador; salir del área
  editable con `Tab` no debe quedar atrapado. Los atajos nativos de negrilla/cursiva se conservan;
  cualquier otro atajo que traiga una extensión se desactiva con el esquema (sección 3).
- **Arrastre + editor (R24):** el `PointerSensor` ya está configurado con
  `activationConstraint: { distance: 8 }` y el arrastre **sólo** se inicia desde el asa, que es un
  `<button>` aparte; escribir dentro del editor no lo dispara. Punto caliente a comprobar en
  implementación: que el `KeyboardSensor` del asa y el teclado del editor no se pisen —el sensor
  sólo actúa con el foco en el asa—.
- **Modal:** alto por contenido con `max-h-[85dvh]` y scroll interno, nunca `100vh`.

## 9. Alternativas descartadas

**9.1. `contenteditable` a mano, sin librería *(descartada, y además la cierra la decisión 7).***
Sería «cero dependencias». Se descarta porque el trabajo real no son los botones sino la selección,
el pegado, el IME y las diferencias de WebKit (2.2), y porque `docs/architecture.md > Dependencias
de terceros` rechaza explícitamente reimplementar a mano lo que una librería mantenida resuelve.
Una lista negra de etiquetas al pegar es, además, una superficie de inyección.

**9.2. Lexical (`lexical` + `@lexical/react` + `@lexical/list`) *(descartada, pero es la salida
si TipTap falla un check).*** Es la alternativa seria: **trae la lista de verificación nativa**
—justo la construcción que aquí más trabajo da—, su registro de nodos también es cerrado y su JSON
serializado es fácil de mapear. Se descarta por dos razones concretas: (a) la garantía del esquema
cerrado en ProseMirror es **estructural** —un nodo no declarado no puede existir en el documento, y
el pegado se coerciona por el propio esquema—, mientras que en Lexical depende de qué nodos y qué
importadores de HTML se registren, es decir, de configurarlo bien; y (b) obliga a **más entradas
directas** en `package.json`, y cada una es una fila y una aprobación. **No se anotan sus cuatro
checks porque no se propone su entrada**; si TipTap falla un check en 2.3, esta es la opción que se
pone sobre la mesa antes de pedir una `excepcion`.

**9.3. Adoptar el JSON del editor como formato guardado *(descartada; ya lo descartó QC-62 §8.2).***
Ahorraría el mapeo de la sección 4. Lo cierra el contrato de QC-62, que es entrada aquí: acoplaría
los datos guardados a la forma interna de un editor concreto y cambiar de editor sería migrar datos.
El precio de mantenerlo separado es escribir el mapeo; se acepta, y el mapeo son dos funciones
puras con test.

**9.4. Un editor por receta en vez de uno por paso *(descartada).*** Un solo editor grande con los
pasos separados por un nodo propio parece más cómodo de escribir. Se descarta porque el paso es la
unidad del contrato (`steps: RecipeStepDocument[]`), porque el reordenado por arrastre heredado
(QC-26 R33, R34) opera sobre pasos y dejaría de tener sentido, y porque el asistente de lectura
necesita **un documento por paso** para presentar uno por pantalla.

**9.5. Guardar el marcado del asistente *(descartada).*** La cierra la decisión 5, y además
«quién marcó qué y cuándo» **no tiene ficha**: guardarlo obligaría a inventar dónde, y el alcance
lo prohíbe expresamente.

## 10. Riesgos

1. **Los cuatro checks están sin correr (2.3).** Es el riesgo con nombre: si la librería falla el
   check 2 o el 3, la ficha entra en la vía de la `excepcion` —con precedente (`@dnd-kit`)— o se va
   a 9.2. **No se escribe una línea de código hasta que la tabla de 2.3 esté rellena.**
2. **El peso del bundle.** Un editor sobre ProseMirror no es pequeño y entra en una pantalla
   privada. Mitigación: sólo se carga en el formulario de receta (es un componente de cliente de esa
   ruta), y el asistente de lectura —que es lo que QC-63 pondrá en manos del Operador— **no importa
   la librería**, así que la ruta del operario no la arrastra.
3. **Que la extensión de lista de verificación traiga más de lo pedido** (p. ej. anidamiento o
   listas normales en el mismo paquete). Se comprueba en T1 sobre el paquete publicado; si es
   inseparable, se declara aquí lo que queda dentro del esquema y R2 se verifica con un test que
   intente producir lo prohibido.
4. **Regresión del arrastre** al meter un editor dentro de cada fila (R24). Es el punto caliente de
   8; hay test heredado de QC-26 que debe seguir verde, y el E2E de R28 lo cruza.
5. **Recetas guardadas por el puente de QC-62.** Son documentos de un párrafo y un fragmento sin
   marcas: el mapeo hacia el editor los representa sin pérdida. No hay migración de datos.

## 11. Verificación (R28 y el resto)

- **Unit puros, sin React:** el mapeo de la sección 4 en los dos sentidos, incluidos el párrafo
  vacío, las marcas combinadas, el texto con espacios sin recortar y el descarte de `checked`.
- **Unit de componente (jsdom):** el editor (barra, `aria-pressed`, ausencia de controles
  prohibidos, aviso del tope), el asistente (un paso por pantalla, bloqueo con motivo visible, paso
  sin ítems, remontaje sin marcas, estado vacío) y el formulario (botón de vista previa, ausencia de
  selector de tipo).
- **E2E (R28)** en `e2e/recetas-pasos.spec.ts`, archivo **nuevo** para no engordar
  `e2e/recetas.spec.ts` —que ya cubre el camino de QC-26 y su corte por rol—, reutilizando su patrón
  de fixtures con prefijo propio (`qc64_e2e_`), su limpieza de huérfanos por prefijo **y edad**, y
  su `afterAll` por nombre exacto. Corre en Chromium **y WebKit**, que es lo que acredita el punto 2
  de 2.5.
