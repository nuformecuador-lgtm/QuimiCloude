'use client';

import { DocumentUploadDialog } from '@/components/shared/document-upload';
import { supplierCatalogImportRoute } from '@/lib/shared/routes';

/**
 * Envuelve la pieza compartida de subida con la estrategia de catalogo y la ruta de revision de
 * este proveedor. Existe porque una funcion no puede cruzar del Server Component (`page.tsx`) al
 * cliente: alguien tiene que fijar `reviewHrefFor` con el `supplierId` ya resuelto.
 */
export type CatalogPdfUploadProps = {
  readonly supplierId: string;
};

export function CatalogPdfUpload({ supplierId }: CatalogPdfUploadProps) {
  return (
    <DocumentUploadDialog
      strategy="catalogo"
      reviewHrefFor={(documentFileId) => supplierCatalogImportRoute(supplierId, documentFileId)}
    />
  );
}
