'use client';

import { PlusIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { ErrorState } from '@/lib/modules/errores';
import type { RoleOption } from '@/lib/modules/identity';

import { UserSheet } from './user-sheet';

/**
 * El disparador del alta de usuario y el panel que abre.
 *
 * **Vive fuera de la tabla, y ESE es el requisito.** Hasta ahora el boton lo montaba
 * `user-table.tsx`, que la seccion solo renderiza cuando la consulta devuelve filas. El razonamiento
 * que lo justificaba —«siempre existe al menos un usuario, el actor, asi que una lista vacia solo
 * puede ser una busqueda sin resultados»— es FALSO en la instalacion: el listado excluye al actor
 * (QC-66 R35, `list-users.ts`), y una base recien sembrada tiene exactamente un usuario, que es
 * quien esta mirando la pantalla. La lista salia vacia, con el vacio se pintaba `UserListEmpty` en
 * vez de la tabla, y con la tabla se iba el unico camino para crear a nadie: no habia forma de dar
 * de alta al segundo usuario desde la interfaz.
 *
 * Por eso el alta es hermana de los tres estados de la lista y no hija de uno de ellos: **se ofrece
 * haya o no filas**, que es la decision humana del 2026-09-17.
 *
 * **Esto no reabre lo que cerro QC-67 R18.** El estado vacio sigue sin ofrecer «crea el primero»:
 * no dice nada sobre el catalogo, no ha cambiado su copy y no ha ganado ninguna accion. Quien
 * ofrece el alta es la pantalla, siempre y en el mismo sitio, no el vacio.
 *
 * **`canModify` decide si se emite, y no es autorizacion** (QC-67 R6, R8): llega por props desde la
 * pagina, que lo resolvio en el servidor con `assertPermission`. Quien autoriza es el caso de uso
 * del modulo, cuya primera linea es `requirePermission`. Aqui no se lee la sesion, no se importa el
 * punto de composicion y no se llama a ninguna Server Action.
 *
 * **El panel se monta SOLO mientras esta abierto**, igual que los de la tabla (`design.md > 8`):
 * asi cada apertura arranca en blanco y el rechazo de un intento anterior no reaparece.
 */

/** `data-testid` del disparador del alta. Constante para que ningun test dependa del copy (R41). */
export const USER_CREATE_OPEN_TESTID = 'user-create-open';

/** El copy del disparador. Ningun test afirma sobre el (R41). */
const CREATE_LABEL = 'Nuevo usuario';

export type UserCreateActionProps = {
  /**
   * Si la sesion trae `usuarios.modificar` (R6). **Decision de PRESENTACION**, resuelta en el
   * servidor y bajada por props (R8). Sin el, este componente no emite NADA: ni boton, ni panel.
   */
  readonly canModify: boolean;
  /**
   * El identificador del actor de la sesion, o `null` (QC-101 R12, R16). Se transporta hasta el
   * panel, que no ofrece el cierre de sesiones sobre uno mismo.
   */
  readonly currentUserId: string | null;
  /** El catalogo de roles del selector del panel (R24), bajado por props desde el servidor (R8). */
  readonly roles: readonly RoleOption[];
  /** El error de la consulta de roles, o `null`. Degradado declarado de `design.md > 6` (R24). */
  readonly rolesError: ErrorState | null;
};

export function UserCreateAction({
  canModify,
  currentUserId,
  roles,
  rolesError,
}: UserCreateActionProps) {
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
          touch
          data-testid={USER_CREATE_OPEN_TESTID}
          onClick={() => setOpen(true)}
        >
          <PlusIcon aria-hidden="true" />
          {CREATE_LABEL}
        </Button>
      </div>

      {open ? (
        <UserSheet
          user={null}
          currentUserId={currentUserId}
          roles={roles}
          rolesError={rolesError}
          open
          onOpenChange={closePanel}
        />
      ) : null}
    </>
  );
}
