'use client';

import { PlusIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';

import { WorkGroupSheet } from './work-group-sheet';

/**
 * El disparador del alta de grupo de trabajo y el panel que abre.
 *
 * **Vive fuera de la tabla, igual que el alta de personas y por una razon aun mas cruda.** Hasta
 * ahora el boton lo montaba `work-group-table.tsx`, que la seccion solo renderiza cuando la
 * consulta devuelve filas. Pero **los grupos no los siembra nadie**: una instalacion nueva tiene
 * cero, la lista cae siempre en el estado vacio, la tabla no se monta y el boton no existe. El
 * primer grupo era literalmente **imposible** de crear desde la interfaz, y no solo al principio:
 * para siempre, porque la unica via de salir del cero estaba dentro de lo que el cero apagaba.
 *
 * El JSDoc de `work-group-list-empty.tsx` daba por hecho lo contrario —«el disparador del alta ya
 * esta arriba, visible»— y por eso el vacio no ofrece «crea el primero». La premisa era falsa; lo
 * que se arregla es la premisa, no el vacio.
 *
 * **`canModify` decide si se emite, y no es autorizacion** (QC-85 R9, R10): llega por props desde
 * la pagina, que lo resolvio en el servidor. Quien autoriza es el caso de uso del modulo. Aqui no
 * se lee la sesion, no se importa el punto de composicion y no se llama a ninguna Server Action.
 *
 * **El panel se monta SOLO mientras esta abierto**: asi cada apertura arranca en blanco y un
 * rechazo anterior no reaparece.
 */

/** `data-testid` del disparador del alta. Constante para que ningun test dependa del copy (R41). */
export const WORK_GROUP_CREATE_OPEN_TESTID = 'work-group-create-open';

/** El copy del disparador. Ningun test afirma sobre el (R41). */
const CREATE_LABEL = 'Nuevo grupo';

/** Objetivo tactil minimo de R40. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

export type WorkGroupCreateActionProps = {
  /**
   * Si la sesion trae `usuarios.modificar` (R9). **Decision de PRESENTACION**, resuelta en el
   * servidor y bajada por props (R10). Sin el, este componente no emite NADA: ni boton, ni panel.
   */
  readonly canModify: boolean;
};

export function WorkGroupCreateAction({ canModify }: WorkGroupCreateActionProps) {
  const [open, setOpen] = useState(false);

  /** Cerrar es siempre lo mismo: soltar el estado. Estable, para no rearmar el panel. */
  const closePanel = useCallback((next: boolean) => {
    if (!next) setOpen(false);
  }, []);

  if (!canModify) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="default"
          className={TOUCH_TARGET}
          data-testid={WORK_GROUP_CREATE_OPEN_TESTID}
          onClick={() => setOpen(true)}
        >
          <PlusIcon aria-hidden="true" />
          {CREATE_LABEL}
        </Button>
      </div>

      {open ? <WorkGroupSheet group={null} open onOpenChange={closePanel} /> : null}
    </>
  );
}
