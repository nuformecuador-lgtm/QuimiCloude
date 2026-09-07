'use client';

import { useState } from 'react';

/**
 * Miniatura de la imagen de una fila, con marcador cuando no hay ninguna (2026-09-07, decision
 * humana).
 *
 * **Vive en `components/shared/` porque la usan DOS pantallas**: el catalogo de inventario y el
 * catalogo de un proveedor. Es la condicion que `docs/architecture.md > Regla: sin
 * sobre-ingenieria` pone para promover; con una sola habria vivido en su ruta.
 *
 * **`path` es la RUTA guardada** (`products.image_path`, `supplier_catalog_lines.image_path`), no
 * una URL compuesta. Ninguno de los dos modulos tiene puerto de almacenamiento -a diferencia de
 * `recetas`, que si compone `imageUrl` con `getPublicUrl`-, asi que aqui NO se inventa ningun
 * esquema de URL: la ruta se pasa tal cual a `src`.
 *
 * **Y por eso el marcador cubre DOS casos, no uno**: `path` nulo -que hoy es el caso de todas las
 * filas, porque nada llena esas columnas todavia- y `path` que no resuelve, que es lo que pasara
 * mientras la ruta sea de almacenamiento y no una URL servible. Cuando alguien anada la subida y
 * la composicion de URL, esta miniatura empezara a mostrar imagenes sin tocar una linea.
 *
 * **`<img>` y no `next/image`**: el componente de Next exige o un dominio declarado en
 * `next.config.ts` o una ruta local, y la ruta de estas dos columnas no esta acordada en el repo
 * (P1 de QC-52). Declarar un dominio remoto aqui seria decidir por una ficha que no existe. El
 * marcador si es local y se sirve de `public/`.
 */

/** Marcador de «sin imagen». Vive en `public/`, asi que se sirve por ruta absoluta. */
export const MISSING_IMAGE_SRC = '/inv_not_found.png';

/**
 * Lado de la miniatura en px. Cuadrada para que ninguna fila cambie de alto segun su imagen.
 *
 * 60 y no 40 desde el 2026-09-07 (decision humana: «un 50% mas grande»). El numero vive aqui y
 * la clase de Tailwind se deriva de el en el `style`, para que no haya dos sitios que declaren el
 * tamano y puedan divergir -que es lo que pasaba con `size-10` y `width`/`height` a la vez-.
 */
const THUMBNAIL_SIZE = 60;

export type EntityImageProps = {
  /** Ruta guardada de la imagen, o `null` si la fila no tiene. */
  readonly path: string | null;
  /**
   * Nombre de la fila. Se usa para el texto alternativo, que describe A QUE pertenece la imagen;
   * la miniatura no es decorativa -identifica la fila-, asi que no lleva `alt` vacio.
   */
  readonly name: string;
  readonly testId?: string;
};

export function EntityImage({ path, name, testId }: EntityImageProps) {
  const [fallo, setFallo] = useState(false);
  const usaMarcador = path === null || path === '' || fallo;

  return (
    /*
      `next/image` exige o un dominio declarado en `next.config.ts` o una ruta local, y la forma
      de la ruta de estas dos columnas no esta acordada en el repo (P1 de QC-52): declarar un
      dominio remoto aqui seria decidir por una ficha que no existe. Lo que la regla protege -LCP
      y ancho de banda- no esta en juego con una miniatura de 40x40 con carga diferida.
    */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={usaMarcador ? MISSING_IMAGE_SRC : path}
      alt={name}
      width={THUMBNAIL_SIZE}
      height={THUMBNAIL_SIZE}
      loading="lazy"
      decoding="async"
      // El marcador cubre tambien la ruta que no resuelve (ver el docblock). `onError` se
      // desarma solo: una vez en marcador, `src` ya no vuelve a fallar.
      onError={() => setFallo(true)}
      style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
      className="shrink-0 rounded-md border object-cover"
      data-testid={testId}
      data-missing={usaMarcador ? 'true' : undefined}
    />
  );
}
