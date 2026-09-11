// QC-67 T6 — Las acciones de fila de un usuario: R6 (mitad cliente), R8, R32, R40 y R41.
//
// **La mitad que aqui se prueba es la de la INTERFAZ**: sin `usuarios.modificar` no se emite ni un
// nodo. La otra mitad —que el service rechaza igual aunque alguien llame a la action— vive en los
// tests del modulo: ocultar es comodidad, no autorizacion, y R6 lo dice con esas palabras para que
// las dos mitades sean exigibles por separado.
//
// **Los botones se localizan por ROL ARIA y por su nombre accesible compuesto** (R41), con las
// mismas funciones que los componen (`editUserLabel`, `deleteUserLabel`, `changeUserStatusLabel`):
// unica fuente de ese texto, y por tanto ningun literal de copy en este archivo.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  USER_ACTION_DELETE_TESTID,
  USER_ACTION_EDIT_TESTID,
  USER_ACTION_STATUS_TESTID,
  USER_ROW_ACTIONS_TESTID,
  UserRowActions,
  changeUserStatusLabel,
  deleteUserLabel,
  editUserLabel,
} from '@/app/(private)/configuracion/usuarios/components';
import { USER_ACCOUNT_STATUSES, type UserRow } from '@/lib/modules/identity';

import { setupUser } from '../../helpers/user-event';

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

afterEach(() => {
  cleanup();
});

describe('sin `usuarios.modificar` la celda no emite NADA (R6)', () => {
  it('ni contenedor, ni botones, ni texto: el DOM queda vacio', () => {
    const { container } = render(<UserRowActions user={USUARIO} canModify={false} />);

    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId(USER_ROW_ACTIONS_TESTID)).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('tampoco hay botones DESHABILITADOS ni explicacion de por que no hay acciones', () => {
    const { container } = render(<UserRowActions user={USUARIO} canModify={false} />);

    expect(document.querySelectorAll('[disabled]')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-disabled]')).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
    // Y no queda ni una etiqueta residual que nombre al usuario: la celda esta VACIA.
    expect(container.textContent).toBe('');
  });
});

describe('con `usuarios.modificar` hay TRES acciones, siempre en el DOM (R6, R32, R40)', () => {
  it('editar, cambiar estado y borrar, las tres presentes sin interaccion previa', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    expect(screen.getByTestId(USER_ACTION_EDIT_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_ACTION_STATUS_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_ACTION_DELETE_TESTID)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('UNA sola accion para el estado de cuenta: no hay un boton por verbo (R32)', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    // Si alguien tradujera estados a verbos («Activar», «Bloquear»…) habria mas de tres botones y
    // la pantalla estaria decidiendo que transiciones son legales, que es regla de negocio.
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getAllByTestId(USER_ACTION_STATUS_TESTID)).toHaveLength(1);
  });

  it('cada accion NOMBRA al usuario sobre el que actua (R41)', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    expect(
      screen.getByRole('button', { name: editUserLabel(USUARIO.displayName) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: deleteUserLabel(USUARIO.displayName) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: changeUserStatusLabel(USUARIO.displayName) }),
    ).toBeInTheDocument();
  });

  it('cada control mide al menos 44x44 px (R40)', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    for (const boton of screen.getAllByRole('button')) {
      for (const clase of CLASES_TACTILES) {
        expect(boton.className, `${boton.getAttribute('data-testid')} sin ${clase}`).toContain(
          clase,
        );
      }
    }
  });

  it('nada se descubre con `:hover` ni vive en un desplegable fuera del DOM (R40)', () => {
    const { container } = render(<UserRowActions user={USUARIO} canModify />);

    // Las tres acciones estan en el arbol desde el primer render: no hay disparador de menu que
    // las esconda, ni clase de visibilidad condicionada al puntero.
    expect(container.querySelectorAll('button')).toHaveLength(3);
    expect(container.innerHTML).not.toContain('group-hover');
    expect(container.innerHTML).not.toContain('hover:opacity');
  });
});

describe('los disparadores avisan con la fila, y no hacen nada mas (R36)', () => {
  it('cada boton invoca SU manejador con el usuario de la fila', async () => {
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

    const usuario = setupUser();

    await usuario.click(screen.getByTestId(USER_ACTION_EDIT_TESTID));
    await usuario.click(screen.getByTestId(USER_ACTION_STATUS_TESTID));
    await usuario.click(screen.getByTestId(USER_ACTION_DELETE_TESTID));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(USUARIO);
    expect(onStatusChange).toHaveBeenCalledExactlyOnceWith(USUARIO);
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(USUARIO);
  });

  it('sin manejadores —el panel y los dialogos aun no existen— pulsar no rompe nada', async () => {
    render(<UserRowActions user={USUARIO} canModify />);

    // T9, T10 y T11 enchufaran los tres manejadores sin reescribir este componente; hasta
    // entonces, los disparadores existen y no revientan.
    const usuario = setupUser();

    for (const boton of screen.getAllByRole('button')) {
      await usuario.click(boton);
    }

    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('la celda lleva el identificador de la fila como DATO, no como texto visible', () => {
    render(<UserRowActions user={USUARIO} canModify />);

    const celda = screen.getByTestId(USER_ROW_ACTIONS_TESTID);

    expect(celda).toHaveAttribute('data-user-id', USUARIO.id);
    expect(celda.textContent).not.toContain(USUARIO.id);
  });
});
