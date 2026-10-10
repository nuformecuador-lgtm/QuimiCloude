'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { navModuleKey } from '@/lib/shared/navigation/nav-module';

// --dur-slow (300 ms) más el retardo del último bloque (120 ms).
export const SCREEN_ENTER_MS = 420;

function ScreenEnterFrame({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setActive(false), SCREEN_ENTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div data-screen-enter={active ? '' : undefined} className="contents">
      {children}
    </div>
  );
}

/**
 * Entrada de pantalla al cambiar de módulo. La `key` es la clave del módulo: cambiar de módulo
 * remonta el marco y vuelve a poner el atributo; navegar dentro del mismo módulo no lo remonta, y
 * como el atributo ya se quitó, lo que se inserte después no se anima.
 */
export function ScreenEnter({
  hrefs,
  children,
}: {
  hrefs: readonly string[];
  children: ReactNode;
}) {
  // Fuera del App Router (tests que no lo simulan) `usePathname` devuelve null.
  const pathname = usePathname() ?? '';
  return <ScreenEnterFrame key={navModuleKey(pathname, hrefs)}>{children}</ScreenEnterFrame>;
}
