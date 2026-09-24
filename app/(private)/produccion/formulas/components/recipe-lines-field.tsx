'use client';

import { PlusIcon, XIcon } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import {
  consumedQuantity,
  formatPercentage,
  percentageToHundredths,
  sumPercentages,
} from '@/lib/modules/recetas';
import type { UnitRef } from '@/lib/modules/unidades';

import { ProductPicker, type ProductPickerOption } from './product-picker';
import {
  createLocalKey,
  type RecipeLineErrors,
  type RecipeLineFormValue,
  type RecipeMachineFormValue,
} from './recipe-form-state';

/**
 * Campo de líneas de producto en porcentaje, sin selector de unidad -el insumo ya trae la suya-.
 * Quitar la última línea no tiene mínimo que respetar: que la suma llegue a 100 % lo exige el
 * formulario que envuelve este campo, no esta pieza. La fila en blanco de arranque es un
 * FANTASMA fuera de `lines` hasta que el usuario la toca. El porcentaje es `type="text"` porque
 * `type="number"` rechaza la coma en los navegadores con configuración regional de punto.
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

/**
 * Texto del selector de ingrediente según el estado de la línea. Sin depender del copy en los
 * tests. Solo el nombre: la unidad ya no se concatena en fórmulas («Hipoclorito · kg» pasa a
 * «Hipoclorito»); el inventario la sigue mostrando. `emptyLabel` distingue el tab de máquinas
 * («Buscar máquina») del de ingredientes.
 */
function productPickerLabel(productName: string | null, emptyLabel = 'Buscar ingrediente'): string {
  if (productName === null) return 'Ingrediente no disponible';
  if (productName === '') return emptyLabel;
  return productName;
}

type LinesTab = 'ingredients' | 'machines';

/**
 * Base de referencia en gramos para la cantidad estimada que acompaña a cada línea: 20 %
 * equivale a 200 g. Es presentación pura -no viaja al payload ni al contrato-.
 */
const REFERENCE_BASE_QUANTITY = '1000';

/** Tope del porcentaje en centésimas (100,00 %). */
const MAX_PERCENTAGE_HUNDREDTHS = BigInt(10000);

/**
 * Deja solo dígitos y UN separador decimal (el primero; el punto se normaliza a coma, que es
 * lo que muestra la pantalla), con hasta 3 enteros y 2 decimales. Los estados intermedios de
 * tecleo (`''`, `'5,'`) pasan tal cual para no romper la escritura.
 */
export function sanitizePercentageInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  if (cleaned === '') return '';
  const separatorIndex = cleaned.search(/[.,]/);
  if (separatorIndex === -1) return cleaned.slice(0, 3);
  const integers = cleaned.slice(0, separatorIndex).replace(/[.,]/g, '').slice(0, 3);
  const fractions = cleaned
    .slice(separatorIndex + 1)
    .replace(/[.,]/g, '')
    .slice(0, 2);
  return fractions === '' ? `${integers},` : `${integers},${fractions}`;
}

/** Centésimas que le quedan a la línea `exceptIndex`: 100,00 % menos la suma de las OTRAS. */
function remainingHundredths(lines: readonly RecipeLineFormValue[], exceptIndex: number): bigint {
  const othersHundredths = lines.reduce((sum, line, i) => {
    if (i === exceptIndex) return sum;
    const hundredths = percentageToHundredths(line.percentage.replace(',', '.'));
    return hundredths === null ? sum : sum + hundredths;
  }, BigInt(0));
  const remaining = MAX_PERCENTAGE_HUNDREDTHS - othersHundredths;
  return remaining < BigInt(0) ? BigInt(0) : remaining;
}

/**
 * Recorta un porcentaje ya saneado al mínimo entre su valor, lo que queda por asignar y
 * 100. Los intermedios (`''`, `'5,'`) y lo que no parsea pasan intactos: el esquema del
 * contrato los valida al guardar. Ej.: otras líneas suman 50 y se escribe 80 → anota 50.
 */
export function clampPercentageToRemaining(sanitized: string, remaining: bigint): string {
  const dotted = sanitized.replace(',', '.');
  const hundredths = percentageToHundredths(dotted);
  if (hundredths === null) return sanitized;
  const cap = remaining < MAX_PERCENTAGE_HUNDREDTHS ? remaining : MAX_PERCENTAGE_HUNDREDTHS;
  if (hundredths <= cap) return sanitized;
  const cappedWhole = cap / BigInt(100);
  const cents = (cap % BigInt(100)).toString().padStart(2, '0');
  // Sin decimales significativos se muestra entero («50» y no «50,00»): es lo que el usuario
  // habría escrito de haber tecleado el tope directamente.
  if (cents === '00') return cappedWhole.toString();
  const trimmed = cents.endsWith('0') ? cents.slice(0, 1) : cents;
  return `${cappedWhole.toString()},${trimmed}`;
}

/**
 * Cantidad estimada sobre la base de referencia para pintar junto al porcentaje («20» →
 * «200»). Vacío si el porcentaje no parsea todavía: el readonly no inventa un cero mientras
 * se está escribiendo.
 */
export function referenceAmountForPercentage(percentage: string): string {
  const dotted = percentage.replace(',', '.');
  if (percentageToHundredths(dotted) === null) return '';
  return consumedQuantity(REFERENCE_BASE_QUANTITY, dotted).replace('.', ',');
}

export type RecipeLinesFieldProps = {
  readonly lines: readonly RecipeLineFormValue[];
  readonly onChange: (lines: readonly RecipeLineFormValue[]) => void;
  readonly units: readonly UnitRef[];
  readonly initialProductPage: {
    readonly items: readonly ProductPickerOption[];
    readonly totalPages: number;
  };
  /**
   * Primera página de MÁQUINAS, ya filtrada por tipo desde la página del formulario. Las
   * máquinas elegidas viajan al payload con `percentage: null` (`buildRecipePayload`).
   */
  readonly initialMachinePage: {
    readonly items: readonly ProductPickerOption[];
    readonly totalPages: number;
  };
  /** Herramientas elegidas: estado del formulario, no de este campo. Exentas de % y de suma. */
  readonly machines: readonly RecipeMachineFormValue[];
  readonly onMachinesChange: (machines: readonly RecipeMachineFormValue[]) => void;
  readonly errors?: RecipeLineErrors;
  readonly generalError?: string;
};

/** Fantasma del tab de máquinas: misma idea que `GHOST_LINE`, sin porcentaje. */
const GHOST_MACHINE: RecipeMachineFormValue = {
  key: 'maquina-en-blanco',
  productId: '',
  productName: '',
};

export function RecipeLinesField({
  lines,
  onChange,
  units,
  initialProductPage,
  initialMachinePage,
  machines,
  onMachinesChange,
  errors,
  generalError,
}: RecipeLinesFieldProps) {
  const headingId = useId();
  const sumId = useId();
  const [activeTab, setActiveTab] = useState<LinesTab>('ingredients');

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
   * Entrada del porcentaje: solo números (saneado) y sin pasarse de lo que queda por asignar
   * ni de 100. Con el fantasma en pantalla no hay otras líneas: el tope es 100.
   */
  function handlePercentageChange(index: number, raw: string) {
    const sanitized = sanitizePercentageInput(raw);
    const remaining = isGhost ? MAX_PERCENTAGE_HUNDREDTHS : remainingHundredths(lines, index);
    updateLine(index, { percentage: clampPercentageToRemaining(sanitized, remaining) });
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

  // --- Tab de herramientas: el mismo ciclo fantasma/materializar del de ingredientes,
  // pero sin porcentaje. Viajan al payload con `percentage: null` (`buildRecipePayload`) y no
  // entran a la suma. Cada lista excluye lo suyo: son tipos disjuntos, así que no comparten
  // `excludedIds` entre tabs.
  const isMachineGhost = machines.length === 0;
  const machineRows: readonly RecipeMachineFormValue[] = isMachineGhost
    ? [GHOST_MACHINE]
    : machines;
  const unavailableMachines = machines.filter((machine) => machine.productName === null).length;

  function blankMachine(): RecipeMachineFormValue {
    return { key: createLocalKey('machine'), productId: '', productName: '' };
  }

  function addMachineAfter(index: number) {
    if (isMachineGhost) {
      onMachinesChange([blankMachine(), blankMachine()]);
      return;
    }
    onMachinesChange([
      ...machines.slice(0, index + 1),
      blankMachine(),
      ...machines.slice(index + 1),
    ]);
  }

  function updateMachine(index: number, patch: Partial<RecipeMachineFormValue>) {
    if (isMachineGhost) {
      onMachinesChange([{ ...blankMachine(), ...patch }]);
      return;
    }
    onMachinesChange(
      machines.map((machine, i) => (i === index ? { ...machine, ...patch } : machine)),
    );
  }

  function removeMachine(index: number) {
    if (isMachineGhost) return;
    onMachinesChange(machines.filter((_, i) => i !== index));
  }

  function usedMachineIds(exceptIndex: number): readonly string[] {
    return machineRows
      .filter((machine, i) => i !== exceptIndex && machine.productId !== '')
      .map((machine) => machine.productId);
  }

  function handleTabChange(value: string) {
    setActiveTab(value === 'machines' ? 'machines' : 'ingredients');
  }

  return (
    <section aria-labelledby={headingId} data-testid="recipe-lines-field" className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-medium">
        Ingredientes y herramientas
      </h2>

      {generalError === undefined ? null : (
        <p role="alert" className="text-sm text-destructive" data-testid="recipe-lines-error">
          {generalError}
        </p>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList aria-label="Líneas de la receta por tipo">
          <TabsTrigger value="ingredients" data-testid="recipe-lines-tab-ingredients">
            Ingredientes
          </TabsTrigger>
          <TabsTrigger value="machines" data-testid="recipe-lines-tab-machines">
            Herramientas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ingredients">
      <div className="flex flex-col gap-4">
        {rows.map((line, index) => {
          const isUnavailable = line.productName === null;
          const lineErrors = errors?.[index];
          const percentageErrorId = `recipe-line-percentage-error-${index}`;

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
                    })
                  }
                  error={lineErrors?.productId}
                  testId={`recipe-line-product-${index}`}
                  initialPage={initialProductPage}
                  excludedIds={usedProductIds(index)}
                  units={units}
                  productType={PRODUCT_TYPES.PRODUCT}
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
                    onChange={(event) => handlePercentageChange(index, event.target.value)}
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

              <div className="flex flex-col gap-1">
                <Label htmlFor={`recipe-line-amount-input-${index}`} className="text-sm">
                  Cantidad (base 1000 g)
                </Label>
                <div className="relative">
                  <Input
                    id={`recipe-line-amount-input-${index}`}
                    type="text"
                    inputMode="decimal"
                    value={referenceAmountForPercentage(line.percentage)}
                    readOnly
                    tabIndex={-1}
                    aria-readonly
                    aria-label={`Cantidad estimada de la línea ${index + 1} sobre base de 1000 gramos`}
                    className={`${TOUCH_TARGET} ${FIELD_TEXT} pr-7`}
                    data-testid={`recipe-line-amount-${index}`}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
                  >
                    g
                  </span>
                </div>
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
                  disabled={line.productId === '' || line.productName === null}
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
        </TabsContent>

        <TabsContent value="machines">
          <div className="flex flex-col gap-4">
            {machineRows.map((machine, index) => {
              const isUnavailable = machine.productName === null;

              return (
                <div
                  key={machine.key}
                  data-testid="recipe-machine-row"
                  className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_auto] sm:items-start"
                >
                  <div
                    data-testid={isUnavailable ? `recipe-machine-unavailable-${index}` : undefined}
                    className="flex flex-col gap-1"
                  >
                    <Label className="text-sm">Herramienta</Label>
                    <ProductPicker
                      value={machine.productId}
                      label={productPickerLabel(machine.productName, 'Buscar herramienta')}
                      ariaLabel={`Herramienta de la línea ${index + 1}`}
                      onSelect={(option: ProductPickerOption) =>
                        updateMachine(index, {
                          productId: option.id,
                          productName: option.name,
                        })
                      }
                      testId={`recipe-machine-product-${index}`}
                      initialPage={initialMachinePage}
                      excludedIds={usedMachineIds(index)}
                      units={units}
                      productType={PRODUCT_TYPES.MACHINE}
                    />
                  </div>

                  <div className="flex gap-1 self-start sm:mt-6">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={TOUCH_TARGET}
                      aria-label={`Quitar herramienta ${index + 1}`}
                      data-testid={`recipe-machine-remove-${index}`}
                      onClick={() => removeMachine(index)}
                    >
                      <XIcon aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={TOUCH_TARGET}
                      aria-label={`Añadir una herramienta después de la ${index + 1}`}
                      data-testid={`recipe-machine-add-${index}`}
                      disabled={machine.productId === '' || machine.productName === null}
                      onClick={() => addMachineAfter(index)}
                    >
                      <PlusIcon aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {unavailableMachines > 0 ? (
            <p
              role="status"
              data-testid="recipe-machines-unavailable-notice"
              data-count={String(unavailableMachines)}
              className="text-sm text-muted-foreground"
            >
              {unavailableMachines === 1
                ? 'Hay 1 herramienta que ya no está disponible.'
                : `Hay ${unavailableMachines} herramientas que ya no están disponibles.`}
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
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
  // El clamp del input impide pasarse de 100 por pantalla, así que el «sobran» se retiró: solo
  // se informa lo que falta. Si un dato precargado trajera más de 100, se muestra la suma sin
  // palabra en vez de reintroducir el texto retirado.
  if (total.difference.startsWith('-')) return `Suma: ${formatPercentage(total.total)} %`;
  return `Suma: ${formatPercentage(total.total)} % — faltan ${formatPercentage(total.difference)} %`;
}
