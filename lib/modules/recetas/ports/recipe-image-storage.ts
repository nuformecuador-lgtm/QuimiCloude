/**
 * Puerto de almacenamiento de la imagen de receta (D10, R22; `design.md > 9.1`). El caso
 * de uso conoce ESTE interfaz y nada mas: ni `@supabase/storage-js`, ni el nombre del
 * bucket, ni la URL del proyecto. Los tests le pasan un doble en memoria (R43).
 */

/** Archivo ya validado (`validateRecipeImage`, T2) listo para subir. */
export type RecipeImageUpload = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly extension: 'jpg' | 'png' | 'webp';
};

export interface RecipeImageStorage {
  /** Sube el archivo y devuelve la RUTA dentro del bucket (`recetas/<uuid>.<ext>`). */
  upload(image: RecipeImageUpload): Promise<string>;

  /**
   * Borra un archivo por su ruta. UNICA operacion de borrado del modulo (R48): la llaman
   * los DOS caminos -reemplazar (R26) y quitar la imagen (R47)-, y no hay ninguna otra.
   */
  remove(path: string): Promise<void>;

  /** Compone la URL publica de lectura a partir de la ruta (D5, D6). */
  publicUrl(path: string): string;
}
