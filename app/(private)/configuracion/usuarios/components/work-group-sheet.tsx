'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { WorkGroupRow } from '@/lib/modules/identity';

import { WorkGroupForm } from './work-group-form';
import { WorkGroupMembers } from './work-group-members';

/**
 * El panel lateral del alta y de la edicion de un grupo de trabajo (R20, R25, R35;
 * `design.md > 5`).
 *
 * **Panel lateral, y no dialogo modal centrado ni pagina aparte** (R20, decision cerrada 4). Como
 * no navega a ninguna URL, la lista de detras conserva **pagina, tamano, orden, busqueda y
 * pestana** al cerrarse —la segunda mitad de R20— sin que haya que guardarlos en ningun sitio: los
 * parametros de lista viven en la cadena de consulta y el `tab` viaja con ellos.
 *
 * **UN SOLO panel para los dos modos.** Quien decide cual esta abierto y sobre quien es
 * `work-group-table.tsx`, que monta **una** instancia para toda la pagina:
 *
 *   - **Alta** (`group === null`): solo el formulario del nombre. **Sin lista de miembros**,
 *     porque el grupo todavia no existe y no hay identificador al que anadir a nadie. Meter gente
 *     es abrir el panel otra vez sobre el grupo ya creado.
 *   - **Edicion** (`group !== null`): el formulario **precargado con `group.name`** y, debajo, el
 *     bloque de miembros.
 *
 * **Aqui NO hay una segunda lectura de ficha**, a diferencia de `user-sheet.tsx`: la fila trae
 * `{ id, name }` y el formulario necesita `name`. **QC-84 no publica ninguna consulta de grupo
 * individual** y esta ficha no la echa de menos —inventarla seria backend (R36)—.
 *
 * **R35 vive aqui para el nombre**: con exito se cierra, se avisa por toast —sobre el `<Toaster />`
 * que el layout privado ya monta; **no se monta otro**— y se llama a `router.refresh()`, que
 * reejecuta el Server Component de la lista con la MISMA URL, asi que ni la pestana ni los
 * parametros se pierden. **No hay `revalidatePath`**: las actions de QC-84 no revalidan nada y
 * esta ficha no las toca (R36).
 *
 * El aviso de meter o sacar a una persona lo emite `work-group-members.tsx`, que es quien conoce
 * el resultado de esas dos operaciones y quien vuelve a pedir su lista (R30).
 */

export const WORK_GROUP_SHEET_TESTID = 'work-group-sheet';

const CREATE_TITLE = 'Nuevo grupo';
const EDIT_TITLE = 'Editar grupo';
const CREATE_DESCRIPTION = 'Ponle nombre al grupo de trabajo.';
const EDIT_DESCRIPTION = 'Cambia el nombre del grupo y gestiona sus miembros.';
const CREATE_SUCCESS = 'Grupo creado.';
const UPDATE_SUCCESS = 'Grupo actualizado.';

export type WorkGroupSheetProps = {
  /** La fila que se edita, o `null` en el alta. Del alta solo se sabe que no tiene sujeto. */
  readonly group: WorkGroupRow | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function WorkGroupSheet({ group, open, onOpenChange }: WorkGroupSheetProps) {
  const router = useRouter();
  const isEdit = group !== null;

  const handleSaved = useCallback(() => {
    // R35, en este orden: cerrar, avisar y poner la lista al dia sin recargar la pantalla.
    onOpenChange(false);
    toast.success(isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS);
    // Ni `push` ni `replace`: `refresh` reejecuta el Server Component con la MISMA URL, asi que
    // pagina, tamano, orden, busqueda y pestana siguen siendo los de antes de abrir (R20, R35).
    router.refresh();
  }, [isEdit, onOpenChange, router]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
        data-testid={WORK_GROUP_SHEET_TESTID}
        data-mode={isEdit ? 'edit' : 'create'}
        data-work-group-id={group?.id ?? ''}
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? EDIT_TITLE : CREATE_TITLE}</SheetTitle>
          <SheetDescription>{isEdit ? EDIT_DESCRIPTION : CREATE_DESCRIPTION}</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          <WorkGroupForm group={group} onSaved={handleSaved} />
          {/* El alta no monta el bloque de miembros: no hay grupo al que anadir a nadie. */}
          {group === null ? null : <WorkGroupMembers workGroupId={group.id} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
