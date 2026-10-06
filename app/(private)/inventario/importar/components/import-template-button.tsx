'use client';

import { DownloadIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { buildInventoryImportTemplate } from '@/lib/modules/inventario';

import { downloadFile } from './download-file';
import { TEMPLATE_BUTTON_LABEL, TEMPLATE_BUTTON_TESTID } from './import-texts';

export function ImportTemplateButton({ label = TEMPLATE_BUTTON_LABEL }: { readonly label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 min-w-11"
      data-testid={TEMPLATE_BUTTON_TESTID}
      onClick={() => downloadFile(buildInventoryImportTemplate())}
    >
      <DownloadIcon aria-hidden />
      {label}
    </Button>
  );
}
