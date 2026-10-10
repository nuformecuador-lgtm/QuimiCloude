// Items enlace de `RowActionsMenu`: con `href` el item es un `<a href>` dentro del menu y navega
// a esa ruta; sin `href` el item sigue siendo el de siempre y solo dispara su callback.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';

const TRIGGER_TESTID = 'recipe-row-actions';
const TRIGGER_LABEL = 'Acciones de Receta base';
const EDIT_LABEL = 'Editar';
const DELETE_LABEL = 'Eliminar';
const EDIT_HREF = '/produccion/formulas/abc/editar';

function abrirMenu(): void {
  fireEvent.click(screen.getByTestId(TRIGGER_TESTID));
}

function itemsConEnlace(onDelete: () => void): RowActionMenuItem[] {
  return [
    { key: 'edit', label: EDIT_LABEL, icon: PencilIcon, href: EDIT_HREF, testId: 'recipe-edit-open' },
    {
      key: 'delete',
      label: DELETE_LABEL,
      icon: Trash2Icon,
      onSelect: onDelete,
      destructive: true,
      testId: 'recipe-delete-open',
    },
  ];
}

afterEach(() => {
  cleanup();
});

describe('item con href', () => {
  it('R21: se pinta como enlace <a> con su href y su testid', () => {
    render(
      <RowActionsMenu items={itemsConEnlace(vi.fn())} triggerLabel={TRIGGER_LABEL} triggerTestId={TRIGGER_TESTID} />,
    );
    abrirMenu();

    const item = screen.getByTestId('recipe-edit-open');
    expect(item.tagName).toBe('A');
    expect(item).toHaveAttribute('href', EDIT_HREF);
    expect(item).toHaveAccessibleName(EDIT_LABEL);
  });

  it('R21: dentro del menu conserva el rol de item de menu, localizable por su nombre', () => {
    render(
      <RowActionsMenu items={itemsConEnlace(vi.fn())} triggerLabel={TRIGGER_LABEL} triggerTestId={TRIGGER_TESTID} />,
    );
    abrirMenu();

    const item = screen.getByRole('menuitem', { name: EDIT_LABEL });
    expect(item).toBe(screen.getByTestId('recipe-edit-open'));
    expect(item.closest('a')).toHaveAttribute('href', EDIT_HREF);
  });

  it('R21: al pulsarlo navega a su ruta (el clic no se cancela)', () => {
    render(
      <RowActionsMenu items={itemsConEnlace(vi.fn())} triggerLabel={TRIGGER_LABEL} triggerTestId={TRIGGER_TESTID} />,
    );
    abrirMenu();

    const item = screen.getByTestId('recipe-edit-open');
    let defaultPrevented: boolean | undefined;
    const escucha = (event: MouseEvent) => {
      defaultPrevented = event.defaultPrevented;
      // jsdom no navega: se corta aqui para no dejar un aviso de navegacion no implementada.
      event.preventDefault();
    };
    document.addEventListener('click', escucha);
    try {
      fireEvent.click(item);
    } finally {
      document.removeEventListener('click', escucha);
    }

    // `next/link` cancela el clic para navegar por el router del cliente; sin router montado no lo
    // hace y el clic llega intacto: el navegador seguiria el `href`.
    expect(defaultPrevented).toBe(false);
  });

  it('R21: si ademas trae onSelect, se llama al pulsarlo', () => {
    const onSelect = vi.fn();
    render(
      <RowActionsMenu
        items={[{ key: 'edit', label: EDIT_LABEL, icon: PencilIcon, href: EDIT_HREF, onSelect, testId: 'edit' }]}
        triggerLabel={TRIGGER_LABEL}
        triggerTestId={TRIGGER_TESTID}
      />,
    );
    abrirMenu();
    const item = screen.getByTestId('edit');
    item.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(item);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('item sin href, igual que siempre', () => {
  it('R21: no es un enlace y al pulsarlo llama a su onSelect', () => {
    const onDelete = vi.fn();
    render(
      <RowActionsMenu items={itemsConEnlace(onDelete)} triggerLabel={TRIGGER_LABEL} triggerTestId={TRIGGER_TESTID} />,
    );
    abrirMenu();

    const item = screen.getByRole('menuitem', { name: DELETE_LABEL });
    expect(item).toBe(screen.getByTestId('recipe-delete-open'));
    expect(item.tagName).not.toBe('A');
    expect(item).not.toHaveAttribute('href');
    expect(item.closest('a')).toBeNull();

    fireEvent.click(item);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('R21: los items mantienen el orden declarado, enlace incluido', () => {
    render(
      <RowActionsMenu items={itemsConEnlace(vi.fn())} triggerLabel={TRIGGER_LABEL} triggerTestId={TRIGGER_TESTID} />,
    );
    abrirMenu();

    const nombres = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(nombres).toEqual([EDIT_LABEL, DELETE_LABEL]);
  });
});
