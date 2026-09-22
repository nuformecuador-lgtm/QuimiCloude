/** El tipo de contenido que el esquema del borde del modulo admite para una tanda. */
export const PDF_CONTENT_TYPE = 'application/pdf';

/**
 * Sube los bytes de un PDF al enlace firmado. No conoce ninguna Server Action: el contenido viaja
 * del navegador al almacenamiento y no atraviesa la aplicacion.
 */
export async function uploadFile(uploadUrl: string, file: File): Promise<boolean> {
  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': PDF_CONTENT_TYPE },
      body: file,
    });
    return response.ok;
  } catch {
    return false;
  }
}
