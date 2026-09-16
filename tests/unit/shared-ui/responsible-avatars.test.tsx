// QC-102 T7 — Los responsables de UNA fila: R17, R18, R19, R21 y el `aria-label` del `+N` (R35).
//
// **Ningun assert sobre el copy**: los controles y las regiones se localizan por `data-testid`
// exportado o por rol accesible, y la etiqueta del `+N` se DERIVA de `responsiblesOverflowLabel`
// en vez de copiarse — si manana el texto cambia, el test sigue diciendo la verdad sobre la
// estructura, que es lo que R17 y R35 exigen.
//
// **QC-88 T17 (2026-09-16) — el componente se PROMOVIO a `components/shared/`** y este test se
// mudo con el (de `tests/unit/pedidos-ui/` a `tests/unit/shared-ui/`), sin cambiar ni un caso:
// QC-88 es el segundo consumidor con la misma API y `docs/architecture.md > Componentes >
// Regla: sin sobre-ingenieria` obliga a promover
// (`specs/QC-88-listado-de-pedidos-asignados/design.md > 8.3`, hallazgo H6).
//
// **El import es MIXTO a proposito.** El componente y sus `data-testid` vienen ya de
// `@/components/shared/responsible-avatars`, su ubicacion real. Pero `MISSING_RESPONSIBLES_MARK`
// y `MISSING_VALUE_MARK` se siguen tomando del **barrel de la ruta de pedidos**: lo que ata el
// marcador de esta celda al de `order-columns.tsx` es justo esa comparacion, y `MISSING_VALUE_MARK`
// solo existe alli. De paso, tomar la marca por el barrel comprueba que la ruta sigue
// reexportando el componente promovido.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MISSING_RESPONSIBLES_MARK, MISSING_VALUE_MARK } from '@/app/(private)/pedidos/components';
import {
  RESPONSIBLE_AVATARS_LIMIT,
  RESPONSIBLE_AVATARS_TESTID,
  RESPONSIBLE_AVATAR_TESTID,
  RESPONSIBLE_MISSING_TESTID,
  RESPONSIBLE_OVERFLOW_NAMES_TESTID,
  RESPONSIBLE_OVERFLOW_TESTID,
  ResponsibleAvatars,
  responsiblesOverflowLabel,
} from '@/components/shared/responsible-avatars';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import { getInitials } from '@/lib/shared/ui/initials';

const NOMBRES = [
  'Ana Torres',
  'Bruno Diaz',
  'Carla Ruiz',
  'Diego Salas',
  'Elena Prado',
  'Fabio Nieto',
  'Gema Lopez',
  'Hugo Marin',
  'Irene Costa',
];

/** Un identificador estable y distinto por indice: nunca se afirma sobre el, solo se necesita. */
function id(indice: number): string {
  return `0000000${indice}-0000-4000-8000-00000000000${indice}`;
}

function responsables(cuantos: number): readonly OrderResponsible[] {
  return Array.from({ length: cuantos }, (_, indice) => ({
    userId: id(indice),
    displayName: NOMBRES[indice] ?? `Persona ${indice}`,
    origin: { kind: 'direct' } as const,
  }));
}

afterEach(() => {
  cleanup();
});

describe('tres iniciales y un `+N` con los nombres que faltan (R17)', () => {
  it('con CINCO responsables se pintan TRES circulos y un `+2`', () => {
    render(<ResponsibleAvatars responsibles={responsables(5)} />);

    expect(screen.getAllByTestId(RESPONSIBLE_AVATAR_TESTID)).toHaveLength(
      RESPONSIBLE_AVATARS_LIMIT,
    );
    expect(screen.getByTestId(RESPONSIBLE_OVERFLOW_TESTID)).toHaveTextContent('+2');
  });

  it('el `+N` nombra a LOS QUE FALTAN, y solo a esos', () => {
    render(<ResponsibleAvatars responsibles={responsables(5)} />);

    const nombres = screen.getByTestId(RESPONSIBLE_OVERFLOW_NAMES_TESTID);

    // Los dos que no caben, POR NOMBRE (R17).
    expect(nombres).toHaveTextContent('Diego Salas');
    expect(nombres).toHaveTextContent('Elena Prado');
    // Y ninguno de los tres que si se ven: el `+N` lista lo que falta, no la lista entera.
    for (const visible of ['Ana Torres', 'Bruno Diaz', 'Carla Ruiz']) {
      expect(nombres).not.toHaveTextContent(visible);
    }
  });

  it('con TRES o menos no hay `+N` que mostrar', () => {
    render(<ResponsibleAvatars responsibles={responsables(RESPONSIBLE_AVATARS_LIMIT)} />);

    expect(screen.getAllByTestId(RESPONSIBLE_AVATAR_TESTID)).toHaveLength(
      RESPONSIBLE_AVATARS_LIMIT,
    );
    expect(screen.queryByTestId(RESPONSIBLE_OVERFLOW_TESTID)).toBeNull();
  });
});

describe('la columna no baila: ancho CONSTANTE (R18)', () => {
  it('la celda declara EXACTAMENTE las mismas clases con 1 responsable y con 9', () => {
    const { unmount } = render(<ResponsibleAvatars responsibles={responsables(1)} />);
    const conUno = screen.getByTestId(RESPONSIBLE_AVATARS_TESTID).className;
    unmount();

    render(<ResponsibleAvatars responsibles={responsables(9)} />);
    const conNueve = screen.getByTestId(RESPONSIBLE_AVATARS_TESTID).className;

    expect(conNueve).toBe(conUno);
  });

  it('en negativo: el ancho NO es `w-fit`, que es justo lo que haria crecer la columna', () => {
    render(<ResponsibleAvatars responsibles={responsables(9)} />);

    const clases = screen.getByTestId(RESPONSIBLE_AVATARS_TESTID).className;
    expect(clases).not.toContain('w-fit');
    // Hay una clase de ancho declarada, sea cual sea el numero que lleve.
    expect(clases).toMatch(/(?:^|\s)w-\d+(?:\s|$)/);
  });

  it('la celda VACIA declara tambien el mismo ancho: no se encoge sin nadie (R18, R19)', () => {
    const { unmount } = render(<ResponsibleAvatars responsibles={responsables(9)} />);
    const conNueve = screen.getByTestId(RESPONSIBLE_AVATARS_TESTID).className;
    unmount();

    render(<ResponsibleAvatars responsibles={[]} />);
    const anchoVacia = screen.getByTestId(RESPONSIBLE_AVATARS_TESTID).className;

    expect(anchoVacia).toContain(conNueve.split(/\s+/).find((c) => /^w-\d+$/.test(c)) ?? 'w-');
  });
});

describe('sin nadie asignado: marcador de ausencia, jamas un uuid (R19)', () => {
  it('pinta el marcador de ausencia de esta pantalla', () => {
    render(<ResponsibleAvatars responsibles={[]} />);

    const marca = screen.getByTestId(RESPONSIBLE_MISSING_TESTID);
    expect(marca).toHaveTextContent(MISSING_RESPONSIBLES_MARK);
    expect(marca).toHaveAttribute('aria-label', 'Sin dato');
  });

  it('la marca es LA MISMA que la de receta y motivo de cancelacion (R19)', () => {
    // El glifo se declara en dos archivos y no puede: `order-columns.tsx` importara
    // `responsible-avatars.tsx` (T12), asi que importar al reves cerraria un ciclo. Este test es
    // lo que ata los dos valores, igual que H4 ata el tope del lote con `MAX_PAGE_SIZE`.
    expect(MISSING_RESPONSIBLES_MARK).toBe(MISSING_VALUE_MARK);
  });

  it('en negativo: no hay ningun circulo ni ningun `+N` que pintar', () => {
    render(<ResponsibleAvatars responsibles={[]} />);

    expect(screen.queryAllByTestId(RESPONSIBLE_AVATAR_TESTID)).toEqual([]);
    expect(screen.queryByTestId(RESPONSIBLE_OVERFLOW_TESTID)).toBeNull();
  });
});

describe('un avatar es un circulo con iniciales, con nombre accesible y SIN foto (R21)', () => {
  it('cada circulo pinta las iniciales que devuelve `getInitials`, no unas propias', () => {
    render(<ResponsibleAvatars responsibles={responsables(3)} />);

    const circulos = screen.getAllByTestId(RESPONSIBLE_AVATAR_TESTID);
    expect(circulos.map((circulo) => circulo.textContent)).toEqual(
      ['Ana Torres', 'Bruno Diaz', 'Carla Ruiz'].map(getInitials),
    );
  });

  it('el nombre ACCESIBLE de cada circulo es el nombre COMPLETO', () => {
    render(<ResponsibleAvatars responsibles={responsables(3)} />);

    for (const nombre of ['Ana Torres', 'Bruno Diaz', 'Carla Ruiz']) {
      expect(screen.getByRole('img', { name: nombre })).toBeInTheDocument();
    }
  });

  it('en negativo: NINGUN elemento `img` en el arbol — no hay foto que pedir', () => {
    const { container } = render(<ResponsibleAvatars responsibles={responsables(9)} />);

    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('en negativo: ningun identificador tecnico llega al texto de la celda', () => {
    render(<ResponsibleAvatars responsibles={responsables(9)} />);

    const celda = screen.getByTestId(RESPONSIBLE_AVATARS_TESTID);
    expect(celda.textContent ?? '').not.toContain(id(0));
  });
});

describe('el `+N` es un boton de 44x44 con `aria-label` y ABRE el panel (R17, R35, H5)', () => {
  it('su etiqueta accesible dice cuantos faltan, derivada de la funcion exportada', () => {
    render(<ResponsibleAvatars responsibles={responsables(9)} />);

    const boton = screen.getByTestId(RESPONSIBLE_OVERFLOW_TESTID);
    expect(boton).toHaveAttribute('aria-label', responsiblesOverflowLabel(6));
    expect(screen.getByRole('button', { name: responsiblesOverflowLabel(6) })).toBe(boton);
  });

  it('es un `button` con objetivo tactil de 44x44 (R35)', () => {
    render(<ResponsibleAvatars responsibles={responsables(9)} />);

    const boton = screen.getByTestId(RESPONSIBLE_OVERFLOW_TESTID);
    expect(boton.tagName).toBe('BUTTON');
    expect(boton).toHaveAttribute('type', 'button');
    expect(boton.className).toContain('min-h-11');
    expect(boton.className).toContain('min-w-11');
  });

  it('al pulsarlo abre el panel: el dato no depende de `:hover` (R35, H5)', async () => {
    const { setupUser } = await import('../../helpers/user-event');
    const abrirPanel = vi.fn<() => void>();
    const user = setupUser();

    render(<ResponsibleAvatars responsibles={responsables(9)} onShowAll={abrirPanel} />);
    await user.click(screen.getByTestId(RESPONSIBLE_OVERFLOW_TESTID));

    expect(abrirPanel).toHaveBeenCalledTimes(1);
  });

  it('los nombres que faltan estan SIEMPRE en el arbol, sin pasar el puntero (R35, H5)', () => {
    render(<ResponsibleAvatars responsibles={responsables(9)} />);

    const boton = screen.getByTestId(RESPONSIBLE_OVERFLOW_TESTID);
    const nombres = screen.getByTestId(RESPONSIBLE_OVERFLOW_NAMES_TESTID);

    // El boton los REFERENCIA: no es texto suelto que un lector de pantalla pueda no relacionar.
    expect(boton).toHaveAttribute('aria-describedby', nombres.id);
    expect(nombres).toHaveTextContent('Irene Costa');
  });
});
