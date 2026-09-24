'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import type { SupplierView } from '@/lib/modules/proveedores';

import { SupplierForm } from './supplier-form';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const CREATE_LABEL = 'Nuevo proveedor';
const CREATE_SUCCESS = 'Proveedor creado.';
const UPDATE_SUCCESS = 'Proveedor actualizado.';

/**
 * Panel lateral de alta y edicion de proveedor (R26, R33, R34, `design.md > 7`).
 *
 * **Panel lateral, y no dialogo modal centrado ni pagina aparte** (R26, decision humana del
 * 2026-09-04). Como no navega a ninguna URL, la lista de detras conserva su pagina y su tamano
 * al cerrarse —la segunda mitad de R26— sin que haya que guardarlos en ningun sitio: el estado
 * de lista vive en la cadena de consulta (`design.md > 5.1`).
 *
 * **Cada panel trae su propio disparador y su propio estado.** Asi la tabla no tiene que
 * coordinar cual fila esta abierta y puede seguir siendo un Server Component (R46).
 *
 * **El contenido se monta solo cuando el panel esta abierto** (lo hace el portal del primitivo):
 * el formulario se crea de cero en cada apertura, asi que la edicion siempre precarga los valores
 * actuales del proveedor (R28) y un intento fallido anterior no deja restos.
 *
 * **El panel lo pinta `SupplierForm`, no este archivo.** Desde que el panel entero es un `<form>`
 * (`SheetContent isForm`), la cabecera, el cuerpo y el pie con el boton de guardar son partes del
 * mismo formulario, y quien tiene la `action` es `SupplierForm`. Aqui quedan el disparador, el
 * estado de apertura y el cierre.
 *
 * **R33 vive aqui**: con exito se cierra, se avisa por toast —la region la monta el layout
 * privado y **no se monta otra** (R34)— y se llama a `router.refresh()`, que vuelve a ejecutar el
 * Server Component de la lista con la MISMA URL. **No hay `revalidatePath`**: exigiria abrir
 * `lib/modules/proveedores/adapters/driving/`, que R49 prohibe; las propias actions de QC-43
 * dejaron escrito que «QC-44 decide que revalida», y lo decide aqui, en la pantalla.
 */
export function SupplierSheet({ supplier }: { readonly supplier?: SupplierView }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEdit = supplier !== undefined;

  const handleSaved = useCallback(() => {
    setOpen(false);
    toast.success(isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS);
    router.refresh();
  }, [isEdit, router]);

  return (
    <Sheet open={open} onOpenChange={(next) => setOpen(next)}>
      <SheetTrigger
        render={
          <Button
            variant={isEdit ? 'ghost' : 'default'}
            className={TOUCH_TARGET}
            aria-label={isEdit ? `Editar ${supplier.name}` : undefined}
            data-testid={isEdit ? 'supplier-edit-open' : 'supplier-create-open'}
          />
        }
      >
        {isEdit ? <PencilIcon /> : <PlusIcon />}
        {isEdit ? null : CREATE_LABEL}
      </SheetTrigger>
      <SupplierForm supplier={supplier} onSaved={handleSaved} />
    </Sheet>
  );
}
