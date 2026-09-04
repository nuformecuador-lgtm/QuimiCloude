import type { ZodIssue } from 'zod';

import type { RecipeStepType } from '@/lib/modules/recetas';

/**
 * Tipos del estado del formulario de receta y el armado de su payload (T13, R22, R29, R32, R35,
 * R36; `design.md > 5`, `> 8`).
 *
 * **Archivo SIN React y SIN DOM a propósito**: es lo que `buildRecipePayload` necesita para ser
 * puro y testeable sin montar nada (`tasks.md > T13`). `recipe-form.tsx` es quien lo usa dentro de
 * React; este archivo no sabe que React existe.
 */

/** Modo del formulario: determina qué esquema del contrato valida el payload. */
export type RecipeFormMode = 'create' | 'edit';

/**
 * Los TRES estados del campo de imagen (R35, R36), representados como una unión discriminada
 * -nunca como `File | null | undefined`, que colapsaría "no tocado" y "quitado"-.
 *
 * `untouched`: el usuario no tocó el campo -> el payload NO lleva la clave `image`.
 * `replaced`: el usuario eligió un archivo -> el payload lleva `image: { bytes }`.
 * `cleared`: el usuario pidió quitar la imagen -> el payload lleva `image: null` EXPLÍCITO.
 * Solo válido en edición: el control de quitar no se ofrece en el alta (R36).
 */
export type ImageFieldState =
  | { readonly kind: 'untouched' }
  | { readonly kind: 'replaced'; readonly bytes: Uint8Array }
  | { readonly kind: 'cleared' };

/**
 * Línea de producto tal como vive en el ESTADO del formulario (no el payload que se envía).
 *
 * `key` es una clave LOCAL de React para la lista -nunca el `id` de la línea que devuelve el
 * backend-: el esquema de recetas no admite ids de línea (`design.md > 6`).
 *
 * `productName` tiene TRES lecturas posibles y es el único discriminante disponible (R53, R54):
 * - `''` (cadena vacía): línea nueva, el usuario todavía no eligió producto.
 * - una cadena no vacía: producto elegido y disponible.
 * - `null`: la línea vino de la precarga de edición con un producto DADO DE BAJA (R21, R53). Dejar
 *   de estar marcada es automático: en cuanto el usuario elige otro producto por el selector,
 *   `productName` pasa a la cadena elegida y ya no es `null`.
 */
export type RecipeLineFormValue = {
  readonly key: string;
  readonly productId: string;
  readonly productName: string | null;
  readonly quantity: string;
  readonly unitId: string;
};

/**
 * Paso del formulario, con su clave local de React (mismo motivo que en `RecipeLineFormValue`).
 *
 * `text` es lo que el usuario escribe -viaja al contrato como `body`- y `type` es el tipo de
 * paso, `'texto'` por defecto. Los dos valores validos los pone el CONTRATO
 * (`RECIPE_STEP_TYPES`), no esta pantalla.
 */
export type RecipeStepFormValue = {
  readonly key: string;
  readonly text: string;
  readonly type: RecipeStepType;
};

/** Estado completo y controlado del formulario. */
export type RecipeFormState = {
  readonly name: string;
  readonly description: string;
  readonly lines: readonly RecipeLineFormValue[];
  readonly steps: readonly RecipeStepFormValue[];
  readonly image: ImageFieldState;
};

/** Línea tal como la espera el contrato (`recipeLineSchema`): sin `key` ni `productName`. */
export type RecipeLinePayload = {
  readonly productId: string;
  readonly quantity: string;
  readonly unitId: string;
};

/**
 * Payload que arma `buildRecipePayload`. `image` es OPCIONAL -y la ausencia de la clave, no un
 * valor `undefined` asignado, es lo que representa "no tocado"- y puede valer `null` de forma
 * explícita solo cuando el estado es `cleared` (edición). Coincide con la forma que esperan
 * `createRecipeSchema.safeParse` y `updateRecipeSchema.safeParse` del contrato público.
 */
/** Un paso tal y como lo reciben `createRecipeSchema`/`updateRecipeSchema`. */
export type RecipeStepPayload = {
  readonly body: string;
  readonly type: RecipeStepType;
};

export type RecipePayload = {
  readonly name: string;
  readonly description: string | null;
  readonly steps: readonly RecipeStepPayload[];
  readonly lines: readonly RecipeLinePayload[];
  readonly image?: { readonly bytes: Uint8Array } | null;
};

/**
 * Arma el payload que se envía a `createRecipeAction`/`updateRecipeAction` (T13, `design.md > 5`,
 * `> 8`).
 *
 * **Los tres estados de la imagen se distinguen por PRESENCIA DE LA CLAVE** (R35, R36): cuando el
 * estado es `untouched`, el objeto devuelto directamente NO TIENE la propiedad `image` -ni
 * siquiera con valor `undefined` asignado, que dejaría `'image' in payload` en `true`-. Cuando es
 * `replaced`, lleva `image: { bytes }`. Cuando es `cleared`, lleva `image: null` EXPLÍCITO. La
 * prueba correcta de un test sobre esto es `'image' in payload`, nunca `payload.image ===
 * undefined` (`design.md > 8`, riesgo 6).
 *
 * **La cantidad se copia TAL CUAL, como cadena** (R29): esta función no la parsea, no la
 * redondea y no la convierte a número en ningún punto. `grep` de la ruta confirma que en ningún
 * archivo de esta feature aparece `parseFloat(`, `Number(` ni `toFixed(` sobre la cantidad.
 *
 * **Cada paso viaja como `{ body, type }`** -el texto tal cual lo escribio el usuario y su tipo-,
 * nunca como cadena suelta: el contrato dejo de aceptar eso cuando el paso gano tipo.
 *
 * **Los pasos salen en el orden en que `state.steps` los tiene** (R32): es responsabilidad de
 * `recipe-steps-field.tsx` mantener ese array en el orden que el usuario ve, arrastre o teclado
 * mediante; esta función solo lo proyecta a `string[]`.
 *
 * **Las líneas van completas y sin decisión propia** (R21, R22): `productName` y `key` -que son
 * de PRESENTACIÓN, nunca del contrato- se descartan aquí, pero `productId`, `quantity` y `unitId`
 * viajan intactos incluso si la línea está marcada como "producto no disponible" en la interfaz:
 * esta función no conoce esa marca, es derivada en `recipe-lines-field.tsx` a partir de
 * `productName === null` y nunca llega hasta aquí.
 */
export function buildRecipePayload(mode: RecipeFormMode, state: RecipeFormState): RecipePayload {
  if (mode === 'create' && state.image.kind === 'cleared') {
    // R36: el control de quitar no se ofrece en el alta, así que este estado nunca debería
    // producirse en modo alta. Si ocurre de todos modos es un error de programación del propio
    // formulario -no un caso válido para el que haya que inventar una representación-, y se
    // prefiere fallar aquí a enviar en silencio un `null` que el esquema de alta rechazaría con
    // un mensaje que no explica el motivo real.
    throw new Error('El estado "cleared" de la imagen no es válido en el alta (R36).');
  }

  const base = {
    name: state.name,
    description: state.description.trim() === '' ? null : state.description,
    steps: state.steps.map((step): RecipeStepPayload => ({ body: step.text, type: step.type })),
    lines: state.lines.map(
      (line): RecipeLinePayload => ({
        productId: line.productId,
        quantity: line.quantity,
        unitId: line.unitId,
      }),
    ),
  };

  switch (state.image.kind) {
    case 'untouched':
      // Sin la clave `image`: es justo lo que hace que 'image' in payload sea false.
      return base;
    case 'replaced':
      return { ...base, image: { bytes: state.image.bytes } };
    case 'cleared':
      return { ...base, image: null };
  }
}

/** Genera una clave local única para una línea o un paso nuevo. Nunca es el id de dominio. */
let localKeySequence = 0;
export function createLocalKey(prefix: string): string {
  localKeySequence += 1;
  return `${prefix}-${localKeySequence}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Campos de línea a los que el esquema del contrato puede atribuir un error (R31). */
export type RecipeLineFieldName = 'productId' | 'quantity' | 'unitId';

/** Errores por línea, indexados por posición, tal como sale de `error.issues[].path` (R31). */
export type RecipeLineErrors = Readonly<Record<number, Partial<Record<RecipeLineFieldName, string>>>>;

/** Errores por paso, indexados por posición (R32). */
export type RecipeStepErrors = Readonly<Record<number, string>>;

/**
 * Extrae de `error.issues` los mensajes que identifican una línea concreta -`path` con forma
 * `['lines', <índice>, <campo>]`- SIN reescribir ninguna regla propia: el mensaje es el que ya
 * trae el issue de zod (R26). No confundir con el error de "dos líneas con el mismo producto",
 * cuyo `path` es `['lines']` sin índice -lo captura `extractGeneralLinesError`-.
 */
export function extractLineErrors(issues: readonly ZodIssue[]): RecipeLineErrors {
  const result: Record<number, Partial<Record<RecipeLineFieldName, string>>> = {};
  for (const issue of issues) {
    const [root, index, field] = issue.path;
    if (root !== 'lines' || typeof index !== 'number') continue;
    if (field !== 'productId' && field !== 'quantity' && field !== 'unitId') continue;
    result[index] = { ...result[index], [field]: issue.message };
  }
  return result;
}

/** Extrae de `error.issues` los mensajes que identifican un paso concreto (R32, R38 del esquema). */
export function extractStepErrors(issues: readonly ZodIssue[]): RecipeStepErrors {
  const result: Record<number, string> = {};
  for (const issue of issues) {
    const [root, index] = issue.path;
    if (root !== 'steps' || typeof index !== 'number') continue;
    result[index] = issue.message;
  }
  return result;
}

/**
 * Mensaje que no identifica ninguna línea concreta -típicamente "dos líneas con el mismo
 * producto", cuyo `path` es exactamente `['lines']`-. Se presenta junto al bloque de líneas, no
 * junto a una fila.
 */
export function extractGeneralLinesError(issues: readonly ZodIssue[]): string | undefined {
  const issue = issues.find((candidate) => candidate.path.length === 1 && candidate.path[0] === 'lines');
  return issue?.message;
}

/** Mensaje de un campo raíz del formulario (`name`, `description`), por su nombre exacto de `path`. */
export function extractFieldError(issues: readonly ZodIssue[], field: string): string | undefined {
  const issue = issues.find((candidate) => candidate.path.length === 1 && candidate.path[0] === field);
  return issue?.message;
}
