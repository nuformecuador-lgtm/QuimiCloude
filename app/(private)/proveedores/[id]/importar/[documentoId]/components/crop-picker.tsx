'use client';

import { useState } from 'react';

import { EntityImage } from '@/components/shared/entity-image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { CatalogImportPreviewCrop } from '@/lib/modules/documentos';

const TOUCH_TARGET = 'min-h-11 min-w-11';

type CropPickerProps = {
  /** Todos los recortes del archivo, sin acotar a los que ya se emparejaron con alguna fila (R24). */
  readonly crops: readonly CatalogImportPreviewCrop[];
  readonly selectedPath: string | null;
  readonly onPick: (path: string) => void;
  readonly triggerTestId: string;
};

/**
 * Selector de un recorte del archivo para asignarlo a una fila (R24). Vive en un dialogo, no en
 * linea, porque una fila ya tiene once controles y una cuadricula de miniaturas no cabe al lado.
 *
 * Cada opcion es su propio boton, alcanzable sin `hover` y de al menos 44 px (R37).
 */
export function CropPicker({ crops, selectedPath, onPick, triggerTestId }: CropPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={TOUCH_TARGET}
            disabled={crops.length === 0}
            data-testid={triggerTestId}
          />
        }
      >
        Cambiar
      </DialogTrigger>
      <DialogContent data-testid="crop-picker-dialog">
        <DialogHeader>
          <DialogTitle>Elige una imagen del archivo</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {crops.map((crop) => (
            <button
              key={crop.path}
              type="button"
              className={`${TOUCH_TARGET} rounded-md border p-1 ${
                crop.path === selectedPath ? 'border-primary' : 'border-transparent'
              }`}
              onClick={() => {
                onPick(crop.path);
                setOpen(false);
              }}
              data-testid={`crop-picker-option-${crop.path}`}
            >
              <EntityImage path={crop.url} name="Recorte del archivo" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
