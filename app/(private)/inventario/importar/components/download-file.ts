import type { ImportDownload } from '@/lib/modules/inventario';

// Safari inicia la descarga de forma asíncrona: revocar la URL en el acto puede cortarla.
const REVOKE_DELAY_MS = 40_000;

export function downloadFile(download: ImportDownload): void {
  const blob = new Blob([download.content], { type: download.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = download.fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
