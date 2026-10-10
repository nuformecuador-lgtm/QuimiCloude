import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_COVERAGE_LABELS,
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_LABELS,
  OrderCoverageBadge,
  OrderPriorityBadge,
  OrderStatusBadge,
} from '@/app/(private)/pedidos/components';
import {
  USER_STATUS_BADGE_TESTID,
  UserStatusBadge,
} from '@/app/(private)/configuracion/usuarios/components';
import { ProductBatchesPanel } from '@/app/(private)/inventario/components';
import {
  RecipeVersionForm,
  RecipeVersionList,
} from '@/app/(private)/produccion/formulas/components';
import { Badge, badgeVariants } from '@/components/ui/badge';
import type { UserAccountStatus } from '@/lib/modules/identity';
import type { OrderCoverage } from '@/lib/modules/inventario';
import type { OrderPriority, OrderStatus } from '@/lib/modules/pedidos';
import type { RecipeDetail } from '@/lib/modules/recetas';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  createRecipeVersionAction: vi.fn(),
  updateRecipeVersionAction: vi.fn(),
  listRecipeVersionsAction: vi.fn(),
  deleteRecipeAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

type Tone = 'success' | 'warning' | 'destructive' | 'info' | 'neutral';

/** Las dos clases de color que pinta cada tono: fondo y texto. */
const TONE_CLASSES: Readonly<Record<Tone, readonly [string, string]>> = {
  success: ['bg-success-subtle', 'text-success-text'],
  warning: ['bg-warning-subtle', 'text-warning-text'],
  destructive: ['bg-destructive-subtle', 'text-destructive-text'],
  info: ['bg-info-subtle', 'text-info-text'],
  neutral: ['bg-muted', 'text-muted-foreground'],
};

function expectTone(element: HTMLElement, tone: Tone): void {
  for (const cls of TONE_CLASSES[tone]) {
    expect(element).toHaveClass(cls);
  }
  for (const [other, classes] of Object.entries(TONE_CLASSES) as [Tone, readonly string[]][]) {
    if (other === tone) continue;
    expect(element).not.toHaveClass(classes[0]);
  }
}

const STATUS_TONES: Readonly<Record<OrderStatus, Tone>> = {
  PENDIENTE: 'neutral',
  EN_CURSO: 'info',
  EN_EMPAQUE: 'info',
  EN_ACONDICIONAMIENTO: 'info',
  POR_EMPACAR: 'warning',
  POR_ACONDICIONAR: 'warning',
  TERMINADO: 'success',
  ENTREGADO: 'success',
  CANCELADO: 'destructive',
  BLOQUEADO: 'destructive',
};

const PRIORITY_TONES: Readonly<Record<OrderPriority, Tone>> = {
  BAJA: 'neutral',
  MEDIA: 'info',
  ALTA: 'warning',
  CRITICA: 'destructive',
};

const COVERAGE_TONES: Readonly<Record<OrderCoverage, Tone>> = {
  full: 'success',
  none: 'neutral',
  partial: 'warning',
};

const USER_TONES: Readonly<Record<UserAccountStatus, Tone>> = {
  active: 'success',
  pending: 'warning',
  inactive: 'neutral',
  blocked: 'destructive',
};

describe('badges de estado con la nueva marca', () => {
  it('R1: el Badge ofrece los cinco tonos con su fondo subtle y su texto, y destructive es el de error', () => {
    for (const tone of Object.keys(TONE_CLASSES) as Tone[]) {
      render(
        <Badge variant={tone} data-testid={`badge-${tone}`}>
          x
        </Badge>,
      );
      expectTone(screen.getByTestId(`badge-${tone}`), tone);
    }
    const destructive = badgeVariants({ variant: 'destructive' });
    expect(destructive).not.toMatch(
      /(^|\s)bg-destructive\/10|dark:bg-destructive\/20|focus-visible:ring-destructive\//,
    );
  });

  it('R1: el foco del badge es un contorno opaco con separacion, sin anillo translucido', () => {
    const classes = badgeVariants({ variant: 'info' }).split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining([
        'focus-visible:outline-2',
        'focus-visible:outline-offset-2',
        'focus-visible:outline-ring',
      ]),
    );
    expect(classes.some((cls) => /(ring|outline)-ring\/\d+/.test(cls))).toBe(false);
  });

  it('R3: cada estado de pedido se pinta con su tono', () => {
    for (const status of Object.keys(STATUS_TONES) as OrderStatus[]) {
      const { unmount } = render(<OrderStatusBadge status={status} />);
      expectTone(screen.getByTestId('order-status'), STATUS_TONES[status]);
      unmount();
    }
  });

  it('R4: cada prioridad de pedido se pinta con su tono', () => {
    for (const priority of Object.keys(PRIORITY_TONES) as OrderPriority[]) {
      const { unmount } = render(<OrderPriorityBadge priority={priority} />);
      expectTone(screen.getByTestId('order-priority'), PRIORITY_TONES[priority]);
      unmount();
    }
  });

  it('R5: cada cobertura de pedido se pinta con su tono', () => {
    for (const coverage of Object.keys(COVERAGE_TONES) as OrderCoverage[]) {
      const { unmount } = render(<OrderCoverageBadge coverage={coverage} />);
      expectTone(screen.getByTestId('order-coverage'), COVERAGE_TONES[coverage]);
      unmount();
    }
  });

  it('R6: cada estado de cuenta de usuario se pinta con su tono', () => {
    for (const status of Object.keys(USER_TONES) as UserAccountStatus[]) {
      const { unmount } = render(<UserStatusBadge status={status} />);
      expectTone(screen.getByTestId(USER_STATUS_BADGE_TESTID), USER_TONES[status]);
      unmount();
    }
  });

  it('R7: «Sobre-reservado» del panel de lotes es un badge de tono error con su testid y su texto', () => {
    render(
      <ProductBatchesPanel
        batches={[
          {
            id: 'b1',
            lot: 'L-001',
            stock: '5',
            unitId: null,
            purchaseDate: '2026-03-05',
            expiryDate: null,
            packageContent: null,
            reserved: '8',
            available: '0',
            overReserved: true,
          },
        ]}
      />,
    );
    const marca = screen.getByTestId('product-batch-over-reserved');
    expect(marca).toHaveAttribute('data-slot', 'badge');
    expect(marca).toHaveTextContent('Sobre-reservado');
    expectTone(marca, 'destructive');
  });

  it('R8: «En revisión» se pinta con el tono de información en la lista de versiones', () => {
    render(
      <RecipeVersionList
        originalId="11111111-1111-4111-8111-111111111111"
        versions={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Sin sal',
            displayName: 'Jabón · Sin sal',
            isUnderReview: true,
            updatedAt: new Date('2026-09-02T00:00:00Z'),
          },
        ]}
      />,
    );
    expectTone(screen.getByTestId('recipe-version-under-review'), 'info');
  });

  it('R8: «En revisión» se pinta con el tono de información en el formulario de versión', () => {
    const version: RecipeDetail = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Sin sal',
      description: null,
      imageUrl: null,
      stepCount: 0,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-02T00:00:00Z'),
      createdBy: null,
      updatedBy: null,
      steps: [],
      packingSteps: [],
      lines: [],
      tools: [],
      original: { id: '11111111-1111-4111-8111-111111111111', name: 'Jabón' },
      isUnderReview: true,
      displayName: 'Jabón · Sin sal',
    };
    render(
      <RecipeVersionForm
        mode="edit"
        original={{ id: '11111111-1111-4111-8111-111111111111', name: 'Jabón', lines: [], tools: [] }}
        version={version}
        units={[]}
        initialProductPage={{ items: [], totalPages: 1 }}
        initialMachinePage={{ items: [], totalPages: 1 }}
      />,
    );
    expectTone(screen.getByTestId('recipe-version-form-under-review'), 'info');
  });

  it('R9: los badges conservan su texto visible, su data-testid y sus atributos data-*', () => {
    render(
      <>
        <OrderStatusBadge status="BLOQUEADO" />
        <OrderPriorityBadge priority="ALTA" />
        <OrderCoverageBadge coverage="partial" />
        <UserStatusBadge status="pending" />
      </>,
    );
    const status = screen.getByTestId('order-status');
    expect(status).toHaveAttribute('data-status', 'BLOQUEADO');
    expect(status).toHaveTextContent(ORDER_STATUS_LABELS.BLOQUEADO);

    const priority = screen.getByTestId('order-priority');
    expect(priority).toHaveAttribute('data-priority', 'ALTA');
    expect(priority).toHaveTextContent(ORDER_PRIORITY_LABELS.ALTA);

    const coverage = screen.getByTestId('order-coverage');
    expect(coverage).toHaveAttribute('data-coverage', 'partial');
    expect(coverage).toHaveTextContent(ORDER_COVERAGE_LABELS.partial);

    const user = screen.getByTestId(USER_STATUS_BADGE_TESTID);
    expect(user).toHaveAttribute('data-status', 'pending');
    expect(user.textContent?.trim()).not.toBe('');
  });
});
