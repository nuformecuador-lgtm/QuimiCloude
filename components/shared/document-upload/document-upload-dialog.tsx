'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { MAX_FILES_PER_BATCH, type PdfStrategy } from '@/lib/modules/documentos';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { DocumentUpload } from './document-upload';
import { CLOSE_LABEL, DIALOG_TITLE, OPEN_LABEL, dialogDescription } from './labels';

export const DOCUMENT_UPLOAD_OPEN_TESTID = 'document-upload-open';
export const DOCUMENT_UPLOAD_DIALOG_TESTID = 'document-upload-dialog';
export const DOCUMENT_UPLOAD_CLOSE_TESTID = 'document-upload-close';

export type DocumentUploadDialogProps = {
  /** La estrategia de la tanda que se abrira dentro del dialogo. */
  readonly strategy: PdfStrategy;
  /** Opcional: se pasa tal cual a `DocumentUpload`. */
  readonly reviewHrefFor?: (documentFileId: string) => string;
};

/**
 * Ventana emergente que envuelve `DocumentUpload`. `keepMounted` mantiene la subida montada mientras
 * la ventana esta cerrada, para que una tanda en curso siga sondeandose y se vea igual al reabrir.
 */
export function DocumentUploadDialog({ strategy, reviewHrefFor }: DocumentUploadDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className={`${touchTarget} text-base`}
            data-testid={DOCUMENT_UPLOAD_OPEN_TESTID}
          />
        }
      >
        {OPEN_LABEL}
      </DialogTrigger>
      <DialogContent
        keepMounted
        showCloseButton={false}
        data-testid={DOCUMENT_UPLOAD_DIALOG_TESTID}
        className="sm:max-w-lg max-h-[85dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{dialogDescription(MAX_FILES_PER_BATCH)}</DialogDescription>
        </DialogHeader>

        <DocumentUpload strategy={strategy} reviewHrefFor={reviewHrefFor} />

        <DialogFooter>
          <DialogClose
            render={
              <Button
                variant="ghost"
                className={`${touchTarget} text-base`}
                data-testid={DOCUMENT_UPLOAD_CLOSE_TESTID}
              />
            }
          >
            {CLOSE_LABEL}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
