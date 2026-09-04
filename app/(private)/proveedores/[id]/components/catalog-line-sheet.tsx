'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import type { CatalogLineView } from '@/lib/modules/proveedores';
import type { UnitRef } from '@/lib/modules/unidades';

import { CatalogLineForm } from './catalog-line-form';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const CREATE_LABEL = 'Nueva línea';
const CREATE_SUCCESS = 'Línea de catálogo creada.';
const UPDATE_SUCCESS = 'Línea de catálogo actualizada.';

type CatalogLineSheetProps = {
  /** Proveedor dueno del catalogo. Sale de la URL de la pagina de detalle, no de un formulario. */
  readonly supplierId: string;
  /** Linea que se edita. Ausente en el alta (R29). */
  readonly line?: CatalogLineView;
  /** Unidades existentes, pedidas UNA vez en el servidor y bajadas por props (R46). */
  readonly units: readonly UnitRef[];
};

/**
 * Panel lateral de alta y edicion de una linea de catalogo (R26, R33, R34; `design.md > 7`).
 *
 * **Panel lateral, y no dialogo modal centrado ni pagina aparte** (R26, decision humana del
 * 2026-09-04). Como no navega a ninguna URL, el catalogo de detras conserva su pagina y su tamano
 * al cerrarse -la segunda mitad de R26- sin que haya que guardarlos en ningun sitio: el estado de
 * lista vive en la cadena de consulta (`design.md > 6.1`).
 *
 * **Cada panel trae su propio disparador y su propio estado.** Asi la tabla del catalogo no tiene
 * que coordinar cual fila esta abierta y puede seguir sin frontera de cliente: recibe este
 * componente por el slot `rowActions`.
 *
 * **El contenido se monta solo cuando el panel esta abierto** (lo hace el portal del primitivo):
 * el formulario se crea de cero en cada apertura, asi que la edicion siempre precarga los valores
 * actuales de la linea (R31) y un intento fallido anterior no deja restos.
 *
 * **R33 vive aqui**: con exito se cierra, se avisa por toast -la region la monta el layout
 * privado y **no se monta otra** (R34)- y se llama a `router.refresh()`, que vuelve a ejecutar el
 * Server Component del catalogo con la MISMA URL. **No hay `revalidatePath`**: exigiria abrir
 * `lib/modules/proveedores/adapters/driving/`, que R49 prohibe; las propias actions de QC-43
 * dejaron escrito que «QC-44 decide que revalida», y lo decide aqui, en la pantalla.
 */
export function CatalogLineSheet({ supplierId, line, units }: CatalogLineSheetProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEdit = line !== undefined;

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
            aria-label={isEdit ? `Editar ${line.name}` : undefined}
            data-testid={isEdit ? 'catalog-line-edit-open' : 'catalog-line-create-open'}
          />
        }
      >
        {isEdit ? <PencilIcon /> : <PlusIcon />}
        {isEdit ? null : CREATE_LABEL}
      </SheetTrigger>
      <CatalogLineForm
        supplierId={supplierId}
        line={line}
        units={units}
        onSaved={handleSaved}
      />
    </Sheet>
  );
}
