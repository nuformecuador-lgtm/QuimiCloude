'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { ProductView } from '@/lib/modules/inventario';

import { ProductForm } from './product-form';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const CREATE_SUCCESS = 'Producto creado.';
const UPDATE_SUCCESS = 'Producto actualizado.';

/**
 * Panel lateral de alta y edicion (R17, R21, `design.md > 5`).
 *
 * **Panel lateral y no dialogo centrado ni pagina aparte**: decision humana del 2026-09-03. Como
 * no navega a ninguna URL, la lista de detras conserva su pagina y su tamano al cerrarse -que es
 * la segunda mitad de R17- sin que haya que guardarlos en ningun sitio.
 *
 * **Cada panel trae su propio disparador y su propio estado.** Asi la tabla no tiene que
 * coordinar cual fila esta abierta y puede seguir siendo un Server Component (R30).
 *
 * **El contenido se monta solo cuando el panel esta abierto** (lo hace el portal del primitivo):
 * el formulario se crea de cero en cada apertura, asi que la edicion siempre precarga los valores
 * actuales del producto y un intento fallido anterior no deja restos (R19).
 *
 * **R21 vive aqui**: con exito se cierra, se avisa por toast -la region la monta el layout
 * privado (R22)- y se llama a `router.refresh()`, que vuelve a ejecutar el Server Component de la
 * lista con la misma URL. Las actions de QC-20 no revalidan nada y esta ficha no las abre.
 */
export function ProductSheet({ product }: { readonly product?: ProductView }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEdit = product !== undefined;

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
            aria-label={isEdit ? `Editar ${product.name}` : undefined}
            data-testid={isEdit ? 'product-edit-open' : 'product-create-open'}
          />
        }
      >
        {isEdit ? <PencilIcon /> : <PlusIcon />}
        {isEdit ? null : 'Nuevo producto'}
      </SheetTrigger>
      {/*
        `w-full` en angosto y `sm:max-w-md` a partir de ahi: el primitivo trae `w-3/4`, que en un
        telefono deja el formulario en una columna incomoda. `overflow-y-auto` para que el
        desbordamiento vertical lo absorba el panel, y `pb-[env(safe-area-inset-bottom)]` para que
        el ultimo control no quede bajo la barra de gestos de iOS.
      */}
      <SheetContent
        side="right"
        className="w-full overflow-y-auto pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
        data-testid="product-sheet"
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar producto' : 'Nuevo producto'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Cambia los datos del producto. Se guardan todos los campos.'
              : 'Completa los datos del producto.'}
          </SheetDescription>
        </SheetHeader>
        <ProductForm product={product} onSaved={handleSaved} />
      </SheetContent>
    </Sheet>
  );
}
