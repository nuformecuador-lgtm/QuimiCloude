'use client';

import { PlusIcon, XIcon } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UnitRef } from '@/lib/modules/unidades';

import { ProductPicker, type ProductPickerOption } from './product-picker';
import { resolveLineUnitId, unitsOfGroup } from './unit-group';
import { UnitPicker } from './unit-picker';
import {
  createLocalKey,
  type RecipeLineErrors,
  type RecipeLineFormValue,
} from './recipe-form-state';

/**
 * Campo de líneas de producto (T16, R27-R31, R53, R54; `design.md > 6`, `> 6.1`).
 *
 * **Añadir y quitar líneas, y una receta SIN ninguna se puede guardar** (R27): el botón de quitar
 * no tiene mínimo que respetar.
 *
 * **La fila en blanco de arranque es un FANTASMA, no una línea del estado**: cuando `lines` está
 * vacío se pinta una fila vacía que todavía NO existe en `lines`, y solo se materializa cuando el
 * usuario toca uno de sus tres campos o pulsa su `+`. Es lo que permite que la pantalla siempre
 * muestre un selector listo para usar SIN romper R27: si el usuario no la toca, `state.lines`
 * sigue vacío y `buildRecipePayload` envía `lines: []` como siempre. Nada de filtrar líneas
 * vacías en el payload -esa función no toma decisiones sobre las líneas (R21, R22)-.
 *
 * **Un ingrediente no se puede repetir**: cada selector recibe en `excludedIds` los ingredientes
 * ya elegidos en las OTRAS líneas y los aparta de su lista. El de la propia línea nunca se aparta
 * a sí mismo.
 *
 * **Cada fila lleva sus dos acciones, `X` y `+`** (no hay botón de añadir en la cabecera): la `X`
 * quita esa línea -y si era la última, reaparece el fantasma, así que nunca se queda la pantalla
 * sin filas- y el `+` deja la fila donde está y añade otra vacía debajo.
 *
 * **La cantidad es `type="number"` con `step="any"`** (R29, revisada por decisión humana del
 * 2026-09-08). Antes era `type="text"` con `inputMode="decimal"`; el humano pidió el control
 * numérico a conciencia, asumiendo sus dos costes conocidos: en locales con coma decimal el
 * navegador puede rechazar la coma, y la rueda del ratón sobre el campo enfocado cambia el
 * valor. Lo que NO cambia es el fondo de R29: **el valor sigue viajando como CADENA** -se lee
 * de `event.target.value`, se guarda tal cual en el estado y `buildRecipePayload` lo copia sin
 * tocarlo-. Esta pantalla sigue sin convertir la cantidad a número en ningún punto: ni
 * `parseFloat(`, ni `Number(`, ni `toFixed(`. Cambió el widget, no el tipo del dato.
 *
 * **El selector de unidad depende del INGREDIENTE de su línea** (QC-26bis, decisión humana del
 * 2026-09-08), y las tres reglas viven en `unit-group.ts` -puro y probado sin DOM-:
 * - sin ingrediente elegido, el campo va **deshabilitado**: no hay grupo que ofrecer;
 * - con ingrediente, la lista se acota a las unidades del **mismo grupo** que la suya -misma
 *   base efectiva, el mismo criterio de convertibilidad del dominio de `unidades`-, así que un
 *   producto en kg ofrece kg y g y nada más;
 * - al elegir ingrediente se preselecciona la unidad **más pequeña** del grupo, salvo que la ya
 *   elegida sea de ese mismo grupo: entonces se mantiene.
 *
 * **De dónde sale esa unidad, desde QC-80 (R22, R23):** de `ProductView.latestBatchUnitId`, o
 * sea de la **presentación del lote más reciente** del ingrediente -`created_at DESC`,
 * desempatando por `id DESC`-. Antes salía de `products.unit_id`, una columna que el producto
 * declaraba y que ya NO EXISTE: la unidad la declara la presentación. Cambió la **fuente** del
 * dato; **ninguna de las tres reglas de arriba cambió**, y `unit-group.ts` no se tocó.
 *
 * Cuando esa unidad es `null` -o la línea viene de la precarga de edición, que no trae la del
 * producto- el grupo es el **catálogo completo**: no se recorta una lista a partir de un dato
 * que no se tiene. Con la fuente nueva, `null` significa **«este producto todavía no tiene
 * ningún lote»**, no «no se pudo leer» ni «no tiene unidad». Y por eso la línea **no se bloquea
 * nunca** por ese motivo (R23): el selector se habilita en cuanto hay ingrediente elegido y la
 * receta se puede guardar igual, porque se escriben recetas antes de comprar el ingrediente.
 *
 * **Producto dado de baja (R53, R54, `design.md > 6.1`, decisión cerrada del 2026-09-03):** el
 * ÚNICO discriminante es `line.productName === null`. Cuando lo es:
 * - la CELDA de producto de esa línea, y solo esa, lleva
 *   `data-testid="recipe-line-unavailable-<índice>"`;
 * - el bloque cierra con un aviso `role="status"`, `data-testid="recipe-lines-unavailable-notice"`
 *   y `data-count` con el número de líneas afectadas.
 *
 * El número **se calcula en cada render a partir de `lines`** (`lines.filter(...).length`), nunca
 * de un booleano guardado al cargar: quitar una línea afectada baja el número de inmediato porque
 * ya no está en el array que se recorre, y quitar la última hace que el `.filter` devuelva un
 * array vacío y el aviso deje de montarse -no se oculta con CSS, DESAPARECE del DOM-.
 *
 * **El marcador no deshabilita la línea, no la quita y no impide guardar** (R53): la línea sigue
 * completa en `lines` y `buildRecipePayload` la reenvía intacta (R21, R22) porque no conoce
 * `productName`, solo `productId`, `quantity` y `unitId`.
 *
 * **R10 ampliado**: este archivo es del FORMULARIO, no de la lista. La lista (`recipe-table.tsx`)
 * no importa nada de aquí y no pinta ningún marcador equivalente.
 */

const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * La fila en blanco que se pinta cuando `lines` está vacío. Su clave es constante a propósito:
 * no es una línea del estado, así que no compite con las claves locales de `createLocalKey`.
 */
const GHOST_LINE: RecipeLineFormValue = {
  key: 'linea-en-blanco',
  productId: '',
  productName: '',
  quantity: '',
  unitId: '',
  productUnitId: null,
};
const FIELD_TEXT = 'text-base';

/** Texto del selector de ingrediente según el estado de la línea. Sin depender del copy en los tests (R54). */
function productPickerLabel(productName: string | null): string {
  if (productName === null) return 'Ingrediente no disponible';
  if (productName === '') return 'Buscar ingrediente';
  return productName;
}

export type RecipeLinesFieldProps = {
  readonly lines: readonly RecipeLineFormValue[];
  readonly onChange: (lines: readonly RecipeLineFormValue[]) => void;
  readonly units: readonly UnitRef[];
  readonly initialProductPage: {
    readonly items: readonly ProductPickerOption[];
    readonly totalPages: number;
  };
  readonly errors?: RecipeLineErrors;
  readonly generalError?: string;
};

export function RecipeLinesField({
  lines,
  onChange,
  units,
  initialProductPage,
  errors,
  generalError,
}: RecipeLinesFieldProps) {
  const headingId = useId();

  // Derivado en CADA render, nunca cacheado (R54): el criterio de honestidad de T16b exige que
  // borrar este `.filter(` ponga el test en rojo, así que no puede sustituirse por un contador
  // guardado en el estado.
  const unavailableCount = lines.filter((line) => line.productName === null).length;

  /** Fila vacía recién creada, ya con su clave local. */
  function blankLine(): RecipeLineFormValue {
    return {
      key: createLocalKey('line'),
      productId: '',
      productName: '',
      quantity: '',
      unitId: '',
      productUnitId: null,
    };
  }

  /** `true` si lo que se está pintando es el fantasma y no una línea real de `lines`. */
  const isGhost = lines.length === 0;
  const rows: readonly RecipeLineFormValue[] = isGhost ? [GHOST_LINE] : lines;

  function addLineAfter(index: number) {
    // Con el fantasma en pantalla no hay nada que conservar todavía: se materializa y se le
    // añade la segunda, que es lo que el usuario acaba de pedir.
    if (isGhost) {
      onChange([blankLine(), blankLine()]);
      return;
    }
    onChange([...lines.slice(0, index + 1), blankLine(), ...lines.slice(index + 1)]);
  }

  function updateLine(index: number, patch: Partial<RecipeLineFormValue>) {
    // Tocar el fantasma es lo que lo convierte en línea de verdad.
    if (isGhost) {
      onChange([{ ...blankLine(), ...patch }]);
      return;
    }
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  /**
   * Ingredientes ya elegidos en las OTRAS líneas: el selector los ofrece deshabilitados, así que
   * el mismo ingrediente no puede entrar dos veces en la receta. Se deriva en cada render de
   * `lines` -nunca de un conjunto guardado-, para que quitar una línea libere su ingrediente de
   * inmediato.
   */
  function usedProductIds(exceptIndex: number): readonly string[] {
    return rows
      .filter((line, i) => i !== exceptIndex && line.productId !== '')
      .map((line) => line.productId);
  }

  function removeLine(index: number) {
    // El fantasma no está en `lines`: no hay nada que quitar, y su `X` no puede dejar la
    // pantalla sin filas.
    if (isGhost) return;
    onChange(lines.filter((_, i) => i !== index));
  }

  return (
    <section aria-labelledby={headingId} data-testid="recipe-lines-field" className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-medium">
        Ingredientes
      </h2>

      {generalError === undefined ? null : (
        <p role="alert" className="text-sm text-destructive" data-testid="recipe-lines-error">
          {generalError}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((line, index) => {
          const isUnavailable = line.productName === null;
          const lineErrors = errors?.[index];
          const quantityErrorId = `recipe-line-quantity-error-${index}`;

          return (
            <div
              key={line.key}
              data-testid="recipe-line-row"
              className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-start"
            >
              <div
                data-testid={isUnavailable ? `recipe-line-unavailable-${index}` : undefined}
                className="flex flex-col gap-1"
              >
                <Label className="text-sm">Ingrediente</Label>
                <ProductPicker
                  value={line.productId}
                  label={productPickerLabel(line.productName)}
                  ariaLabel={`Ingrediente de la línea ${index + 1}`}
                  onSelect={(option: ProductPickerOption) =>
                    updateLine(index, {
                      productId: option.id,
                      productName: option.name,
                      productUnitId: option.unitId,
                      // La unidad se recalcula EN EL MISMO parche que el ingrediente: si la ya
                      // elegida es de su grupo se mantiene, y si no, se cambia a la mas
                      // pequena del grupo nuevo (`unit-group.ts`).
                      unitId: resolveLineUnitId(units, option.unitId, line.unitId),
                    })
                  }
                  error={lineErrors?.productId}
                  testId={`recipe-line-product-${index}`}
                  initialPage={initialProductPage}
                  excludedIds={usedProductIds(index)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`recipe-line-quantity-input-${index}`} className="text-sm">
                  Cantidad
                </Label>
                <Input
                  id={`recipe-line-quantity-input-${index}`}
                  type="number"
                  step="any"
                  min="0"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
                  aria-invalid={lineErrors?.quantity === undefined ? undefined : true}
                  aria-describedby={lineErrors?.quantity === undefined ? undefined : quantityErrorId}
                  data-testid={`recipe-line-quantity-${index}`}
                />
                {lineErrors?.quantity === undefined ? null : (
                  <p
                    id={quantityErrorId}
                    className="text-sm text-destructive"
                    data-testid={`recipe-line-quantity-error-${index}`}
                  >
                    {lineErrors.quantity}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-sm">Unidad</Label>
                <UnitPicker
                  units={unitsOfGroup(units, line.productUnitId)}
                  value={line.unitId}
                  onChange={(unitId) => updateLine(index, { unitId })}
                  label={line.productId === '' ? 'Elige un ingrediente' : 'Elegir unidad'}
                  error={lineErrors?.unitId}
                  testId={`recipe-line-unit-${index}`}
                  disabled={line.productId === ''}
                />
              </div>

              <div className="flex gap-1 self-start sm:mt-6">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={TOUCH_TARGET}
                  aria-label={`Quitar línea ${index + 1}`}
                  data-testid={`recipe-line-remove-${index}`}
                  onClick={() => removeLine(index)}
                >
                  <XIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={TOUCH_TARGET}
                  aria-label={`Añadir una línea después de la ${index + 1}`}
                  data-testid={`recipe-line-add-${index}`}
                  disabled={line.productId === ''}
                  onClick={() => addLineAfter(index)}
                >
                  <PlusIcon aria-hidden />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/*
        Aviso al pie del bloque (R54): existe SOLO mientras `unavailableCount` sea mayor que
        cero -no se pinta y se oculta con una clase, se DEJA DE MONTAR-, y `data-count` lleva el
        numero calculado arriba en este mismo render.
      */}
      {unavailableCount > 0 ? (
        <p
          role="status"
          data-testid="recipe-lines-unavailable-notice"
          data-count={String(unavailableCount)}
          className="text-sm text-muted-foreground"
        >
          {unavailableCount === 1
            ? 'Hay 1 línea con un producto que ya no está disponible.'
            : `Hay ${unavailableCount} líneas con un producto que ya no está disponible.`}
        </p>
      ) : null}
    </section>
  );
}
