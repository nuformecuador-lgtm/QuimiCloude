'use client';

import { PlusIcon, XIcon } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { productDisplayName } from '@/lib/modules/inventario';
import { formatPercentage, sumPercentages } from '@/lib/modules/recetas';
import type { UnitRef } from '@/lib/modules/unidades';

import { ProductPicker, type ProductPickerOption } from './product-picker';
import {
  createLocalKey,
  type RecipeLineErrors,
  type RecipeLineFormValue,
} from './recipe-form-state';

/**
 * Campo de líneas de producto en porcentaje.
 *
 * **Sin unidad**: la línea ya no la lleva, así que no hay ningún selector de unidad en esta
 * pantalla ni columna que lo pinte. El ingrediente elegido se ve como «nombre · unidad»
 * -lo pinta `ProductPicker` a partir de `productUnitId`- cuando el insumo la tiene.
 *
 * **Añadir y quitar líneas, y una receta SIN ninguna se puede llegar a enviar** (aunque el
 * servidor y el propio formulario la rechacen): el botón de quitar no tiene
 * mínimo que respetar.
 *
 * **La fila en blanco de arranque es un FANTASMA, no una línea del estado**: cuando `lines` está
 * vacío se pinta una fila vacía que todavía NO existe en `lines`, y solo se materializa cuando el
 * usuario toca uno de sus dos campos o pulsa su `+`. Nada de filtrar líneas vacías en el
 * payload -esa función no toma decisiones sobre las líneas-.
 *
 * **Un ingrediente no se puede repetir**: cada selector recibe en `excludedIds` los ingredientes
 * ya elegidos en las OTRAS líneas y los aparta de su lista. El de la propia línea nunca se aparta
 * a sí mismo.
 *
 * **Cada fila lleva sus dos acciones, `X` y `+`** (no hay botón de añadir en la cabecera): la `X`
 * quita esa línea -y si era la última, reaparece el fantasma, así que nunca se queda la pantalla
 * sin filas- y el `+` deja la fila donde está y añade otra vacía debajo.
 *
 * **El campo de porcentaje es `type="text"` con `inputMode="decimal"`**:
 * un `type="number"` pinta el separador según la configuración regional del navegador y, en los
 * que usan punto, rechaza la coma -justo lo que impide garantizar «12,50»-. Se aceptan coma y
 * punto al escribir; el esquema del contrato valida lo que llega tras la sustitución que hace
 * `buildRecipePayload`. El valor sigue viajando como CADENA, tal cual lo escribió el usuario: ni
 * `parseFloat(`, ni `Number(`, ni `toFixed(` en ningún punto de este archivo.
 *
 * **El indicador de suma** se calcula en CADA render con `sumPercentages` sobre las
 * líneas reales -el fantasma no suma, porque no está en `lines`- y se pinta al pie del bloque,
 * `role="status"`, `aria-live="polite"`, con `data-complete` para que el test no dependa del
 * copy exacto además de comprobarlo.
 *
 * **Producto dado de baja:** el ÚNICO discriminante es
 * `line.productName === null`. Cuando lo es:
 * - la CELDA de producto de esa línea, y solo esa, lleva
 *   `data-testid="recipe-line-unavailable-<índice>"`;
 * - el bloque cierra con un aviso `role="status"`, `data-testid="recipe-lines-unavailable-notice"`
 *   y `data-count` con el número de líneas afectadas.
 *
 * El número **se calcula en cada render a partir de `lines`** (`lines.filter(...).length`), nunca
 * de un booleano guardado al cargar.
 *
 * **El marcador no deshabilita la línea, no la quita y no impide guardar**: la línea sigue
 * completa en `lines` y `buildRecipePayload` la reenvía intacta porque no conoce `productName`,
 * solo `productId` y `percentage`.
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
  percentage: '',
  productUnitId: null,
};
const FIELD_TEXT = 'text-base';

/** Etiqueta de una unidad por su id: símbolo o, si no tiene, su nombre; `null` si no está en el catálogo. */
function unitLabel(unitId: string, units: readonly UnitRef[]): string | null {
  const unit = units.find((candidate) => candidate.id === unitId);
  return unit === undefined ? null : (unit.symbol ?? unit.name);
}

/**
 * Texto del selector de ingrediente según el estado de la línea. Sin depender del copy en los
 * tests. Con ingrediente elegido y disponible, incluye su unidad -«nombre · unidad»- cuando el
 * insumo la tiene; sin ella -sin lotes o dado de baja- se ve solo el nombre.
 */
function productPickerLabel(
  productName: string | null,
  productUnitId: string | null,
  units: readonly UnitRef[],
): string {
  if (productName === null) return 'Ingrediente no disponible';
  if (productName === '') return 'Buscar ingrediente';
  return productDisplayName(productName, productUnitId === null ? null : unitLabel(productUnitId, units));
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
  const sumId = useId();

  // Derivado en CADA render, nunca cacheado: borrar este `.filter(` tiene que poner el test en
  // rojo, así que no puede sustituirse por un contador guardado en el estado.
  const unavailableCount = lines.filter((line) => line.productName === null).length;

  // La suma se calcula SOLO sobre las líneas reales -el fantasma nunca entra aquí, porque
  // no está en `lines`-, y se recalcula en cada render con la misma función que valida el borde.
  // La MISMA sustitución de coma por punto que hace `buildRecipePayload` -nunca un paso por
  // `number`- porque `sumPercentages` opera sobre el formato del contrato, con punto.
  const total = sumPercentages(lines.map((line) => line.percentage.replace(',', '.')));

  /** Fila vacía recién creada, ya con su clave local. */
  function blankLine(): RecipeLineFormValue {
    return {
      key: createLocalKey('line'),
      productId: '',
      productName: '',
      percentage: '',
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
          const percentageErrorId = `recipe-line-percentage-error-${index}`;

          return (
            <div
              key={line.key}
              data-testid="recipe-line-row"
              className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_auto] sm:items-start"
            >
              <div
                data-testid={isUnavailable ? `recipe-line-unavailable-${index}` : undefined}
                className="flex flex-col gap-1"
              >
                <Label className="text-sm">Ingrediente</Label>
                <ProductPicker
                  value={line.productId}
                  label={productPickerLabel(line.productName, line.productUnitId, units)}
                  ariaLabel={`Ingrediente de la línea ${index + 1}`}
                  onSelect={(option: ProductPickerOption) =>
                    updateLine(index, {
                      productId: option.id,
                      productName: option.name,
                      productUnitId: option.unitId,
                    })
                  }
                  error={lineErrors?.productId}
                  testId={`recipe-line-product-${index}`}
                  initialPage={initialProductPage}
                  excludedIds={usedProductIds(index)}
                  units={units}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`recipe-line-percentage-input-${index}`} className="text-sm">
                  Porcentaje
                </Label>
                <div className="relative">
                  <Input
                    id={`recipe-line-percentage-input-${index}`}
                    type="text"
                    inputMode="decimal"
                    value={line.percentage}
                    onChange={(event) => updateLine(index, { percentage: event.target.value })}
                    className={`${TOUCH_TARGET} ${FIELD_TEXT} pr-7`}
                    aria-invalid={lineErrors?.percentage === undefined ? undefined : true}
                    aria-describedby={
                      lineErrors?.percentage === undefined ? undefined : percentageErrorId
                    }
                    data-testid={`recipe-line-percentage-${index}`}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
                  >
                    %
                  </span>
                </div>
                {lineErrors?.percentage === undefined ? null : (
                  <p
                    id={percentageErrorId}
                    className="text-sm text-destructive"
                    data-testid={`recipe-line-percentage-error-${index}`}
                  >
                    {lineErrors.percentage}
                  </p>
                )}
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
        Indicador de suma: SIEMPRE montado, incluso sin ninguna línea -"Suma: 0,00 % —
        faltan 100,00 %"-. `data-complete` deja al test comprobar el estado sin
        depender del copy exacto, además del copy en sí.
      */}
      <p
        id={sumId}
        role="status"
        aria-live="polite"
        data-testid="recipe-lines-sum"
        data-complete={String(total.isComplete)}
        className="text-sm"
      >
        {sumText(total)}
      </p>

      {/*
        Aviso al pie del bloque: existe SOLO mientras `unavailableCount` sea mayor que cero -no se
        pinta y se oculta con una clase, se DEJA DE MONTAR-, y `data-count` lleva el numero
        calculado arriba en este mismo render.
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

/**
 * Texto exacto del indicador de suma, a partir del resultado de `sumPercentages`.
 * Usa `formatPercentage` -la MISMA función que el resto de la receta- para el separador de coma,
 * nunca un `.replace(` propio que se desincronizaría del resto de la pantalla.
 */
function sumText(total: ReturnType<typeof sumPercentages>): string {
  if (total.isComplete) return `Suma: ${formatPercentage(total.total)} %`;
  const negative = total.difference.startsWith('-');
  const magnitude = negative ? total.difference.slice(1) : total.difference;
  const palabra = negative ? 'sobran' : 'faltan';
  return `Suma: ${formatPercentage(total.total)} % — ${palabra} ${formatPercentage(magnitude)} %`;
}
