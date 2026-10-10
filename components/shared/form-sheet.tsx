'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { touchTarget } from '@/lib/shared/ui/touch-target';

export const FORM_SHEET_CANCEL_LABEL = 'Cancelar';
export const FORM_SHEET_SAVE_LABEL = 'Guardar';
export const FORM_SHEET_PENDING_LABEL = 'Guardando…';

const DEFAULT_CLASS_NAME =
  'w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md';
const DEFAULT_BODY_CLASS_NAME = 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4';

/**
 * `prop` usa la variante `touch` del `Button`; `class` añade `touchTarget` como clase. Los dos dan
 * la misma talla, pero dejan las clases en distinto orden, y cada formulario conserva la suya.
 */
export type TouchMode = 'prop' | 'class';

export type FormSheetTestIds = {
  readonly sheet: string;
  readonly form: string;
  readonly cancel: string;
  readonly submit: string;
  readonly title?: string;
};

export type FormSheetProps = {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Se pinta dentro de la cabecera, después de la descripción. */
  readonly headerExtra?: ReactNode;
  /** Se pinta dentro del `<form>`, antes de la cabecera (p. ej. un diálogo anidado). */
  readonly beforeHeader?: ReactNode;
  readonly formAction: (formData: FormData) => void;
  readonly noValidate?: boolean;
  /** Contenido del cuerpo con scroll. */
  readonly children: ReactNode;
  readonly bodyClassName?: string;
  readonly side?: 'right' | 'bottom';
  readonly className?: string;
  readonly minScreenWidth?: number;
  /** Atributos `data-*` extra del panel. */
  readonly sheetData?: Readonly<Record<`data-${string}`, string>>;
  readonly testIds: FormSheetTestIds;
  readonly cancelLabel?: string;
  readonly saveLabel?: string;
  readonly pendingLabel?: string;
  readonly canSave?: boolean;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  /** Con valor, el pie va envuelto en un `<div>` con estas clases. */
  readonly footerWrapperClassName?: string;
  readonly cancelTouch?: TouchMode;
  readonly saveTouch?: TouchMode;
};

/**
 * Panel lateral de formulario: cabecera, cuerpo con scroll y pie fijo con «Cancelar» y guardar.
 * El `<form>` lo monta `SheetContent` con `isForm`, así el pie queda dentro y `SaveButton` ve su
 * envío. Debe montarse dentro de un `Sheet`.
 */
export function FormSheet({
  title,
  description,
  headerExtra,
  beforeHeader,
  formAction,
  noValidate,
  children,
  bodyClassName = DEFAULT_BODY_CLASS_NAME,
  side = 'right',
  className = DEFAULT_CLASS_NAME,
  minScreenWidth,
  sheetData,
  testIds,
  cancelLabel = FORM_SHEET_CANCEL_LABEL,
  saveLabel = FORM_SHEET_SAVE_LABEL,
  pendingLabel = FORM_SHEET_PENDING_LABEL,
  canSave = true,
  busy = false,
  disabled = false,
  footerWrapperClassName,
  cancelTouch = 'class',
  saveTouch = 'prop',
}: FormSheetProps) {
  const actions = (
    <>
      <SheetClose
        render={
          <Button
            type="button"
            variant="outline-dashed"
            touch={cancelTouch === 'prop'}
            className={cancelTouch === 'class' ? touchTarget : undefined}
            data-testid={testIds.cancel}
          />
        }
      >
        {cancelLabel}
      </SheetClose>
      <SaveButton
        label={saveLabel}
        pendingLabel={pendingLabel}
        testId={testIds.submit}
        canSave={canSave}
        busy={busy}
        disabled={disabled}
        touch={saveTouch}
      />
    </>
  );

  return (
    <SheetContent
      side={side}
      minScreenWidth={minScreenWidth}
      className={className}
      data-testid={testIds.sheet}
      {...sheetData}
      isForm
      formProps={{ action: formAction, noValidate, 'data-testid': testIds.form }}
      footer={
        footerWrapperClassName === undefined ? (
          actions
        ) : (
          <div className={footerWrapperClassName}>{actions}</div>
        )
      }
    >
      {beforeHeader}
      <SheetHeader>
        <SheetTitle data-testid={testIds.title}>{title}</SheetTitle>
        {description === undefined ? null : <SheetDescription>{description}</SheetDescription>}
        {headerExtra}
      </SheetHeader>

      <div className={bodyClassName}>{children}</div>
    </SheetContent>
  );
}

export type SaveButtonProps = {
  readonly label?: string;
  readonly pendingLabel?: string;
  readonly testId: string;
  /** Con `false` no deja enviar, pero no se muestra como pendiente. */
  readonly canSave?: boolean;
  /** Un envío en curso que no pasa por el `<form>` (p. ej. una transición propia). */
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly touch?: TouchMode;
};

/**
 * Componente aparte porque `useFormStatus()` solo lee el `<form>` ancestro: en el componente que
 * pinta el `<form>` devolvería siempre `pending: false`.
 */
export function SaveButton({
  label = FORM_SHEET_SAVE_LABEL,
  pendingLabel = FORM_SHEET_PENDING_LABEL,
  testId,
  canSave = true,
  busy = false,
  disabled = false,
  touch = 'prop',
}: SaveButtonProps) {
  const pending = useFormStatus().pending || busy;

  return (
    <Button
      type="submit"
      touch={touch === 'prop'}
      className={touch === 'class' ? touchTarget : undefined}
      disabled={pending || !canSave || disabled}
      aria-busy={pending}
      data-testid={testId}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
