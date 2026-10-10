/**
 * E2E de acondicionar con equipo: comenzar desde el detalle con personas y grupos, terminar, y lo
 * que ve otro acondicionador mientras tanto (R33, R34).
 *
 * R33 recorre con el acondicionador 1: abre el detalle de un pedido «Por acondicionar» desde su
 * pestaña, pulsa «Acondicionar», comprueba que el selector no ofrece al Administrador y sí al
 * Operador, espera los 5 s REALES con una persona y un grupo marcados, comienza, ve el estado, el
 * equipo y «Terminar», espera otros 5 s REALES en el modal de Terminar, confirma, aterriza en «Por
 * acondicionar» con el aviso y encuentra el pedido en «Terminados».
 * R34, entre comenzar y terminar, abre el mismo detalle con el acondicionador 2 en otro contexto de
 * navegador: no ve «Terminar» ni «Acondicionar» y sí «Lo acondiciona <nombre del 1>.».
 *
 * EL PEDIDO SE SIEMBRA DIRECTAMENTE con `prisma`, ya «Por acondicionar» y con `packed_by`, cumpliendo
 * los CHECK de `orders`: el recorrido de empaque que lo deja ahí lo cubre `e2e/empaque.spec.ts`.
 *
 * AISLAMIENTO: prefijo propio `qc218_e2e_` + `RUN_ID` por proceso de worker, empresa efímera
 * -`companies_name_unique` es GLOBAL- y limpieza de huérfanos por prefijo Y POR EDAD, porque
 * Chromium y WebKit corren a la vez sobre la misma base.
 *
 * Los roles son los REALES del seed, nunca un fixture: sus permisos son el dato bajo prueba.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type Locator } from '@playwright/test';

import {
  buildDisplayName,
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  normalizeWorkGroupName,
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import {
  ASSIGNED_ORDERS_ROUTE,
  CONDITIONED_ORDER_PARAM,
  conditioningOrderRoute,
} from '@/lib/shared/routes';

import { createFixtureUser } from './helpers/fixture-user';
import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de él se toca. */
const FIXTURE_PREFIX = 'qc218_e2e_';

/** Identificador único de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: la limpieza defensiva no puede borrar por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const SHARED_TOKEN = `${FIXTURE_PREFIX}${RUN_ID}`;

/** Nunca la empresa de instalación: `companies_name_unique` es GLOBAL. */
const COMPANY_NAME = `${SHARED_TOKEN}_empresa`;
const RECIPE_NAME = `${SHARED_TOKEN}_receta`;
const WORK_GROUP_NAME = `${SHARED_TOKEN}_grupo`;
const ORDER_QUANTITY = '5';

/** La espera de los dos modales, en segundos: el dato bajo prueba. */
const WAIT_SECONDS = 5;

type Credentials = { readonly username: string; readonly password: string };

function credentials(suffix: string, label: string): Credentials {
  return {
    username: `${SHARED_TOKEN}_${suffix}`,
    password: `Qc218-${label}-${RUN_ID.slice(0, 12)}`,
  };
}

/** Comienza y termina (R33). */
const conditioner1User = credentials('acond1', 'Acond1');
/** Mira el pedido del 1 mientras lo acondiciona (R34); el 1 lo marca como persona suelta. */
const conditioner2User = credentials('acond2', 'Acond2');
/** No se ofrece en el selector de personas; en el grupo cuenta como Administrador excluido. */
const adminUser = credentials('admin', 'Admin');
/** Se ofrece en el selector de personas y entra al equipo por el grupo. */
const operatorUser = credentials('operador', 'Operador');

const ALL_USERS = [conditioner1User, conditioner2User, adminUser, operatorUser];

const firstNames = `Qc218${RUN_ID.slice(0, 8)}`;
const LAST_NAMES_BY_USERNAME: Readonly<Record<string, string>> = {
  [conditioner1User.username]: 'Acondiuno',
  [conditioner2User.username]: 'Acondidos',
  [adminUser.username]: 'Administra',
  [operatorUser.username]: 'Operador',
};

function displayNameOf(user: Credentials): string {
  return buildDisplayName(firstNames, LAST_NAMES_BY_USERNAME[user.username]!, user.username);
}

/**
 * Posición de la serie de este fixture. Alta y aleatoria para no chocar con
 * `orders_company_year_sequence_key` ni con el worker del otro navegador.
 */
const ORDER_SEQUENCE = 900_000 + Math.floor(Math.random() * 90_000);

/** `/asignacion` y sus dos pestañas del acondicionador. */
const ASIGNACION_TITLE_TESTID = 'asignacion-title';
const TAB_ACONDICIONADOS_TESTID = 'assignment-view-tab-acondicionados';
const CONDITIONING_SECTION_TESTID = 'conditioning-orders-list-section';
const CONDITIONED_SECTION_TESTID = 'conditioned-orders-list-section';
const CONDITIONING_ORDER_LINK_TESTID = 'conditioning-order-link';
const CONDITIONED_ORDER_NOTICE_TESTID = 'conditioned-order-notice';
const VIEW_PARAM = 'vista';
const VIEW_POR_ACONDICIONAR = 'por_acondicionar';

/** El detalle, `conditioning-order-screen.tsx`. */
const SCREEN_TESTID = 'conditioning-order-screen';
const SCREEN_STATUS_TESTID = 'conditioning-order-status';
const SCREEN_CONDITIONER_TESTID = 'conditioning-order-conditioner';
const START_BUTTON_TESTID = 'conditioning-start-button';
const FINISH_BUTTON_TESTID = 'conditioning-finish-button';

/** El equipo guardado, `conditioning-team-list.tsx`. */
const TEAM_LIST_TESTID = 'conditioning-team-list';
const TEAM_LIST_GROUP_TESTID = 'conditioning-team-list-group';
const TEAM_LIST_GROUP_NAME_TESTID = 'conditioning-team-list-group-name';
const TEAM_LIST_MEMBER_TESTID = 'conditioning-team-list-member';

/** Los dos modales y su selector. */
const START_DIALOG_TESTID = 'start-conditioning-dialog';
const FINISH_DIALOG_TESTID = 'finish-conditioning-dialog';
const TEAM_PEOPLE_TESTID = 'conditioning-team-people';
const TEAM_PERSON_TESTID = 'conditioning-team-person';
const TEAM_GROUP_TESTID = 'conditioning-team-group';
const TEAM_GROUP_ADMINS_TESTID = 'conditioning-team-group-admins';
const GATED_BUTTON_TESTID = 'countdown-gated-button';
const COUNTDOWN_TIMER_TESTID = 'countdown-timer';

let companyId: string | null = null;

type Seeded = {
  readonly orderId: string;
  readonly numberText: string;
  readonly conditioner1Id: string;
  readonly conditioner2Id: string;
  readonly adminId: string;
  readonly operatorId: string;
  readonly workGroupId: string;
};
let fixture: Seeded | null = null;

/** Igualdad EXACTA de texto: un correlativo no puede casar con un prefijo suyo. */
function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function seeded(): Seeded {
  if (fixture === null) throw new Error('el fixture no existe: falló el beforeAll');
  return fixture;
}

async function createUser(user: Credentials, roleId: string): Promise<string> {
  if (!companyId) throw new Error('la empresa del fixture no existe: falló el beforeAll');

  const created = await createFixtureUser({
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
  const ids = [...companyIds];
  // El equipo y los miembros de grupo no declaran `@relation`: sus FK compuestas van a mano en la
  // migración, así que se borran explícitamente antes que pedidos, grupos y personas.
  const pasos: ReadonlyArray<() => Promise<unknown>> = [
    () => prisma.orderConditioningTeamMember.deleteMany({ where: { companyId: { in: ids } } }),
    () => prisma.order.deleteMany({ where: { companyId: { in: ids } } }),
    () => prisma.recipe.deleteMany({ where: { companyId: { in: ids } } }),
    () => prisma.workGroupMember.deleteMany({ where: { companyId: { in: ids } } }),
    () => prisma.workGroup.deleteMany({ where: { companyId: { in: ids } } }),
    () => prisma.user.deleteMany({ where: { companyId: { in: ids } } }),
    () => prisma.company.deleteMany({ where: { id: { in: ids } } }),
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

/** Lee la cuenta regresiva visible del botón y devuelve los segundos que muestra. */
async function remainingSeconds(timer: Locator): Promise<number> {
  const text = (await timer.textContent())?.trim() ?? '';
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (match === null) throw new Error(`la cuenta regresiva no tiene la forma MM:SS: «${text}»`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Comprueba la espera REAL del botón de un modal recién abierto: empieza deshabilitado con la
 * cuenta visible, y no se habilita antes de lo que esa cuenta anunciaba. `beforeEnable` corre
 * mientras se espera (marcar el equipo, en el de Acondicionar).
 */
async function expectRealWait(
  dialog: Locator,
  beforeEnable: () => Promise<void> = async () => undefined,
): Promise<void> {
  const button = dialog.getByTestId(GATED_BUTTON_TESTID);
  const timer = button.getByTestId(COUNTDOWN_TIMER_TESTID);

  await expect(button).toBeDisabled();
  await expect(timer).toBeVisible();
  const startedAt = Date.now();
  const shown = await remainingSeconds(timer);
  expect(shown, 'la cuenta arranca en la espera fijada o justo por debajo').toBeLessThanOrEqual(
    WAIT_SECONDS,
  );
  expect(shown, 'al abrir el modal todavía queda espera').toBeGreaterThan(0);

  await beforeEnable();

  await expect(button).toBeEnabled({ timeout: (WAIT_SECONDS + 10) * 1_000 });
  const elapsed = Date.now() - startedAt;
  // Con «00:0N» visible quedaban más de N-1 s: habilitarse antes sería no haber esperado.
  expect(elapsed, 'el botón se habilitó antes de terminar la espera').toBeGreaterThanOrEqual(
    (shown - 1) * 1_000,
  );
  await expect(timer).toHaveCount(0);
}

/** Entra con el acondicionador 2 en su propio contexto y mira el detalle del pedido (R34). */
async function expectConditioner2SeesItReadOnly(browser: Browser, orderId: string): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await loginAndLand(page, conditioner2User);
    await page.goto(conditioningOrderRoute(orderId));

    const screen = page.getByTestId(SCREEN_TESTID);
    await expect(screen).toBeVisible({ timeout: 60_000 });
    await expect(screen.getByTestId(SCREEN_STATUS_TESTID)).toHaveAttribute(
      'data-status',
      'EN_ACONDICIONAMIENTO',
    );
    await expect(screen.getByTestId(SCREEN_CONDITIONER_TESTID)).toHaveText(
      exactText(`Lo acondiciona ${displayNameOf(conditioner1User)}.`),
    );
    await expect(page.getByTestId(FINISH_BUTTON_TESTID)).toHaveCount(0);
    await expect(page.getByTestId(START_BUTTON_TESTID)).toHaveCount(0);
    await expect(screen.getByRole('button', { name: 'Terminar' })).toHaveCount(0);
    await expect(screen.getByRole('button', { name: 'Acondicionar' })).toHaveCount(0);
  } finally {
    await context.close();
  }
}

test.beforeAll(async () => {
  // Los roles nunca se crean aquí: `roles.name` es único y sus permisos son el dato bajo prueba.
  const roles = new Map<string, string>();
  for (const roleName of [ROLE_ACONDICIONAMIENTO, ROLE_ADMINISTRADOR, ROLE_OPERADOR]) {
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
  const operatorId = await createUser(operatorUser, roles.get(ROLE_OPERADOR)!);

  // El grupo con el Operador y el Administrador: aporta una persona y excluye a un Administrador.
  const workGroupId = (
    await prisma.workGroup.create({
      data: {
        name: WORK_GROUP_NAME,
        nameNormalized: normalizeWorkGroupName(WORK_GROUP_NAME),
        companyId,
      },
      select: { id: true },
    })
  ).id;
  await prisma.workGroupMember.createMany({
    data: [
      { workGroupId, userId: operatorId, companyId },
      { workGroupId, userId: adminId, companyId },
    ],
  });

  // La unidad NO se crea: es una de las del catálogo arrancador.
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'litro', companyId: null },
    select: { id: true },
  });

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

  // Cumple los CHECK de `orders`: «Por acondicionar» lleva `packed_by` y aún no `conditioned_by`.
  const year = new Date().getUTCFullYear();
  const order = await prisma.order.create({
    data: {
      companyId,
      orderYear: year,
      orderSequence: ORDER_SEQUENCE,
      recipeId,
      quantity: ORDER_QUANTITY,
      unitId: unit.id,
      status: 'POR_ACONDICIONAR',
      packedBy: operatorId,
      conditionedBy: null,
      finishedAt: null,
    },
    select: { id: true },
  });

  fixture = {
    orderId: order.id,
    numberText: formatOrderNumber({ year, sequence: ORDER_SEQUENCE }),
    conditioner1Id,
    conditioner2Id,
    adminId,
    operatorId,
    workGroupId,
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

// El primer `goto` hace que `next dev` compile la ruta bajo demanda, bcrypt tarda a propósito, y
// los dos modales esperan 5 s reales cada uno.
test.setTimeout(240_000);

test.describe('acondicionar con equipo (R33, R34)', () => {
  test('R33 y R34 - el acondicionador 1 comienza con una persona y un grupo tras la espera, el 2 no puede tocar el pedido, y el 1 lo termina y lo ve en Terminados', async ({
    page,
    browser,
  }) => {
    const { orderId, numberText, conditioner2Id, adminId, operatorId, workGroupId } = seeded();

    // --- 1. Aterriza en `/asignacion` y abre el pedido desde «Por acondicionar».
    const landing = await loginAndLand(page, conditioner1User);
    expect(landing).toBe(ASSIGNED_ORDERS_ROUTE);
    await expect(page.getByTestId(ASIGNACION_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

    const queue = page.getByTestId(CONDITIONING_SECTION_TESTID);
    await expect(queue).toBeVisible({ timeout: 60_000 });
    const queueLink = queue
      .getByTestId(CONDITIONING_ORDER_LINK_TESTID)
      .filter({ hasText: exactText(numberText) });
    await expect(queueLink).toHaveCount(1, { timeout: 60_000 });
    await queueLink.click();
    await page.waitForURL((url) => url.pathname === conditioningOrderRoute(orderId), {
      timeout: 60_000,
    });

    const screen = page.getByTestId(SCREEN_TESTID);
    await expect(screen).toBeVisible({ timeout: 60_000 });
    await expect(screen.getByTestId(SCREEN_STATUS_TESTID)).toHaveAttribute(
      'data-status',
      'POR_ACONDICIONAR',
    );

    // --- 2. «Acondicionar» abre el modal: sin el Administrador y con el Operador.
    await screen.getByTestId(START_BUTTON_TESTID).click();
    const startDialog = page.getByTestId(START_DIALOG_TESTID);
    await expect(startDialog).toBeVisible({ timeout: 60_000 });

    const people = startDialog.getByTestId(TEAM_PEOPLE_TESTID);
    const personCheckbox = (userId: string): Locator =>
      people.locator(`[data-testid="${TEAM_PERSON_TESTID}"][data-user-id="${userId}"]`);
    await expect(personCheckbox(operatorId)).toHaveCount(1);
    await expect(people).toContainText(displayNameOf(operatorUser));
    await expect(personCheckbox(adminId)).toHaveCount(0);
    await expect(people).not.toContainText(displayNameOf(adminUser));

    const groupCheckbox = startDialog.locator(
      `[data-testid="${TEAM_GROUP_TESTID}"][data-work-group-id="${workGroupId}"]`,
    );
    await expect(groupCheckbox).toHaveCount(1);
    await expect(startDialog).toContainText(`${WORK_GROUP_NAME} · 1 persona`);
    await expect(startDialog.getByTestId(TEAM_GROUP_ADMINS_TESTID)).toHaveText(
      exactText('1 Administrador de este grupo no entra en el equipo.'),
    );

    // --- 3. «Comenzar» empieza deshabilitado con la cuenta; con una persona y un grupo marcados se
    //        habilita al acabar la espera real.
    await expectRealWait(startDialog, async () => {
      await personCheckbox(conditioner2Id).click();
      await expect(personCheckbox(conditioner2Id)).toHaveAttribute('aria-checked', 'true');
      await groupCheckbox.click();
      await expect(groupCheckbox).toHaveAttribute('aria-checked', 'true');
    });
    await expect(startDialog.getByTestId(GATED_BUTTON_TESTID)).toHaveText(exactText('Comenzar'));
    await startDialog.getByTestId(GATED_BUTTON_TESTID).click();

    // --- 4. El detalle pasa a «En acondicionamiento», ofrece «Terminar» y muestra el equipo.
    await expect(startDialog).toHaveCount(0, { timeout: 60_000 });
    await expect(screen.getByTestId(SCREEN_STATUS_TESTID)).toHaveAttribute(
      'data-status',
      'EN_ACONDICIONAMIENTO',
      { timeout: 60_000 },
    );
    await expect(screen.getByTestId(SCREEN_STATUS_TESTID)).toHaveText(exactText('En acondicionamiento'));
    await expect(screen.getByTestId(FINISH_BUTTON_TESTID)).toHaveText(exactText('Terminar'));
    await expect(screen.getByTestId(START_BUTTON_TESTID)).toHaveCount(0);

    const team = screen.getByTestId(TEAM_LIST_TESTID);
    await expect(team).toBeVisible();
    const teamGroups = team.getByTestId(TEAM_LIST_GROUP_TESTID);
    await expect(teamGroups).toHaveCount(2);
    await expect(teamGroups.nth(0)).toHaveAttribute('data-kind', 'direct');
    await expect(teamGroups.nth(0).getByTestId(TEAM_LIST_MEMBER_TESTID)).toHaveText([
      exactText(displayNameOf(conditioner2User)),
    ]);
    await expect(teamGroups.nth(1)).toHaveAttribute('data-kind', 'workGroup');
    await expect(teamGroups.nth(1).getByTestId(TEAM_LIST_GROUP_NAME_TESTID)).toHaveText(
      exactText(WORK_GROUP_NAME),
    );
    await expect(teamGroups.nth(1).getByTestId(TEAM_LIST_MEMBER_TESTID)).toHaveText([
      exactText(displayNameOf(operatorUser)),
    ]);
    await expect(team).not.toContainText(displayNameOf(adminUser));

    // --- 5. R34: el acondicionador 2, aun estando en el equipo, solo mira.
    await test.step('R34 - el acondicionador 2 no ve «Terminar» ni «Acondicionar» y ve quién acondiciona', async () => {
      await expectConditioner2SeesItReadOnly(browser, orderId);
    });

    // --- 6. «Terminar» abre la confirmación con su propia espera real.
    await screen.getByTestId(FINISH_BUTTON_TESTID).click();
    const finishDialog = page.getByTestId(FINISH_DIALOG_TESTID);
    await expect(finishDialog).toBeVisible({ timeout: 60_000 });
    await expectRealWait(finishDialog);
    await expect(finishDialog.getByTestId(GATED_BUTTON_TESTID)).toHaveText(exactText('Terminar'));
    await finishDialog.getByTestId(GATED_BUTTON_TESTID).click();

    // --- 7. Aterriza en «Por acondicionar» con el aviso.
    await page.waitForURL(
      (url) =>
        url.pathname === ASSIGNED_ORDERS_ROUTE &&
        url.searchParams.get(VIEW_PARAM) === VIEW_POR_ACONDICIONAR &&
        url.searchParams.get(CONDITIONED_ORDER_PARAM) === numberText,
      { timeout: 60_000 },
    );
    await expect(page.getByTestId(CONDITIONED_ORDER_NOTICE_TESTID)).toHaveText(
      exactText(`Pedido ${numberText} acondicionado`),
      { timeout: 60_000 },
    );
    await expect(
      page
        .getByTestId(CONDITIONING_SECTION_TESTID)
        .getByTestId(CONDITIONING_ORDER_LINK_TESTID)
        .filter({ hasText: exactText(numberText) }),
    ).toHaveCount(0);

    // --- 8. En «Terminados» está el pedido.
    await page.getByTestId(TAB_ACONDICIONADOS_TESTID).click();
    const finished = page.getByTestId(CONDITIONED_SECTION_TESTID);
    await expect(finished).toBeVisible({ timeout: 60_000 });
    await expect(
      finished.getByTestId(CONDITIONING_ORDER_LINK_TESTID).filter({ hasText: exactText(numberText) }),
    ).toHaveCount(1, { timeout: 60_000 });

    // --- 9. Lo que quedó en la base: TERMINADO con fecha, y el equipo conservado.
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, finishedAt: true },
    });
    expect(stored.status).toBe('TERMINADO');
    expect(stored.finishedAt).not.toBeNull();
    const storedTeam = await prisma.orderConditioningTeamMember.findMany({
      where: { orderId },
      orderBy: { position: 'asc' },
      select: { userId: true, workGroupId: true, workGroupName: true },
    });
    expect(storedTeam).toEqual([
      { userId: conditioner2Id, workGroupId: null, workGroupName: null },
      { userId: operatorId, workGroupId, workGroupName: WORK_GROUP_NAME },
    ]);
  });
});
