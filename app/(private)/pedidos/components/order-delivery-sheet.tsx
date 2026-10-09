'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';

import { ErrorAlert } from '@/components/shared/error-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { newRequestId } from '@/lib/modules/observabilidad';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import {
  checkDelivery,
  type DeliveryAllocation,
  type DeliveryCheck,
  type OrderDeliveryView,
  type OrderSummary,
} from '@/lib/modules/pedidos';
import {
  deliverOrderAction,
  getOrderDeliveryAction,
  type DeliverOrderActionResult,
  type OrderDeliveryResult,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';

import {
  adjustOrderDeliveryDraft,
  packagesKey,
  type OrderDeliveryDraft,
} from './order-delivery-draft';
import { type OrderCustomerChoice } from './order-customer-label';
import { OrderCustomerPicker } from './order-customer-picker';
import { useOrderDeliveryDraft } from './use-order-delivery-draft';

export const ORDER_DELIVERY_SHEET_TESTID = 'order-delivery-sheet';
export const ORDER_DELIVERY_SKELETON_TESTID = 'order-delivery-skeleton';
export const ORDER_DELIVERY_ERROR_TESTID = 'order-delivery-error';
export const ORDER_DELIVERY_REJECTED_TESTID = 'order-delivery-rejected';
export const ORDER_DELIVERY_DRAFT_ADJUSTED_TESTID = 'order-delivery-draft-adjusted';
export const ORDER_DELIVERY_LINE_TESTID = 'order-delivery-line';
export const ORDER_DELIVERY_LINE_COMPLETE_TESTID = 'order-delivery-line-complete';
export const ORDER_DELIVERY_LINE_EXCEEDS_TESTID = 'order-delivery-line-exceeds';
export const ORDER_DELIVERY_BATCH_TESTID = 'order-delivery-batch';
export const ORDER_DELIVERY_BATCH_PACKAGES_TESTID = 'order-delivery-batch-packages';
export const ORDER_DELIVERY_BATCH_EXCEEDS_TESTID = 'order-delivery-batch-exceeds';
export const ORDER_DELIVERY_WHOLE_ERROR_TESTID = 'order-delivery-whole-error';
export const ORDER_DELIVERY_CUSTOMER_ERROR_TESTID = 'order-delivery-customer-error';
export const ORDER_DELIVERY_EMPTY_ERROR_TESTID = 'order-delivery-empty-error';
export const ORDER_DELIVERY_SUBMIT_TESTID = 'order-delivery-submit';
export const ORDER_DELIVERY_CANCEL_TESTID = 'order-delivery-cancel';

const LABELS = {
  title: (numberText: string) => `Entregar pedido ${numberText}`,
  description: 'Elige el cliente y, por presentación, de qué lotes salen los envases.',
  customer: 'Cliente',
  customerPlaceholder: 'Busca un cliente por su nombre',
  customerEmpty: 'Ningún cliente coincide con la búsqueda.',
  progress: (ordered: number, delivered: number, remaining: number) =>
    `Pedidos ${ordered} · Entregados ${delivered} · Faltan ${remaining}`,
  complete: 'Completa',
  noBatches: 'No hay lotes con envases disponibles para esta presentación.',
  lot: 'Lote',
  available: 'Disponibles',
  entry: 'Entrada',
  expiry: 'Vence',
  packages: (lot: string) => `Envases del lote ${lot}`,
  lineExceeds: 'Los envases escritos superan los que faltan por entregar.',
  batchExceeds: 'Los envases escritos superan los disponibles en el lote.',
  whole: 'Escribe un número entero de envases.',
  customerRequired: 'Elige el cliente de la entrega.',
  empty: 'No hay nada que entregar: escribe los envases de al menos un lote.',
  adjusted: 'Algunos lotes del borrador ya no están disponibles y se quitaron sus envases.',
  submit: 'Entregar',
  submitting: 'Entregando…',
  cancel: 'Cancelar',
  delivered: 'Entrega registrada',
  completed: 'Pedido entregado',
} as const;

const REREAD_CODES: ReadonlySet<ErrorState['code']> = new Set([
  'delivery_exceeds_remaining',
  'delivery_batch_insufficient',
]);

const WHOLE_NUMBER = /^\d+$/;

type FieldValue = { readonly kind: 'empty' } | { readonly kind: 'invalid' } | { readonly kind: 'number'; readonly value: number };

function parsePackages(text: string): FieldValue {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  if (!WHOLE_NUMBER.test(trimmed)) return { kind: 'invalid' };
  return { kind: 'number', value: Number(trimmed) };
}

function unexpectedFromRejection(): ErrorState {
  return {
    status: 'error',
    code: UNEXPECTED_ERROR_CODE,
    message: errorMessage(UNEXPECTED_ERROR_CODE),
    reference: newRequestId(),
  };
}

type Evaluation = {
  readonly invalidKeys: ReadonlySet<string>;
  readonly check: DeliveryCheck;
  readonly allocations: readonly DeliveryAllocation[];
};

function evaluate(view: OrderDeliveryView, draft: OrderDeliveryDraft): Evaluation {
  const invalidKeys = new Set<string>();
  const allocations: DeliveryAllocation[] = [];
  for (const line of view.lines) {
    for (const batch of line.batches) {
      const key = packagesKey(line.presentationLineId, batch.batchId);
      const parsed = parsePackages(draft.packages[key] ?? '');
      if (parsed.kind === 'invalid') invalidKeys.add(key);
      if (parsed.kind === 'number' && parsed.value > 0) {
        allocations.push({
          presentationLineId: line.presentationLineId,
          batchId: batch.batchId,
          packages: parsed.value,
        });
      }
    }
  }
  const check = checkDelivery(
    view.lines,
    view.lines.flatMap((line) =>
      line.batches.map((batch) => ({
        batchId: batch.batchId,
        presentationLineId: line.presentationLineId,
        availablePackages: batch.availablePackages,
      })),
    ),
    allocations,
  );
  return { invalidKeys, check, allocations };
}

function ErrorNotice({ error, testId }: { readonly error: ErrorState; readonly testId: string }) {
  return (
    <ErrorAlert
      error={error}
      className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
      testId={testId}
      withDataCode
    />
  );
}

function FieldWarning({ id, testId, children }: { readonly id?: string; readonly testId: string; readonly children: string }) {
  return (
    <p id={id} className="text-sm text-destructive" data-testid={testId}>
      {children}
    </p>
  );
}

export type OrderDeliverySheetProps = {
  readonly order: Pick<OrderSummary, 'id' | 'numberText'>;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ErrorState }
  | { readonly kind: 'ready'; readonly view: OrderDeliveryView };

/**
 * Registra una entrega parcial o total de un pedido terminado. El borrador vive en el navegador
 * hasta que la entrega se aplica o se cancela; cerrar el panel de cualquier otra forma lo conserva.
 */
export function OrderDeliverySheet({ order, open, onOpenChange }: OrderDeliverySheetProps) {
  const router = useRouter();
  const customerFieldId = useId();
  const customerErrorId = useId();
  const store = useOrderDeliveryDraft(order.id);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [draft, setDraft] = useState<OrderDeliveryDraft | null>(null);
  const [adjusted, setAdjusted] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [rejected, setRejected] = useState<ErrorState | null>(null);
  const [submitError, setSubmitError] = useState<ErrorState | null>(null);
  const [isPending, startTransition] = useTransition();
  const draftRef = useRef<OrderDeliveryDraft | null>(null);

  const applyDraft = useCallback(
    (next: OrderDeliveryDraft) => {
      draftRef.current = next;
      setDraft(next);
      store.save(next);
    },
    [store],
  );

  const readView = useCallback(async () => {
    let result: OrderDeliveryResult;
    try {
      result = await getOrderDeliveryAction(order.id);
    } catch {
      result = unexpectedFromRejection();
    }
    if (result.status === 'error') {
      if (draftRef.current === null) setLoad({ kind: 'error', error: result });
      else setSubmitError(result);
      return;
    }
    const view = result.data;
    const loaded =
      draftRef.current === null ? store.load(view) : adjustOrderDeliveryDraft(draftRef.current, view);
    applyDraft(loaded.draft);
    setAdjusted(loaded.adjusted);
    setLoad({ kind: 'ready', view });
  }, [applyDraft, order.id, store]);

  useEffect(() => {
    void readView();
  }, [readView]);

  const view = load.kind === 'ready' ? load.view : null;
  const evaluation = view !== null && draft !== null ? evaluate(view, draft) : null;

  function changePackages(key: string, text: string) {
    if (draft === null) return;
    applyDraft({ ...draft, packages: { ...draft.packages, [key]: text } });
  }

  function changeCustomer(choice: OrderCustomerChoice | null) {
    if (draft === null) return;
    applyDraft({ ...draft, customer: choice?.kind === 'customer' ? choice.customer : null });
  }

  function cancel() {
    store.clear();
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null || evaluation === null || isPending) return;
    setAttempted(true);
    if (draft.customer === null || evaluation.invalidKeys.size > 0 || evaluation.check.kind !== 'ok') return;

    const input = {
      orderId: order.id,
      deliveryKey: draft.deliveryKey,
      customerId: draft.customer.id,
      allocations: evaluation.allocations,
    };
    startTransition(async () => {
      let result: DeliverOrderActionResult;
      try {
        result = await deliverOrderAction(input);
      } catch {
        result = unexpectedFromRejection();
      }

      if (result.status === 'success') {
        store.clear();
        onOpenChange(false);
        toast.success(result.data.orderStatus === 'ENTREGADO' ? LABELS.completed : LABELS.delivered);
        router.refresh();
        return;
      }

      if (REREAD_CODES.has(result.code)) {
        setSubmitError(null);
        setRejected(result);
        await readView();
        return;
      }
      setRejected(null);
      setSubmitError(result);
    });
  }

  const customerChoice: OrderCustomerChoice | null =
    draft === null || draft.customer === null ? null : { kind: 'customer', customer: draft.customer };
  const showCustomerError = attempted && draft !== null && draft.customer === null;
  const showEmptyError =
    attempted && evaluation !== null && evaluation.invalidKeys.size === 0 && evaluation.check.kind === 'empty';

  return (
    <Sheet open={open} onOpenChange={onOpenChange} disableEscapeDismissal={false} disablePointerDismissal={false}>
      <SheetContent
        side="right"
        className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-lg"
        data-testid={ORDER_DELIVERY_SHEET_TESTID}
        isForm={view !== null}
        formProps={{ onSubmit: submit, noValidate: true }}
        footer={
          view === null ? undefined : (
            <>
              <Button
                type="button"
                variant="outline"
                className={touchTarget}
                onClick={cancel}
                data-testid={ORDER_DELIVERY_CANCEL_TESTID}
              >
                {LABELS.cancel}
              </Button>
              <Button
                type="submit"
                className={touchTarget}
                disabled={isPending}
                data-testid={ORDER_DELIVERY_SUBMIT_TESTID}
              >
                {isPending ? LABELS.submitting : LABELS.submit}
              </Button>
            </>
          )
        }
      >
        <SheetHeader>
          <SheetTitle>{LABELS.title(order.numberText)}</SheetTitle>
          <SheetDescription>{LABELS.description}</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {load.kind === 'loading' ? (
            <div className="flex flex-col gap-3" data-testid={ORDER_DELIVERY_SKELETON_TESTID} aria-hidden="true">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {load.kind === 'error' ? <ErrorNotice error={load.error} testId={ORDER_DELIVERY_ERROR_TESTID} /> : null}

          {view !== null && draft !== null && evaluation !== null ? (
            <>
              {rejected === null ? null : <ErrorNotice error={rejected} testId={ORDER_DELIVERY_REJECTED_TESTID} />}
              {submitError === null ? null : (
                <ErrorNotice error={submitError} testId={ORDER_DELIVERY_ERROR_TESTID} />
              )}
              {adjusted ? (
                <p
                  role="status"
                  className="rounded-lg border border-amber-500/40 p-3 text-sm"
                  data-testid={ORDER_DELIVERY_DRAFT_ADJUSTED_TESTID}
                >
                  {LABELS.adjusted}
                </p>
              ) : null}

              <div className="flex flex-col gap-2">
                <label htmlFor={customerFieldId} className="text-sm font-medium">
                  {LABELS.customer}
                </label>
                <OrderCustomerPicker
                  purpose="deliver"
                  id={customerFieldId}
                  value={customerChoice}
                  onChange={changeCustomer}
                  disabled={isPending}
                  placeholder={LABELS.customerPlaceholder}
                  emptyMessage={LABELS.customerEmpty}
                  aria-invalid={showCustomerError}
                  aria-describedby={showCustomerError ? customerErrorId : undefined}
                />
                {showCustomerError ? (
                  <FieldWarning id={customerErrorId} testId={ORDER_DELIVERY_CUSTOMER_ERROR_TESTID}>
                    {LABELS.customerRequired}
                  </FieldWarning>
                ) : null}
              </div>

              {view.lines.map((line) => {
                const lineExceeds =
                  evaluation.check.kind === 'exceeds_remaining' &&
                  evaluation.check.presentationLineIds.includes(line.presentationLineId);
                return (
                  <section
                    key={line.presentationLineId}
                    className="flex flex-col gap-3 rounded-lg border p-3"
                    data-testid={ORDER_DELIVERY_LINE_TESTID}
                    data-presentation-line-id={line.presentationLineId}
                    aria-label={line.presentationName}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-base font-medium">{line.presentationName}</h3>
                      {line.remainingPackages === 0 ? (
                        <span
                          className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
                          data-testid={ORDER_DELIVERY_LINE_COMPLETE_TESTID}
                        >
                          {LABELS.complete}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {LABELS.progress(line.orderedPackages, line.deliveredPackages, line.remainingPackages)}
                    </p>
                    {line.remainingPackages > 0 && line.batches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{LABELS.noBatches}</p>
                    ) : null}
                    {line.remainingPackages > 0
                      ? line.batches.map((batch) => {
                          const key = packagesKey(line.presentationLineId, batch.batchId);
                          const invalid = evaluation.invalidKeys.has(key);
                          const batchExceeds =
                            evaluation.check.kind === 'exceeds_batch' &&
                            evaluation.check.batchIds.includes(batch.batchId);
                          const wholeId = `${customerFieldId}-${key}-whole`;
                          const exceedsId = `${customerFieldId}-${key}-exceeds`;
                          const describedBy = [invalid ? wholeId : null, batchExceeds ? exceedsId : null]
                            .filter((id) => id !== null)
                            .join(' ');
                          return (
                            <div
                              key={batch.batchId}
                              className="flex flex-col gap-2 border-t pt-3"
                              data-testid={ORDER_DELIVERY_BATCH_TESTID}
                              data-batch-id={batch.batchId}
                            >
                              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
                                <div>
                                  <dt className="text-xs text-muted-foreground">{LABELS.lot}</dt>
                                  <dd>{batch.lot}</dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-muted-foreground">{LABELS.available}</dt>
                                  <dd>{batch.availablePackages}</dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-muted-foreground">{LABELS.entry}</dt>
                                  <dd>{batch.purchaseDate}</dd>
                                </div>
                                {batch.expiryDate === null ? null : (
                                  <div>
                                    <dt className="text-xs text-muted-foreground">{LABELS.expiry}</dt>
                                    <dd>{batch.expiryDate}</dd>
                                  </div>
                                )}
                              </dl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                aria-label={LABELS.packages(batch.lot)}
                                aria-invalid={invalid || batchExceeds || lineExceeds}
                                aria-describedby={describedBy === '' ? undefined : describedBy}
                                className="min-h-11 text-base md:text-base"
                                value={draft.packages[key] ?? ''}
                                onChange={(event) => changePackages(key, event.target.value)}
                                disabled={isPending}
                                data-testid={ORDER_DELIVERY_BATCH_PACKAGES_TESTID}
                              />
                              {invalid ? (
                                <FieldWarning id={wholeId} testId={ORDER_DELIVERY_WHOLE_ERROR_TESTID}>
                                  {LABELS.whole}
                                </FieldWarning>
                              ) : null}
                              {batchExceeds ? (
                                <FieldWarning id={exceedsId} testId={ORDER_DELIVERY_BATCH_EXCEEDS_TESTID}>
                                  {LABELS.batchExceeds}
                                </FieldWarning>
                              ) : null}
                            </div>
                          );
                        })
                      : null}
                    {lineExceeds ? (
                      <FieldWarning testId={ORDER_DELIVERY_LINE_EXCEEDS_TESTID}>{LABELS.lineExceeds}</FieldWarning>
                    ) : null}
                  </section>
                );
              })}

              {showEmptyError ? (
                <FieldWarning testId={ORDER_DELIVERY_EMPTY_ERROR_TESTID}>{LABELS.empty}</FieldWarning>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
