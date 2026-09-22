import type { BatchStatus, DocumentFileStatusEntry } from '@/lib/modules/documentos';

/** Un PDF de mentira: lo unico que importa es que sea un `File` con el tipo correcto. */
export function pdf(name: string): File {
  return new File(['%PDF-1.4 fixture'], name, { type: 'application/pdf' });
}

export function entry(overrides: Partial<DocumentFileStatusEntry> = {}): DocumentFileStatusEntry {
  return {
    id: 'file-1',
    path: 'empresa-1/uno.pdf',
    status: 'queued',
    extractedText: null,
    errorCode: null,
    errorReason: null,
    ...overrides,
  };
}

export function batch(files: readonly DocumentFileStatusEntry[]): BatchStatus {
  return { id: 'batch-1', companyId: 'empresa-1', strategy: 'catalogo', files };
}

export function signedUploads(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    path: `empresa-1/ruta-${index}.pdf`,
    uploadUrl: `https://almacen.example/subir/${index}?token=t${index}`,
    token: `t${index}`,
    expiresAt: '2026-09-21T12:00:00.000Z',
  }));
}

/** Respuesta 2xx del almacenamiento, sin `Response` real: jsdom no la necesita para esto. */
export function okResponse(): Response {
  return { ok: true, status: 200 } as Response;
}

export function failedResponse(): Response {
  return { ok: false, status: 500 } as Response;
}
