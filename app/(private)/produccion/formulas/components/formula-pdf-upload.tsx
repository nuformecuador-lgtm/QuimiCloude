'use client';

import { DocumentUploadDialog } from '@/components/shared/document-upload';
import { formulaImportRoute } from '@/lib/shared/routes';

/**
 * Envuelve la pieza compartida de subida con la estrategia de formula y la ruta de revision de
 * cada archivo. Existe porque una funcion no puede cruzar del Server Component (`page.tsx`) al
 * cliente: alguien tiene que pasar `reviewHrefFor` al cliente.
 */
export function FormulaPdfUpload() {
  return <DocumentUploadDialog strategy="formula" reviewHrefFor={formulaImportRoute} />;
}
