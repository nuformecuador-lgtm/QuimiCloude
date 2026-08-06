import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';

/**
 * Layout de las paginas publicas (design.md > 5.3).
 *
 * El `<Toaster />` se monta AQUI y no en el root layout: el root lo comparten todas las
 * zonas y las features 8/9 traeran su propio armazon privado. Cuando una segunda zona lo
 * necesite, se promueve al root en esa feature.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        richColors
        // El toast de error es el unico canal del mensaje de credenciales (design.md > 5.3):
        // duracion larga para mitigar -no cerrar- el hueco de accesibilidad del toast.
        toastOptions={{ duration: 8000 }}
      />
    </>
  );
}
