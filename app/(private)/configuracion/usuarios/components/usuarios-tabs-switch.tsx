'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { USUARIOS_TABS, isUsuariosTab, usuariosTabHref, type UsuariosTab } from './usuarios-tabs';
import { USUARIOS_TABS_LABEL, USUARIOS_TAB_LABELS } from './work-group-labels';

/**
 * El conmutador de las dos pestanas de la pantalla de usuarios (R1, R3, R40; `design.md > 3`).
 *
 * **Solo emite; el servidor decide que se pinta.** Este componente **no renderiza el contenido de
 * ninguna pestana**: activar una es una NAVEGACION (`router.push`), y quien resuelve la pestana
 * vigente y monta una sola seccion es `page.tsx`. Consecuencia buscada (`design.md > 11 B`): la
 * lista de grupos no se consulta para quien nunca abre esa pestana, y `?tab=grupos` compartido por
 * enlace pinta grupos ya en el HTML servido.
 *
 * **El destino sale de `usuariosTabHref`** (R3): ningun archivo de producto incrusta la URL, y el
 * `href` que emite lleva **solo** `tab` (R7).
 *
 * **La primitiva es la de shadcn/ui sobre `@base-ui/react`** (R37), consumida tal cual: de ella
 * salen `role="tablist"`, `role="tab"`, el estado activo y la navegacion con flechas del patron
 * ARIA de pestanas. Aqui no se reimplementa ninguna de las tres.
 *
 * **`onValueChange` y no un `onClick` por disparador** (R40): asi cambiar de pestana con el teclado
 * navega igual que con el dedo o el raton. Nada depende de `:hover` —que en tactil no existe— y
 * cada disparador mide al menos 44x44 px, por encima de los 32 px que la primitiva trae por
 * defecto.
 *
 * **Todo llega por props** (R10): la pestana vigente la resuelve el Server Component padre. Aqui no
 * se lee la sesion, no se importa el punto de composicion y no se llama a ninguna Server Action.
 */

/** `data-testid` del conmutador entero, para que ningun test dependa del copy (R41). */
export const USUARIOS_TABS_TESTID = 'usuarios-tabs';

/**
 * `data-testid` de cada disparador, **exhaustivo por tipo**: si manana apareciera una tercera
 * pestana, este archivo dejaria de compilar en vez de emitir un disparador sin identificador (R1).
 */
export const USUARIOS_TAB_TESTIDS: Readonly<Record<UsuariosTab, string>> = {
  personas: 'usuarios-tab-personas',
  grupos: 'usuarios-tab-grupos',
};

export type UsuariosTabsSwitchProps = {
  /** La pestana vigente, resuelta en el servidor a partir de la direccion (R1, R2). */
  readonly tab: UsuariosTab;
};

export function UsuariosTabsSwitch({ tab }: UsuariosTabsSwitchProps) {
  const router = useRouter();

  const handleValueChange = useCallback(
    (value: unknown) => {
      // La primitiva tipa el valor como `any`: se estrecha contra la UNICA lista de pestanas antes
      // de navegar, en vez de confiar en el tipo. Y si la pestana no cambia, no se navega: las
      // llamadas automaticas de la primitiva —la seleccion inicial— no tienen que mover la URL.
      const candidate = typeof value === 'string' ? value : undefined;
      if (!isUsuariosTab(candidate) || candidate === tab) return;
      router.push(usuariosTabHref(candidate));
    },
    [router, tab],
  );

  return (
    <Tabs value={tab} onValueChange={handleValueChange}>
      <TabsList
        data-testid={USUARIOS_TABS_TESTID}
        aria-label={USUARIOS_TABS_LABEL}
        className="h-auto w-full max-w-md"
      >
        {USUARIOS_TABS.map((value) => (
          <TabsTrigger
            key={value}
            value={value}
            data-testid={USUARIOS_TAB_TESTIDS[value]}
            className={`h-auto ${touchTarget} px-4 text-base`}
          >
            {USUARIOS_TAB_LABELS[value]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
