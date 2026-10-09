'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ErrorAlert } from '@/components/shared/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ErrorState } from '@/lib/modules/errores';
import type { RoleOption, UserDetail, UserRow } from '@/lib/modules/identity';
import { getUserAction } from '@/lib/modules/identity/adapters/driving/user-actions';

import { EndUserSessionsDialog } from './end-user-sessions-dialog';
import { USER_SHEET_TESTID, UserForm, type UserFormEndSessions } from './user-form';

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
 *
 * **QC-101: el cierre de TODAS las sesiones de la persona del panel** (R7, R11, R12, R16;
 * `design.md > 2`). Este panel es el dueno del estado de su dialogo, igual que la tabla lo es de
 * los suyos: decide SI se ofrece, entrega a `UserForm` el disparador solo entonces, y monta
 * `EndUserSessionsDialog` solo mientras esta abierto. El dialogo cuelga de la raiz del `Sheet` —asi
 * el primitivo lo reconoce como dialogo anidado— pero **fuera** del `<form>` de edicion, y su
 * contenido va en portal: su propio `<form>` no se anida en el del panel. Todo llega por props
 * (R16): aqui no se lee la sesion ni se importa la composicion.
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
  /**
   * El identificador del actor de la sesion, o `null` sin sesion (QC-101 R12, R16). Lo resolvio la
   * pagina en el servidor y baja por props: este componente no lee la sesion.
   */
  readonly currentUserId: string | null;
  /** El catalogo de roles (R24) y su error, bajados por props desde el servidor (R8). */
  readonly roles: readonly RoleOption[];
  readonly rolesError: ErrorState | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function UserSheet({
  user,
  currentUserId,
  roles,
  rolesError,
  open,
  onOpenChange,
}: UserSheetProps) {
  const router = useRouter();
  const isEdit = user !== null;
  const userId = user?.id;
  const [detail, setDetail] = useState<DetailState>({ status: 'loading' });
  const [endSessionsOpen, setEndSessionsOpen] = useState(false);

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

  const openEndSessions = useCallback(() => setEndSessionsOpen(true), []);

  /**
   * QC-101 R11 y R12: el cierre de sesiones se ofrece SOLO sobre otra persona con la cuenta
   * `active`. Sin cumplirse, el disparador no existe en el DOM —ni deshabilitado ni explicado—.
   *
   * **Es la SEGUNDA barrera contra «uno mismo», a proposito** (`design.md > 3`, alternativa C). La
   * primera es que el actor no aparece en su propia lista (`list-users.ts:73`, `excludeUserId`
   * obligatorio), asi que hoy `user.id === currentUserId` no llega a pasar. Esta comparacion existe
   * para que la regla de ESTA pantalla este escrita donde se lee y tenga test, en vez de colgar de
   * una invariante de otra feature que podria cambiar sin poner nada en rojo.
   *
   * Ocultar no es autorizar: quien decide si se puede es `end-all-sessions.ts`, en el service.
   */
  const endSessions: UserFormEndSessions | undefined =
    user !== null && user.accountStatus === 'active' && user.id !== currentUserId
      ? { displayName: user.displayName, onEndSessions: openEndSessions }
      : undefined;

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
          endSessions={endSessions}
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
              // Con error NO se pinta un formulario con campos en blanco.
              <ErrorAlert
                error={shown.error}
                className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
                testId={USER_SHEET_ERROR_TESTID}
                withDataCode
                renderCatalogued={(catalogued) => (
                  <>
                    <p>{catalogued.message}</p>
                    <p className="text-xs" data-testid={USER_SHEET_ERROR_CODE_TESTID}>
                      {catalogued.code}
                    </p>
                  </>
                )}
              />
            )}
          </div>
        </SheetContent>
      )}

      {/*
        QC-101: una instancia, y solo mientras esta abierta, para que un rechazo anterior no
        reaparezca. Hermana de `UserForm` y NO hija suya: fuera del `<form>` de edicion.
      */}
      {user !== null && endSessions !== undefined && endSessionsOpen ? (
        <EndUserSessionsDialog user={user} open onOpenChange={setEndSessionsOpen} />
      ) : null}
    </Sheet>
  );
}
