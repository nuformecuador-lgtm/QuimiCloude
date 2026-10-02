'use client';

import type { ComponentType } from 'react';

import { MoreVerticalIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Menu "de los 3 puntos" para las acciones de una fila: UN disparador siempre presente en el DOM
 * (icono `MoreVerticalIcon`, objetivo tactil de 44x44 px) que abre un `DropdownMenu` con una
 * accion por item.
 *
 * Generico: no conoce ningun dominio (ni usuarios, ni pedidos, ni nada de `lib/modules/`). Cada
 * pantalla decide sus propios `items` (icono, etiqueta, callback) y este componente solo los pinta.
 *
 * Decision humana puntual, pedida por chat y solo para la pantalla de usuarios: agrupar las
 * acciones de fila tras este menu. Esto NO deroga la regla general de que los botones EN LINEA del
 * resto del repo deben seguir siempre visibles y en el DOM, nunca detras de un `:hover` ni de un
 * desplegable que los esconda del arbol -esa regla sigue vigente donde ya se aplicaba-. Lo que
 * cambia aqui es solo que las acciones individuales viven dentro de un menu que se abre con un
 * clic; el disparador en si sigue siempre visible, siempre en el DOM y con su propio objetivo
 * tactil, igual que cualquier otro boton de accion del repo.
 */

/** Objetivo tactil minimo (44x44 px). Los primitivos miden 32 px de alto por defecto. */
const TRIGGER_TOUCH_TARGET = 'min-h-11 min-w-11';

export type RowActionMenuItem = {
  readonly key: string;
  readonly label: string;
  /** Componente de icono de lucide-react, p. ej. `PencilIcon`. */
  readonly icon: ComponentType<{ 'aria-hidden'?: boolean | 'true' | 'false' }>;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  /** `data-testid` de ESTE item del menu. Sin valor, no lleva ninguno. */
  readonly testId?: string;
};

export type RowActionsMenuProps = {
  readonly items: readonly RowActionMenuItem[];
  /** `aria-label` del disparador (los 3 puntos), p. ej. "Acciones de Ana Torres". */
  readonly triggerLabel: string;
  /** `data-testid` del disparador. */
  readonly triggerTestId?: string;
  /**
   * Atributos `data-*` extra para el boton disparador (p. ej. identificar la fila para un
   * localizador E2E). El componente no interpreta su contenido: solo los reenvia.
   */
  readonly triggerDataAttributes?: Readonly<Record<`data-${string}`, string>>;
};

/** Sin items no hay nada que ofrecer: ni disparador, ni menu vacio. */
export function RowActionsMenu({
  items,
  triggerLabel,
  triggerTestId,
  triggerDataAttributes,
}: RowActionsMenuProps) {
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={TRIGGER_TOUCH_TARGET}
            aria-label={triggerLabel}
            data-testid={triggerTestId}
            {...triggerDataAttributes}
          />
        }
      >
        <MoreVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[200px]">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.key}
              variant={item.destructive ? 'destructive' : 'default'}
              disabled={item.disabled}
              data-testid={item.testId}
              // El primitivo de Base UI (`components/ui/dropdown-menu.tsx`) expone `onClick`, no
              // `onSelect`: aqui se traduce el callback semantico del item a ese evento.
              onClick={item.onSelect}
            >
              <Icon aria-hidden="true" />
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
