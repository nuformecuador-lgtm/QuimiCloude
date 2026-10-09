import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EntityImage, MISSING_IMAGE_SRC } from '@/components/shared/entity-image';

afterEach(cleanup);

const FILL_WRAPPER_CLASSES =
  'flex w-full items-center justify-center overflow-hidden rounded-xl border bg-muted aspect-square';

describe('EntityImage size="fill"', () => {
  it('R28: envuelve la imagen en el hueco cuadrado de ancho completo y fondo neutro', () => {
    const { container } = render(
      <EntityImage size="fill" path="/receta.png" name="Jabón" testId="order-recipe-image" />,
    );

    const envoltorio = container.firstElementChild as HTMLElement;
    expect(envoltorio.tagName).toBe('DIV');
    expect(envoltorio.className).toBe(FILL_WRAPPER_CLASSES);
    expect(envoltorio.childElementCount).toBe(1);

    const imagen = screen.getByTestId('order-recipe-image');
    expect(imagen.parentElement).toBe(envoltorio);
    expect(imagen).toHaveAttribute('src', '/receta.png');
    expect(imagen).toHaveAttribute('alt', 'Jabón');
    expect(imagen).toHaveAttribute('loading', 'lazy');
    expect(imagen).toHaveAttribute('decoding', 'async');
    expect(imagen.className).toBe('h-full w-full object-contain');
    expect(imagen.hasAttribute('width')).toBe(false);
    expect(imagen.hasAttribute('height')).toBe(false);
    expect(imagen.hasAttribute('style')).toBe(false);
    expect(imagen.hasAttribute('data-missing')).toBe(false);
  });

  it('R28: sin nombre usa el alt de vacio que se le pase', () => {
    render(
      <EntityImage
        size="fill"
        path={null}
        name=""
        testId="order-recipe-image"
        emptyAlt="Sin receta elegida"
      />,
    );

    expect(screen.getByTestId('order-recipe-image')).toHaveAttribute('alt', 'Sin receta elegida');
  });

  it('R28: sin imagen pinta el marcador', () => {
    render(<EntityImage size="fill" path={null} name="Jabón" testId="order-recipe-image" />);

    const imagen = screen.getByTestId('order-recipe-image');
    expect(imagen).toHaveAttribute('src', MISSING_IMAGE_SRC);
    expect(imagen).toHaveAttribute('data-missing', 'true');
  });

  it('R28: con la imagen rota pasa al marcador', () => {
    render(<EntityImage size="fill" path="/rota.png" name="Jabón" testId="order-recipe-image" />);

    fireEvent.error(screen.getByTestId('order-recipe-image'));

    const imagen = screen.getByTestId('order-recipe-image');
    expect(imagen).toHaveAttribute('src', MISSING_IMAGE_SRC);
    expect(imagen).toHaveAttribute('data-missing', 'true');
  });

  it('R28: al cambiar de imagen remonta el img', () => {
    const { rerender } = render(
      <EntityImage size="fill" path="/a.png" name="A" testId="order-recipe-image" />,
    );
    const antes = screen.getByTestId('order-recipe-image');

    rerender(<EntityImage size="fill" path="/b.png" name="B" testId="order-recipe-image" />);

    const despues = screen.getByTestId('order-recipe-image');
    expect(despues).not.toBe(antes);
    expect(despues).toHaveAttribute('src', '/b.png');
  });
});

describe('EntityImage size="thumbnail" (defecto)', () => {
  it('R28: sin size pinta la miniatura de hoy, sin envoltorio', () => {
    const { container } = render(<EntityImage path="/p.png" name="Producto" testId="thumb" />);

    const imagen = screen.getByTestId('thumb');
    expect(container.firstElementChild).toBe(imagen);
    expect(imagen.tagName).toBe('IMG');
    expect(imagen).toHaveAttribute('src', '/p.png');
    expect(imagen).toHaveAttribute('alt', 'Producto');
    expect(imagen).toHaveAttribute('width', '60');
    expect(imagen).toHaveAttribute('height', '60');
    expect(imagen).toHaveAttribute('loading', 'lazy');
    expect(imagen).toHaveAttribute('decoding', 'async');
    expect(imagen).toHaveStyle({ width: '60px', height: '60px' });
    expect(imagen.className).toBe('shrink-0 rounded-md border object-cover');
  });

  it('R28: size="thumbnail" explicito da el mismo marcado que sin size', () => {
    const { container: sinSize } = render(<EntityImage path={null} name="" testId="thumb" />);
    const htmlSinSize = sinSize.innerHTML;
    cleanup();

    const { container: conSize } = render(
      <EntityImage size="thumbnail" path={null} name="" testId="thumb" />,
    );
    expect(conSize.innerHTML).toBe(htmlSinSize);
    expect(screen.getByTestId('thumb')).toHaveAttribute('alt', '');
    expect(screen.getByTestId('thumb')).toHaveAttribute('src', MISSING_IMAGE_SRC);
  });
});
