'use client';

import { useState } from 'react';

import { MISSING_IMAGE_SRC } from '@/components/shared/entity-image';

/**
 * Hueco de la imagen de la receta dentro del panel de pedido (decision humana del 2026-09-08).
 *
 * **El marcador es el MISMO de toda la aplicacion** (`MISSING_IMAGE_SRC`, de
 * `components/shared/entity-image.tsx`): el que ensenan las tablas de inventario y del catalogo de
 * un proveedor y el que el campo de imagen de la receta pone en su zona vacia. Aqui no se dibuja
 * un marcador propio -eso seria la segunda forma de decir «no hay imagen»-, solo se reutiliza.
 *
 * **El hueco existe SIEMPRE, con receta o sin ella**: lo pinta la columna de 3 de la rejilla de 12
 * del formulario -los campos ocupan las otras 9-, y reservarlo evita que la rejilla se recoloque
 * la primera vez que se elige una receta con imagen.
 *
 * **Elegir una receta sustituye el marcador por su imagen SOLO si su ruta no es nula**
 * (`imageUrl !== null`, ya compuesta por el contrato de `recetas`). Con la ruta nula -o con una
 * que no resuelve, que `onError` cubre- se queda el marcador.
 *
 * **`<img>` y no `next/image`**, por lo mismo que `EntityImage`: la imagen de la receta sale del
 * almacenamiento de Supabase y su dominio no esta declarado en `next.config.ts`; declararlo aqui
 * seria decidir por una ficha que no existe.
 */

export const ORDER_RECIPE_IMAGE_TESTID = 'order-recipe-image';

/**
 * Proporcion del hueco, en la notacion de `aspect-ratio` (ancho/alto). CUADRADA: el ancho ya lo
 * fija la columna de la rejilla, y una proporcion cuadrada es la que mejor encaja una imagen de
 * producto sin decidir por ella si es apaisada o vertical. Vive en una constante porque es lo
 * unico del hueco que se ajusta a ojo.
 */
const ASPECT = 'aspect-square';

/** Gris del hueco: el mismo tono neutro que el resto de superficies vacias del tema. */
const SURFACE = 'bg-muted';

export type OrderRecipeImageProps = {
  /** Imagen de la receta elegida, ya compuesta, o `null` si no tiene o no hay receta elegida. */
  readonly imageUrl: string | null;
  /** Nombre de la receta, para el texto alternativo. Vacio mientras no se haya elegido ninguna. */
  readonly name: string;
};

export function OrderRecipeImage({ imageUrl, name }: OrderRecipeImageProps) {
  const [fallo, setFallo] = useState(false);
  const usaMarcador = imageUrl === null || imageUrl === '' || fallo;

  return (
    <div
      className={`flex w-full items-center justify-center overflow-hidden rounded-xl border ${SURFACE} ${ASPECT}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        // Remontar al cambiar de receta rearma el `onError`: una imagen rota antes no debe dejar
        // en marcador a la siguiente.
        key={imageUrl ?? ''}
        src={usaMarcador ? MISSING_IMAGE_SRC : imageUrl}
        alt={name === '' ? 'Sin receta elegida' : name}
        loading="lazy"
        decoding="async"
        onError={() => setFallo(true)}
        className="h-full w-full object-contain"
        data-testid={ORDER_RECIPE_IMAGE_TESTID}
        data-missing={usaMarcador ? 'true' : undefined}
      />
    </div>
  );
}
