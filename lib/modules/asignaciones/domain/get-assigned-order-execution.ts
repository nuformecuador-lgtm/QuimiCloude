// lib/modules/asignaciones/domain/get-assigned-order-execution.ts
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError, ValidationError } from './errors';

import type { AssignedOrderExecutionView, ExecutionLineView } from './assigned-order-execution-view';
import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import { formatOrderNumber, type OrderCatalog } from '@/lib/modules/pedidos';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitRef } from '@/lib/modules/unidades';

const getAssignedOrderExecutionSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type GetAssignedOrderExecutionDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly orders: OrderCatalog;
  readonly recipes: RecipeCatalog;
  readonly units: UnitCatalog;
  readonly products: ProductCatalog;
  readonly presentations: PresentationCatalog;
};

/** La base efectiva de una unidad: la que declara, o ella misma si no deriva de nadie. */
function effectiveBase(unit: Pick<UnitRef, 'id' | 'baseUnitId'>): string {
  return unit.baseUnitId ?? unit.id;
}

export function createGetAssignedOrderExecution(
  deps: GetAssignedOrderExecutionDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<AssignedOrderExecutionView> {
  return async function getAssignedOrderExecution(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<AssignedOrderExecutionView> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'asignaciones.consultar');

    const parsed = getAssignedOrderExecutionSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    // «No es tuyo» y «no existe» son la misma respuesta desde fuera.
    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);
    if (!ids.includes(orderId)) throw new OrderNotFoundError();

    const target = await deps.orders.findAliveById(orderId, actor.companyId);
    if (target === null) throw new OrderNotFoundError();
    if (target.status !== 'PENDIENTE' && target.status !== 'EN_CURSO') {
      throw new OrderNotFoundError();
    }

    const summaryPage = await deps.orders.listAliveSummariesByIds(
      actor.companyId,
      [orderId],
      [target.status],
      1,
      1,
    );
    const summary = summaryPage.items[0];
    if (summary === undefined) throw new OrderNotFoundError();

    const content = await deps.recipes.findExecutionContentById(summary.recipeId, actor.companyId);
    const recipeName = content !== null && !content.isDeleted ? content.name : null;
    const steps = content?.steps ?? [];
    const lines = content?.lines ?? [];

    const productIds = [...new Set(lines.map((line) => line.productId))];
    const productRefs = productIds.length > 0 ? await deps.products.findRefs(productIds, actor.companyId) : [];
    const productNames = new Map(productRefs.map((ref) => [ref.id, ref.name]));

    const unitIds = [...new Set(lines.map((line) => line.unitId))];
    const ownUnits = unitIds.length > 0 ? await deps.units.findRefs(unitIds, actor.companyId) : [];
    const ownUnitsById = new Map(ownUnits.map((unit) => [unit.id, unit]));

    const sisterUnits =
      unitIds.length > 0
        ? await deps.units.findRefsSharingBaseInCompany(actor.companyId, unitIds)
        : [];
    const sistersByBase = new Map<string, UnitRef[]>();
    for (const unit of sisterUnits) {
      const base = effectiveBase(unit);
      const grupo = sistersByBase.get(base) ?? [];
      grupo.push(unit);
      sistersByBase.set(base, grupo);
    }

    const executionLines: ExecutionLineView[] = lines.map((line) => {
      const unit: UnitRef = ownUnitsById.get(line.unitId) ?? {
        id: line.unitId,
        name: line.unitId,
        symbol: null,
        baseUnitId: null,
        factor: null,
      };
      const base = effectiveBase(unit);
      const alternativeUnits = (sistersByBase.get(base) ?? []).filter(
        (sister) => sister.id !== unit.id,
      );

      return {
        productName: productNames.get(line.productId) ?? null,
        quantity: line.quantity,
        unit,
        alternativeUnits,
      };
    });

    const presentations =
      summary.presentationId === null
        ? []
        : await deps.presentations.findRefs([summary.presentationId], actor.companyId);
    const presentationName = presentations[0]?.name ?? null;

    return {
      orderId: summary.id,
      numberText: formatOrderNumber(summary.number),
      status: target.status,
      recipeName,
      orderQuantity: summary.quantity,
      recipeBaseQuantity: null,
      scaleFactorText: null,
      steps,
      lines: executionLines,
      presentationName,
    };
  };
}
