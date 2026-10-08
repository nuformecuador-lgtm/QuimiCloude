/**
 * E2E de las pestañas del acondicionador en `/asignacion` (R22) y de quién NO las ve (R23).
 *
 * R22 recorre con el Administrador de acondicionamiento «Por acondicionar» -un pedido con dos
 * líneas de reparto y otro que acondiciona otra persona-, el detalle de solo lectura, y
 * «Terminados», que lista solo el TERMINADO que acondicionó él: ni el de otro ni un ENTREGADO suyo.
 * R23 comprueba, con un `test` por rol, que Administrador, Operador y Empacador no ven la pestaña,
 * tampoco pidiéndola por la dirección, y que el detalle les responde 404.
 *
 * LOS PEDIDOS SE SIEMBRAN DIRECTAMENTE con `prisma`, cumpliendo los CHECK de `orders`: el recorrido
 * de empaque que los deja «Por acondicionar» ya lo cubre `e2e/empaque.spec.ts`, y ninguna vía de
 * la aplicación produce todavía un ENTREGADO desde TERMINADO.
 *
 * AISLAMIENTO: prefijo propio `qc217_e2e_` + `RUN_ID` por proceso de worker, empresa efímera
 * -`companies_name_unique` es GLOBAL- y limpieza de huérfanos por prefijo Y POR EDAD, porque
 * Chromium y WebKit corren a la vez sobre la misma base.
 *
 * Los roles son los REALES del seed, nunca un fixture: sus permisos son el dato bajo prueba.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  buildDisplayName,
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { ASSIGNED_ORDERS_ROUTE, conditioningOrderRoute } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';
import { seedPackaging } from './helpers/packaging';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de él se toca. */
const FIXTURE_PREFIX = 'qc217_e2e_';

/** Identificador único de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalación: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;

/** Las dos líneas del reparto del pedido A, cada una con su presentación y su envase. */
const PRESENTATION_1_NAME = `${SHARED_TOKEN}_pres1`;
const PRESENTATION_2_NAME = `${SHARED_TOKEN}_pres2`;
const PACKAGING_1_NAME = `${SHARED_TOKEN}_envase1`;
const PACKAGING_2_NAME = `${SHARED_TOKEN}_envase2`;
const PACKAGING_1_LOT = `${SHARED_TOKEN}_le1`;
const PACKAGING_2_LOT = `${SHARED_TOKEN}_le2`;
const PACKAGING_STOCK = '10';
const PACKAGING_UNIT_COST = '0.5000';
const PRESENTATION_CONTENT = '1';
const LINE_1_PACKAGES = 2;
const LINE_2_PACKAGES = 3;
const ORDER_QUANTITY = String(LINE_1_PACKAGES + LINE_2_PACKAGES);

type Credentials = { readonly username: string; readonly password: string };

function credentials(suffix: string, label: string): Credentials {
  return {
    username: `${SHARED_TOKEN}_${suffix}`,
    password: `Qc217-${label}-${RUN_ID.slice(0, 12)}`,
  };
}

/** El acondicionador del recorrido R22. */
const conditioner1User = credentials('acond1', 'Acond1');
/** Acondiciona B y D: su nombre sale en la fila de B y su TERMINADO no sale en el del 1. */
const conditioner2User = credentials('acond2', 'Acond2');
/** Los tres roles sin `acondicionamiento.modificar` (R23); el Empacador además empaca. */
const adminUser = credentials('admin', 'Admin');
const operatorUser = credentials('operador', 'Operador');
const empacadorUser = credentials('empacador', 'Empacador');

const ALL_USERS = [conditioner1User, conditioner2User, adminUser, operatorUser, empacadorUser];

const firstNames = `Qc217${RUN_ID.slice(0, 8)}`;
const LAST_NAMES_BY_USERNAME: Readonly<Record<string, string>> = {
  [conditioner1User.username]: 'Acondiuno',
  [conditioner2User.username]: 'Acondidos',
  [adminUser.username]: 'Administra',
  [operatorUser.username]: 'Operador',
  [empacadorUser.username]: 'Empacador',
};

/**
 * Posición inicial de la serie de este fixture. Alta y aleatoria para no chocar con
 * `orders_company_year_sequence_key` ni con el worker del otro navegador.
 */
const BASE_SEQUENCE = 900_000 + Math.floor(Math.random() * 90_000);

/** `/asignacion`, sus pestañas y sus dos secciones del acondicionador. */
const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const ASSIGNMENT_VIEW_TABS_TESTID = 'assignment-view-tabs';
const ASSIGNMENT_VIEW_TAB_TESTID_PREFIX = 'assignment-view-tab-';
const TAB_POR_ACONDICIONAR_TESTID = 'assignment-view-tab-por_acondicionar';
const TAB_ACONDICIONADOS_TESTID = 'assignment-view-tab-acondicionados';
const CONDITIONING_SECTION_TESTID = 'conditioning-orders-list-section';
const CONDITIONED_SECTION_TESTID = 'conditioned-orders-list-section';
const VIEW_PARAM = 'vista';
const VIEW_POR_ACONDICIONAR = 'por_acondicionar';

/** La fila de la tabla compartida y sus celdas. */
const TABLE_ROW_TESTID_PREFIX = 'data-table-row-';
const ORDER_NUMBER_CELL_TESTID = 'data-table-cell-orderNumber';
const CONDITIONING_ORDER_LINK_TESTID = 'conditioning-order-link';
const ORDER_DISTRIBUTION_FULL_TESTID = 'order-distribution-full';
const ROW_STATUS_TESTID = 'conditioning-order-status';

/** El detalle de solo lectura, `conditioning-order-screen.tsx`. */
const SCREEN_TESTID = 'conditioning-order-screen';
const SCREEN_NUMBER_TESTID = 'conditioning-order-number';
const SCREEN_STATUS_TESTID = 'conditioning-order-status';

/** El 404 de la zona privada, `app/(private)/not-found.tsx`. */
const PRIVATE_NOT_FOUND_TESTID = 'private-not-found';

let companyId: string | null = null;

type SeededOrder = { readonly id: string; readonly numberText: string };
/** A: POR_ACONDICIONAR con dos líneas. B: EN_ACONDICIONAMIENTO del 2. C: TERMINADO del 1.
 *  D: TERMINADO del 2. E: ENTREGADO del 1. */
let orders: Record<'A' | 'B' | 'C' | 'D' | 'E', SeededOrder> | null = null;

/** Igualdad EXACTA de texto: un correlativo no puede casar con un prefijo suyo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function rowByNumber(page: Page, numberText: string): Locator {
  return page
    .locator(`[data-testid^="${TABLE_ROW_TESTID_PREFIX}"]`)
    .filter({
      has: page.getByTestId(ORDER_NUMBER_CELL_TESTID).filter({ hasText: exactText(numberText) }),
    });
}

function porAcondicionarUrl(): string {
  const query = new URLSearchParams({ [VIEW_PARAM]: VIEW_POR_ACONDICIONAR });
  return `${ASSIGNED_ORDERS_ROUTE}?${query.toString()}`;
}

function seeded(): NonNullable<typeof orders> {
  if (orders === null) throw new Error('el fixture no existe: falló el beforeAll');
  return orders;
}

async function createUser(user: Credentials, roleId: string): Promise<string> {
  if (!companyId) throw new Error('la empresa del fixture no existe: falló el beforeAll');

  const created = await prisma.user.create({
    data: {
      firstNames,
      lastNames: LAST_NAMES_BY_USERNAME[user.username] ?? 'Fixture',
      birthDate: new Date('1990-01-01'),
      email: `${user.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: user.username,
      username: user.username,
      passwordHash: await createPasswordHash(user.password),
      roleId,
      companyId,
      // Explícito: la columna es `@default(pending)` y ese estado no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return created.id;
}

/** Borra lo de unas empresas del fixture, en el orden que imponen las FK RESTRICT. */
async function deleteCompanyData(companyIds: readonly string[]): Promise<unknown> {
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.orderPresentationLine.deleteMany({ where: { companyId: { in: [...companyIds] } } }),
    () => prisma.order.deleteMany({ where: { companyId: { in: [...companyIds] } } }),
    () => prisma.recipe.deleteMany({ where: { companyId: { in: [...companyIds] } } }),
    () => prisma.inventoryMovement.deleteMany({ where: { companyId: { in: [...companyIds] } } }),
    () => prisma.productBatch.deleteMany({ where: { companyId: { in: [...companyIds] } } }),
    () => prisma.product.deleteMany({ where: { companyId: { in: [...companyIds] } } }),
    () => prisma.presentation.deleteMany({ where: { companyId: { in: [...companyIds] } } }),
    () => prisma.user.deleteMany({ where: { companyId: { in: [...companyIds] } } }),
    () => prisma.company.deleteMany({ where: { id: { in: [...companyIds] } } }),
  ];

  let primerFallo: unknown;
  for (const paso of pasos) {
    try {
      await paso();
    } catch (error) {
      primerFallo ??= error;
    }
  }
  return primerFallo;
}

test.beforeAll(async () => {
  // Los roles nunca se crean aquí: `roles.name` es único y sus permisos son el dato bajo prueba.
  const roles = new Map<string, string>();
  for (const roleName of [ROLE_ACONDICIONAMIENTO, ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]) {
    const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) {
      throw new Error(
        `falta el rol "${roleName}": este E2E no lo crea porque sus permisos son el dato bajo ` +
          'prueba. Siembra la base con `pnpm run db:seed` antes de correr `pnpm run e2e`.',
      );
    }
    roles.set(roleName, role.id);
  }

  // LIMPIEZA DEFENSIVA DE HUÉRFANOS, solo de empresas de este prefijo con más de una hora.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  if (orphanCompanies.length > 0) {
    await deleteCompanyData(orphanCompanies.map((company) => company.id));
  }

  companyId = (
    await prisma.company.create({
      data: { name: COMPANY_NAME, nameNormalized: normalizeCompanyName(COMPANY_NAME) },
      select: { id: true },
    })
  ).id;

  const conditioner1Id = await createUser(conditioner1User, roles.get(ROLE_ACONDICIONAMIENTO)!);
  const conditioner2Id = await createUser(conditioner2User, roles.get(ROLE_ACONDICIONAMIENTO)!);
  const adminId = await createUser(adminUser, roles.get(ROLE_ADMINISTRADOR)!);
  await createUser(operatorUser, roles.get(ROLE_OPERADOR)!);
  const empacadorId = await createUser(empacadorUser, roles.get(ROLE_EMPACADOR)!);

  // La unidad NO se crea: es una de las del catálogo arrancador.
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

  async function seedLineSupplies(presentationName: string, packagingName: string, lot: string) {
    const presentation = await prisma.presentation.create({
      data: {
        name: presentationName,
        nameNormalized: normalizePresentationName(presentationName),
        unitId: unit.id,
        content: PRESENTATION_CONTENT,
        companyId: companyId!,
      },
      select: { id: true },
    });
    const packaging = await seedPackaging({
      companyId: companyId!,
      name: packagingName,
      presentationId: presentation.id,
      stock: PACKAGING_STOCK,
      unitCost: PACKAGING_UNIT_COST,
      lot,
      createdBy: adminId,
    });
    return { presentationId: presentation.id, packagingProductId: packaging.productId };
  }

  const supplies1 = await seedLineSupplies(PRESENTATION_1_NAME, PACKAGING_1_NAME, PACKAGING_1_LOT);
  const supplies2 = await seedLineSupplies(PRESENTATION_2_NAME, PACKAGING_2_NAME, PACKAGING_2_LOT);

  const recipeId = (
    await prisma.recipe.create({
      data: {
        name: RECIPE_NAME,
        nameNormalized: normalizeRecipeName(RECIPE_NAME),
        createdBy: adminId,
        companyId,
      },
      select: { id: true },
    })
  ).id;

  const year = new Date().getUTCFullYear();
  const finishedAt = new Date();

  // Cada fila cumple los CHECK de `orders`: `packed_by` desde el empaque, `conditioned_by` en
  // EN_ACONDICIONAMIENTO y TERMINADO (opcional en ENTREGADO), `finished_at` en TERMINADO.
  async function seedOrder(
    offset: number,
    data: {
      readonly status: 'POR_ACONDICIONAR' | 'EN_ACONDICIONAMIENTO' | 'TERMINADO' | 'ENTREGADO';
      readonly conditionedBy: string | null;
      readonly finishedAt: Date | null;
    },
  ): Promise<SeededOrder> {
    const sequence = BASE_SEQUENCE + offset;
    const order = await prisma.order.create({
      data: {
        companyId: companyId!,
        orderYear: year,
        orderSequence: sequence,
        recipeId,
        quantity: ORDER_QUANTITY,
        unitId: unit.id,
        status: data.status,
        packedBy: empacadorId,
        conditionedBy: data.conditionedBy,
        finishedAt: data.finishedAt,
      },
      select: { id: true },
    });
    return { id: order.id, numberText: formatOrderNumber({ year, sequence }) };
  }

  const orderA = await seedOrder(0, { status: 'POR_ACONDICIONAR', conditionedBy: null, finishedAt: null });
  // Dos inserciones con `createdAt` explícito: el reparto se pinta en orden de alta.
  const lineCreatedAt = Date.now();
  await prisma.orderPresentationLine.create({
    data: {
      orderId: orderA.id,
      companyId,
      presentationId: supplies1.presentationId,
      packages: LINE_1_PACKAGES,
      presentationContent: PRESENTATION_CONTENT,
      packagingProductId: supplies1.packagingProductId,
      createdAt: new Date(lineCreatedAt),
    },
  });
  await prisma.orderPresentationLine.create({
    data: {
      orderId: orderA.id,
      companyId,
      presentationId: supplies2.presentationId,
      packages: LINE_2_PACKAGES,
      presentationContent: PRESENTATION_CONTENT,
      packagingProductId: supplies2.packagingProductId,
      createdAt: new Date(lineCreatedAt + 1_000),
    },
  });

  orders = {
    A: orderA,
    B: await seedOrder(1, { status: 'EN_ACONDICIONAMIENTO', conditionedBy: conditioner2Id, finishedAt: null }),
    C: await seedOrder(2, { status: 'TERMINADO', conditionedBy: conditioner1Id, finishedAt }),
    D: await seedOrder(3, { status: 'TERMINADO', conditionedBy: conditioner2Id, finishedAt }),
    E: await seedOrder(4, { status: 'ENTREGADO', conditionedBy: conditioner1Id, finishedAt }),
  };
});

test.afterAll(async () => {
  // Solo la empresa de ESTE worker, nunca por `FIXTURE_PREFIX`: el otro proyecto sigue corriendo.
  const primerFallo = companyId === null ? undefined : await deleteCompanyData([companyId]);
  await prisma.user
    .deleteMany({ where: { username: { in: ALL_USERS.map((user) => user.username) } } })
    .catch(() => undefined);
  await prisma.$disconnect();
  if (primerFallo !== undefined) throw primerFallo;
});

// El primer `goto` hace que `next dev` compile la ruta bajo demanda, y bcrypt tarda a propósito.
test.setTimeout(180_000);

test.describe('las pestañas del acondicionador (R22)', () => {
  test('R22 - el acondicionador aterriza en Por acondicionar con el reparto completo y quién acondiciona, abre el detalle sin botones, y en Terminados ve solo el TERMINADO suyo', async ({
    page,
  }) => {
    const { A, B, C, D, E } = seeded();

    // --- 1. Aterriza en `/asignacion` con exactamente «Por acondicionar» y «Terminados».
    const landing = await loginAndLand(page, conditioner1User);
    expect(landing).toBe(ASSIGNED_ORDERS_ROUTE);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const tabs = page
      .getByTestId(ASSIGNMENT_VIEW_TABS_TESTID)
      .locator(`[data-testid^="${ASSIGNMENT_VIEW_TAB_TESTID_PREFIX}"]`);
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveAttribute('data-testid', TAB_POR_ACONDICIONAR_TESTID);
    await expect(tabs.nth(0)).toHaveText(exactText('Por acondicionar'));
    await expect(tabs.nth(1)).toHaveAttribute('data-testid', TAB_ACONDICIONADOS_TESTID);
    await expect(tabs.nth(1)).toHaveText(exactText('Terminados'));

    // --- 2. «Por acondicionar»: A con su reparto entero y B con el nombre de quien lo acondiciona.
    await expect(page.getByTestId(CONDITIONING_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });

    const rowA = rowByNumber(page, A.numberText);
    await expect(rowA).toHaveCount(1, { timeout: 60_000 });
    await expect(rowA.getByTestId(ORDER_DISTRIBUTION_FULL_TESTID)).toHaveText(
      exactText(
        `${LINE_1_PACKAGES} × ${PACKAGING_1_NAME} / ${LINE_2_PACKAGES} × ${PACKAGING_2_NAME}`,
      ),
    );
    await expect(rowA.getByTestId(ROW_STATUS_TESTID)).toHaveAttribute('data-status', 'POR_ACONDICIONAR');

    const rowB = rowByNumber(page, B.numberText);
    await expect(rowB).toHaveCount(1);
    await expect(rowB.getByTestId(ROW_STATUS_TESTID)).toHaveAttribute(
      'data-status',
      'EN_ACONDICIONAMIENTO',
    );
    await expect(rowB).toContainText(
      buildDisplayName(
        firstNames,
        LAST_NAMES_BY_USERNAME[conditioner2User.username]!,
        conditioner2User.username,
      ),
    );

    // --- 3. El número de A abre el detalle: número, estado y ningún botón.
    await rowA.getByTestId(CONDITIONING_ORDER_LINK_TESTID).click();
    await page.waitForURL((url) => url.pathname === conditioningOrderRoute(A.id), {
      timeout: 60_000,
    });
    const screenA = page.getByTestId(SCREEN_TESTID);
    await expect(screenA).toBeVisible({ timeout: 60_000 });
    await expect(screenA.getByTestId(SCREEN_NUMBER_TESTID)).toHaveText(exactText(A.numberText));
    await expect(screenA.getByTestId(SCREEN_STATUS_TESTID)).toHaveAttribute(
      'data-status',
      'POR_ACONDICIONAR',
    );
    await expect(screenA.locator('button')).toHaveCount(0);
    await expect(screenA.getByRole('button')).toHaveCount(0);

    // --- 4. «Terminados»: C sí; D (de otro) y E (ENTREGADO suyo) no.
    await page.goto(ASSIGNED_ORDERS_ROUTE);
    await page.getByTestId(TAB_ACONDICIONADOS_TESTID).click();
    await expect(page.getByTestId(CONDITIONED_SECTION_TESTID)).toBeVisible({ timeout: 60_000 });

    const rowC = rowByNumber(page, C.numberText);
    await expect(rowC).toHaveCount(1, { timeout: 60_000 });
    await expect(rowByNumber(page, D.numberText)).toHaveCount(0);
    await expect(rowByNumber(page, E.numberText)).toHaveCount(0);

    // --- 5. El número de C abre su detalle.
    await rowC.getByTestId(CONDITIONING_ORDER_LINK_TESTID).click();
    await page.waitForURL((url) => url.pathname === conditioningOrderRoute(C.id), {
      timeout: 60_000,
    });
    const screenC = page.getByTestId(SCREEN_TESTID);
    await expect(screenC).toBeVisible({ timeout: 60_000 });
    await expect(screenC.getByTestId(SCREEN_NUMBER_TESTID)).toHaveText(exactText(C.numberText));
    await expect(screenC.getByTestId(SCREEN_STATUS_TESTID)).toHaveAttribute('data-status', 'TERMINADO');
  });
});

test.describe('quien no tiene acondicionamiento.modificar no ve las pestañas (R23)', () => {
  const ROLES_WITHOUT_PERMISSION: ReadonlyArray<{ readonly role: string; readonly user: Credentials }> = [
    { role: ROLE_ADMINISTRADOR, user: adminUser },
    { role: ROLE_OPERADOR, user: operatorUser },
    { role: ROLE_EMPACADOR, user: empacadorUser },
  ];

  for (const { role, user } of ROLES_WITHOUT_PERMISSION) {
    test(`R23 - ${role} no ve «Por acondicionar» en /asignacion, tampoco pidiéndola por la dirección, y el detalle le responde 404`, async ({
      page,
    }) => {
      const { A } = seeded();

      await loginAndLand(page, user);

      // --- 1. En `/asignacion` no está la pestaña.
      await page.goto(ASSIGNED_ORDERS_ROUTE);
      await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId(TAB_POR_ACONDICIONAR_TESTID)).toHaveCount(0);
      await expect(page.getByTestId(TAB_ACONDICIONADOS_TESTID)).toHaveCount(0);

      // --- 2. Pedida por la dirección tampoco aparece, ni su sección.
      await page.goto(porAcondicionarUrl());
      await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId(TAB_POR_ACONDICIONAR_TESTID)).toHaveCount(0);
      // Sin afirmar sobre la fila de A: el Administrador cae en «Todos», que lista los pedidos
      // de la empresa en cualquier estado.
      await expect(page.getByTestId(CONDITIONING_SECTION_TESTID)).toHaveCount(0);

      // --- 3. El detalle de un POR_ACONDICIONAR de su empresa responde el 404 de la zona privada.
      const response = await page.goto(conditioningOrderRoute(A.id));
      expect(
        response?.status(),
        'sin acondicionamiento.modificar el detalle debe responder 404, indistinguible de una ruta que no existe',
      ).toBe(404);
      await expect(page.getByTestId(PRIVATE_NOT_FOUND_TESTID)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId(SCREEN_TESTID)).toHaveCount(0);
    });
  }
});
