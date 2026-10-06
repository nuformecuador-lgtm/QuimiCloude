// QC-67 T6 — Las acciones de fila de un usuario: R6 (mitad cliente), R8, R32, R40 y R41.
//
// **La mitad que aqui se prueba es la de la INTERFAZ**: sin `usuarios.modificar` no se emite ni un
// nodo. La otra mitad —que el service rechaza igual aunque alguien llame a la action— vive en los
// tests del modulo: ocultar es comodidad, no autorizacion, y R6 lo dice con esas palabras para que
// las dos mitades sean exigibles por separado.
//
// **Migrado al menu "de los 3 puntos" por decision humana puntual de esta pantalla** (ver el
// comentario de cabecera de `user-row-actions.tsx`): las tres acciones ya no son tres botones en
// linea, sino items de `RowActionsMenu` que aparecen al abrir su disparador. R40 se prueba ahora
// en DOS mitades: el disparador esta siempre presente y mide 44x44 px sin ninguna interaccion
// previa (eso no cambio), y las tres acciones solo llegan al arbol tras abrirlo con un clic.
//
// **Los items se localizan por ROL ARIA y por su nombre accesible** (R41), tomado de las constantes
// exportadas: ningun literal de copy en este archivo. Por decision humana puntual (2026-10-04) los
// items dicen solo el verbo; el nombre del usuario queda en el disparador.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  USER_ACTION_DELETE_TESTID,
  USER_ACTION_EDIT_TESTID,
  USER_ACTION_STATUS_TESTID,
  USER_ROW_ACTIONS_TESTID,
  CHANGE_USER_STATUS_ACTION_LABEL,
  DELETE_USER_ACTION_LABEL,
  EDIT_USER_ACTION_LABEL,
  UserRowActions,
  endUserSessionsLabel,
} from '@/app/(private)/configuracion/usuarios/components';
import { USER_ACCOUNT_STATUSES, type UserRow } from '@/lib/modules/identity';

const USUARIO: UserRow = {
  id: '33333333-3333-4333-8333-333333333333',
  displayName: 'Lopez Rivera Ana Maria',
  username: 'ana.lopez',
  email: 'ana.lopez@ejemplo.test',
  roleName: 'Administrador',
  accountStatus: USER_ACCOUNT_STATUSES[0],
};

/** Objetivo tactil minimo que exige R40: 44x44 px, que en Tailwind es `min-h-11 min-w-11`. */
const CLASES_TACTILES = ['min-h-11', 'min-w-11'] as const;

/** Abre el menu pulsando su disparador. Mismo patron que `data-table.test.tsx` para este primitivo. */
function abrirMenu(): void {
  fireEvent.click(screen.getByTestId(USER_ROW_ACTIONS_TESTID));
}

afterEach(() => {
  cleanup();
});

describe('sin `usuarios.modificar` la celda no emite NADA (R6)', () => {
  it('ni disparador, ni menu, ni texto: el DOM queda vacio', () => {
    const { container } = render(<UserRowActions user={USUARIO} canModify={false} />);

    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId(USER_ROW_ACTIONS_TESTID)).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('tampoco hay nada deshabilitado ni explicacion de por que no hay acciones', () => {
    const { container } = render(<UserRowActions user={USUARIO} canModify={false} />);

    expect(document.querySelectorAll('[disabled]')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-disabled]')).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
    // Y no queda ni una etiqueta residual que nombre al usuario: la celda esta VACIA.
    expect(container.textContent).toBe('');
  });
});

describe('con `usuarios.modificar` el disparador esta SIEMPRE en el DOM (R6, R40)', () => {
  it('el disparador existe sin interaccion previa y nombra al usuario sobre el que actua', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    const disparador = screen.getByTestId(USER_ROW_ACTIONS_TESTID);
    expect(disparador).toBeInTheDocument();
    expect(disparador).toHaveAccessibleName(expect.stringContaining(USUARIO.displayName));
  });

  it('el disparador mide al menos 44x44 px', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    const disparador = screen.getByTestId(USER_ROW_ACTIONS_TESTID);
    for (const clase of CLASES_TACTILES) {
      expect(disparador.className, `disparador sin ${clase}`).toContain(clase);
    }
  });

  it('antes de abrirlo, ninguna de las tres acciones esta en el DOM', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    expect(screen.queryByTestId(USER_ACTION_EDIT_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_ACTION_STATUS_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_ACTION_DELETE_TESTID)).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('no depende de `:hover`: nada en su clase condiciona la visibilidad al puntero', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    const disparador = screen.getByTestId(USER_ROW_ACTIONS_TESTID);
    expect(disparador.className).not.toContain('group-hover');
    expect(disparador.className).not.toContain('hover:opacity');
  });
});

describe('al abrir el disparador, el menu trae las TRES acciones y ninguna mas (R6, R32, R41)', () => {
  it('editar, cambiar estado y borrar, las tres presentes y ninguna otra', async () => {
    render(<UserRowActions user={USUARIO} canModify />);

    abrirMenu();

    expect(await screen.findByTestId(USER_ACTION_EDIT_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_ACTION_STATUS_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_ACTION_DELETE_TESTID)).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('UNA sola accion para el estado de cuenta: no hay un item por verbo (R32)', async () => {
    render(<UserRowActions user={USUARIO} canModify />);

    abrirMenu();

    // Si alguien tradujera estados a verbos («Activar», «Bloquear»…) habria mas de tres items y
    // el menu estaria decidiendo que transiciones son legales, que es regla de negocio.
    await screen.findByTestId(USER_ACTION_STATUS_TESTID);
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.getAllByTestId(USER_ACTION_STATUS_TESTID)).toHaveLength(1);
  });

  it('R41 — cada accion dice solo su verbo, sin el nombre del usuario', async () => {
    render(<UserRowActions user={USUARIO} canModify />);

    abrirMenu();
    await screen.findByTestId(USER_ACTION_EDIT_TESTID);

    for (const nombre of [
      EDIT_USER_ACTION_LABEL,
      DELETE_USER_ACTION_LABEL,
      CHANGE_USER_STATUS_ACTION_LABEL,
    ]) {
      expect(screen.getByRole('menuitem', { name: nombre })).toBeInTheDocument();
    }
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.textContent).not.toContain(USUARIO.displayName);
    }
  });

  it('QC-101 no anade nada al menu: exactamente las tres acciones de siempre, ninguna de sesiones', async () => {
    render(<UserRowActions user={USUARIO} canModify />);

    abrirMenu();
    await screen.findByTestId(USER_ACTION_EDIT_TESTID);

    expect(
      screen.getAllByRole('menuitem').map((item) => item.getAttribute('data-testid')).sort(),
    ).toEqual([USER_ACTION_DELETE_TESTID, USER_ACTION_EDIT_TESTID, USER_ACTION_STATUS_TESTID].sort());
    // El cierre de sesiones vive en el panel de detalle, nunca en este menu.
    expect(
      screen.queryByRole('menuitem', { name: endUserSessionsLabel(USUARIO.displayName) }),
    ).toBeNull();
  });
});

describe('los items del menu avisan con la fila, y no hacen nada mas (R36)', () => {
  it('cada item invoca SU manejador con el usuario de la fila', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onStatusChange = vi.fn();

    render(
      <UserRowActions
        user={USUARIO}
        canModify
        onEdit={onEdit}
        onDelete={onDelete}
        onStatusChange={onStatusChange}
      />,
    );

    abrirMenu();
    fireEvent.click(await screen.findByTestId(USER_ACTION_EDIT_TESTID));
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(USUARIO);

    // El menu se cierra tras cada seleccion (comportamiento por defecto del primitivo): se
    // reabre para alcanzar el siguiente item.
    abrirMenu();
    fireEvent.click(await screen.findByTestId(USER_ACTION_STATUS_TESTID));
    expect(onStatusChange).toHaveBeenCalledExactlyOnceWith(USUARIO);

    abrirMenu();
    fireEvent.click(await screen.findByTestId(USER_ACTION_DELETE_TESTID));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(USUARIO);
  });

  it('sin manejadores —el panel y los dialogos aun no existen— pulsar no rompe nada', async () => {
    render(<UserRowActions user={USUARIO} canModify />);

    abrirMenu();
    fireEvent.click(await screen.findByTestId(USER_ACTION_EDIT_TESTID));

    abrirMenu();
    fireEvent.click(await screen.findByTestId(USER_ACTION_STATUS_TESTID));

    abrirMenu();
    fireEvent.click(await screen.findByTestId(USER_ACTION_DELETE_TESTID));

    expect(screen.getByTestId(USER_ROW_ACTIONS_TESTID)).toBeInTheDocument();
  });

  it('el disparador lleva el identificador de la fila como DATO, no como texto visible', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    const disparador = screen.getByTestId(USER_ROW_ACTIONS_TESTID);

    expect(disparador).toHaveAttribute('data-user-id', USUARIO.id);
    expect(disparador.textContent).not.toContain(USUARIO.id);
  });
});
