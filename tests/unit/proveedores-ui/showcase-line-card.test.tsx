import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ShowcaseLineCard } from '@/app/(private)/proveedores/components';
import { MISSING_IMAGE_SRC } from '@/components/shared/entity-image';
import type { ShowcaseLine } from '@/lib/modules/proveedores';

afterEach(() => {
  cleanup();
});

function linea(overrides: Partial<ShowcaseLine> = {}): ShowcaseLine {
  return {
    id: crypto.randomUUID(),
    name: 'Ácido cítrico anhidro',
    imagePath: null,
    ...overrides,
  };
}

describe('ShowcaseLineCard', () => {
  it('R7 — pinta la imagen (de @/components/shared/entity-image) y el nombre de la línea', () => {
    const linea1 = linea({ imagePath: '/lineas/acido.png' });

    render(<ShowcaseLineCard line={linea1} />);

    const imagen = screen.getByRole('img', { name: linea1.name });
    expect(imagen).toHaveAttribute('width', '60');
    expect(imagen).toHaveAttribute('height', '60');
    expect(imagen).toHaveAttribute('src', linea1.imagePath as string);
    expect(screen.getByText(linea1.name)).toBeInTheDocument();
  });

  it('R9 — con imagePath null pinta el marcador con data-missing', () => {
    const linea1 = linea({ imagePath: null });

    render(<ShowcaseLineCard line={linea1} />);

    const imagen = screen.getByRole('img', { name: linea1.name });
    expect(imagen).toHaveAttribute('src', MISSING_IMAGE_SRC);
    expect(imagen).toHaveAttribute('data-missing', 'true');
    expect(imagen).toHaveAttribute('width', '60');
  });

  it('R9 — con imagePath en cadena vacía pinta el marcador con data-missing', () => {
    const linea1 = linea({ imagePath: '' });

    render(<ShowcaseLineCard line={linea1} />);

    const imagen = screen.getByRole('img', { name: linea1.name });
    expect(imagen).toHaveAttribute('src', MISSING_IMAGE_SRC);
    expect(imagen).toHaveAttribute('data-missing', 'true');
  });

  it('R9 — si la imagen no resuelve al cargarse, cae al marcador con data-missing', () => {
    const linea1 = linea({ imagePath: '/lineas/rota.png' });

    render(<ShowcaseLineCard line={linea1} />);

    const imagen = screen.getByRole('img', { name: linea1.name });
    fireEvent.error(imagen);

    expect(imagen).toHaveAttribute('src', MISSING_IMAGE_SRC);
    expect(imagen).toHaveAttribute('data-missing', 'true');
  });

  it('R10 — una línea sin imagen se lista igual que una con imagen, con el mismo marcado', () => {
    const conImagen = linea({ imagePath: '/lineas/con-imagen.png' });
    const sinImagen = linea({ imagePath: null, name: 'Hipoclorito de sodio' });

    render(
      <ul>
        <ShowcaseLineCard line={conImagen} />
        <ShowcaseLineCard line={sinImagen} />
      </ul>,
    );

    expect(screen.getByTestId(`showcase-line-card-${conImagen.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`showcase-line-card-${sinImagen.id}`)).toBeInTheDocument();
  });

  it('R8 — no muestra quién creó ni quién modificó la línea', () => {
    const linea1 = linea();

    render(<ShowcaseLineCard line={linea1} />);

    expect(document.body.textContent ?? '').not.toMatch(/creado|modificado|createdBy|updatedBy/i);
  });
});
