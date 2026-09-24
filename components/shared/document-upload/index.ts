/**
 * Barrel de `components/shared/document-upload`: la unica superficie publica de la pieza.
 * Sin `'use client'` aqui — la frontera cliente/servidor la declara cada componente.
 */

export {
  DocumentUpload,
  DOCUMENT_UPLOAD_CLEAR_TESTID,
  DOCUMENT_UPLOAD_ERROR_TESTID,
  DOCUMENT_UPLOAD_INPUT_TESTID,
  DOCUMENT_UPLOAD_LIST_TESTID,
  DOCUMENT_UPLOAD_MISSING_TESTID,
  DOCUMENT_UPLOAD_RESUME_TESTID,
  DOCUMENT_UPLOAD_SELECTION_ERROR_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  DOCUMENT_UPLOAD_TESTID,
  DOCUMENT_UPLOAD_TRIGGER_TESTID,
  type DocumentUploadProps,
} from './document-upload';

export {
  DocumentUploadRow,
  rowErrorTestId,
  rowNameTestId,
  rowPhaseTestId,
  rowReasonTestId,
  rowReviewLinkTestId,
  rowStatusTestId,
  rowTestId,
  type DocumentUploadRowProps,
} from './document-upload-row';

export {
  BROWSER_PHASE_LABELS,
  FILE_STATUS_LABELS,
  REVIEW_LABEL,
  fileErrorMessage,
  tooManyFilesMessage,
  type BrowserPhase,
} from './labels';

export { BATCH_STATUS_POLL_INTERVAL_MS, useBatchStatus } from './use-batch-status';
export { PDF_CONTENT_TYPE, uploadFile } from './upload-file';
