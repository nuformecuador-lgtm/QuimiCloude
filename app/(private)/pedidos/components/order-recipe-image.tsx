'use client';

import { EntityImage } from '@/components/shared/entity-image';

export const ORDER_RECIPE_IMAGE_TESTID = 'order-recipe-image';

export type OrderRecipeImageProps = {
  /** Imagen de la receta elegida, ya compuesta, o `null` si no tiene o no hay receta elegida. */
  readonly imageUrl: string | null;
  /** Nombre de la receta, para el texto alternativo. Vacio mientras no se haya elegido ninguna. */
  readonly name: string;
};

export function OrderRecipeImage({ imageUrl, name }: OrderRecipeImageProps) {
  return (
    <EntityImage
      size="fill"
      path={imageUrl}
      name={name}
      testId={ORDER_RECIPE_IMAGE_TESTID}
      emptyAlt="Sin receta elegida"
    />
  );
}
