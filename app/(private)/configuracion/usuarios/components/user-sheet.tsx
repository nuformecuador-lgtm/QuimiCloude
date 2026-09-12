'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import type { RoleOption, UserDetail, UserRow } from '@/lib/modules/identity';
import { getUserAction } from '@/lib/modules/identity/adapters/driving/user-actions';

import { USER_SHEET_TESTID, UserForm } from './user-form';

/**
 * El panel lateral del alta y de la edicion de usuario (R22, R26, R28, R29; `design.md > 8`).
 *
 * **Panel lateral, y no dialogo modal centrado ni pagina aparte** (R22, decision cerrada del
 * 2026-09-11). Como no navega a ninguna URL, la lista de detras conserva **pagina, tamano, orden,
 * filtro y busqueda** al cerrarse —la segunda mitad de R22— sin que haya que guardarlos en ningun
 * sitio: los parametros de lista viven en la cadena de consulta.
 *
 * **UN SOLO panel para los dos modos.** Sin `user` es el alta; con `user` es la edicion de esa
 * fila. Quien decide cual esta abierto es `user-table.tsx`, que monta **una** instancia para toda
 * la pagina (`design.md > 8`).
 *
 * **La edicion necesita una SEGUNDA lectura** (R26): la fila del listado trae seis claves y el
 * formulario necesita nueve, asi que al abrirse se pide la ficha con `getUserAction(id)` —una
 * Server Action se puede invocar desde un componente de cliente— y el panel tiene **tres estados**:
 * cargando, error y formulario. Con error **no** se pinta un formulario en blanco.
 *
 * **R28 y R29 viven aqui**: con exito se cierra, se avisa por toast —sobre el `<Toaster />` que el
 * layout privado ya monta; **no se monta otro**— y se llama a `router.refresh()`, que reejecuta el
 * Server Component de la lista con la MISMA URL. **No hay `revalidatePath`**: las actions de QC-66
 * no revalidan nada y esta ficha no las toca (R37).
 *
 * El aviso del alta es **neutro** (R28): no anuncia ninguna credencial, ningun enlace para
 * establecer la contrasena y ninguna via de acceso. `createUserAction` devuelve el `id` creado y
 * esta pantalla **lo ignora** a proposito: no hay pagina de detalle a la que navegar.
 */

export const USER_SHEET_LOADING_TESTID = 'user-sheet-loading';
export const USER_SHEET_ERROR_TESTID = 'user-sheet-error';
export const USER_SHEET_ERROR_CODE_TESTID = 'user-sheet-error-code';

const CREATE_SUCCESS = 'Usuario creado.';
const UPDATE_SUCCESS = 'Usuario actualizado.';
const LOADING_TITLE = 'Editar usuario';
const LOADING_DESCRIPTION = 'Cargando los datos de la persona…';

/**
 * Los tres estados del panel en la edicion (R26). El alta no pasa por ninguno: no lee nada.
 *
 * Los dos estados resueltos llevan **el identificador al que pertenecen**: mientras la respuesta
 * no sea la del usuario que se esta editando, lo que se pinta es «cargando». Asi el estado no hay
 * que reiniciarlo desde el efecto —un `setState` sincrono ahi son renders en cascada— y una
 * respuesta que llega tarde no puede pintar la ficha de otra persona.
 */
type DetailState =
  | { status: 'loading' }
  | { status: 'error'; forId: string; error: ErrorState }
  | { status: 'ready'; forId: string; detail: UserDetail };

export type UserSheetProps = {
  /** La fila que se edita, o `null` en el alta. Del alta solo se sabe que no tiene sujeto. */
  readonly user: UserRow | null;
  /** El catalogo de roles (R24) y su error, bajados por props desde el servidor (R8). */
  readonly roles: readonly RoleOption[];
  readonly rolesError: ErrorState | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function UserSheet({ user, roles, rolesError, open, onOpenChange }: UserSheetProps) {
  const router = useRouter();
  const isEdit = user !== null;
  const userId = user?.id;
  const [detail, setDetail] = useState<DetailState>({ status: 'loading' });

  useEffect(() => {
    if (!open || userId === undefined) return;

    let cancelled = false;
    void getUserAction(userId).then((result) => {
      if (cancelled) return;
      // El ErrorState viaja ENTERO, no aplanado a `string`: asi el inesperado conserva su
      // identificador de peticion (QC-71 R17).
      setDetail(
        result.status === 'error'
          ? { status: 'error', forId: userId, error: result }
          : { status: 'ready', forId: userId, detail: result.data },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const handleSaved = useCallback(() => {
    // R29, en este orden: cerrar, avisar y poner la lista al dia sin recargar la pantalla.
    onOpenChange(false);
    toast.success(isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS);
    // Ni `push` ni `replace`: `refresh` reejecuta el Server Component con la MISMA URL, asi que
    // pagina, tamano, orden, filtro y busqueda siguen siendo los de antes de abrir (R22, R29).
    router.refresh();
  }, [isEdit, onOpenChange, router]);

  // Lo que se pinta: la respuesta solo vale si es la del usuario que se esta editando.
  const shown: DetailState =
    detail.status === 'loading' || detail.forId !== userId ? { status: 'loading' } : detail;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {!isEdit || shown.status === 'ready' ? (
        <UserForm
          user={shown.status === 'ready' ? shown.detail : undefined}
          roles={roles}
          rolesError={rolesError}
          onSaved={handleSaved}
        />
      ) : (
        <SheetContent
          side="right"
          className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
          data-testid={USER_SHEET_TESTID}
        >
          <SheetHeader>
            <SheetTitle>{LOADING_TITLE}</SheetTitle>
            <SheetDescription>{LOADING_DESCRIPTION}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {shown.status === 'loading' ? (
              <div
                className="flex flex-col gap-3"
                role="status"
                aria-busy="true"
                data-testid={USER_SHEET_LOADING_TESTID}
              >
                {Array.from({ length: 9 }, (_, index) => (
                  <Skeleton key={index} className="h-11 w-full" />
                ))}
              </div>
            ) : (
              // R26: con error NO se pinta un formulario con campos en blanco.
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
                data-testid={USER_SHEET_ERROR_TESTID}
                data-code={shown.error.code}
              >
                {shown.error.code === UNEXPECTED_ERROR_CODE ? (
                  <UnexpectedErrorNotice state={shown.error} />
                ) : (
                  <>
                    <p>{shown.error.message}</p>
                    <p className="text-xs" data-testid={USER_SHEET_ERROR_CODE_TESTID}>
                      {shown.error.code}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
