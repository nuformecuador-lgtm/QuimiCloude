/**
 * E2E de la conexion de WhatsApp de una empresa en `/integraciones/whatsapp`.
 *
 * Que aporta sobre unit e integracion:
 * - **La pantalla servida de verdad** contra la base real: Server Actions, cifrado y refresco.
 * - **El doble de Graph cableado por la variable de `playwright.config.ts`**: el numero y el nombre
 *   que pinta la tarjeta son los fijos del doble, y un Access Token marcado hace fallar la prueba.
 * - **Que el verify token no vuelve**: tras recargar no esta ni en la pagina ni en el HTML servido.
 * - Corre en Chromium y en WebKit (proyectos de `playwright.config.ts`).
 *
 * DATOS: el USUARIO Administrador (rol real del seed) y la EMPRESA de cada worker son efimeros, con
 * el prefijo `qc237_e2e_` y el `RUN_ID` del proceso. Una empresa tiene como mucho una conexion viva:
 * el recorrido borra antes las de su empresa, asi no depende del orden ni de un reintento. La
 * limpieza borra las conexiones antes que los usuarios (`created_by`) y estos antes que la empresa.
 *
 * ENTRADA: siempre por `loginAndLand`.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { WHATSAPP_STATUS_LABELS } from '@/app/(private)/integraciones/whatsapp/components/whatsapp-status-badge';
import { WHATSAPP_TABS_TEXTS } from '@/app/(private)/integraciones/whatsapp/components/whatsapp-integration-tabs';
import { WHATSAPP_WEBHOOK_TEXTS } from '@/app/(private)/integraciones/whatsapp/components/whatsapp-webhook-panel';
import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  CANNED_DISPLAY_PHONE_NUMBER,
  CANNED_GRAPH_ERROR_MESSAGE,
  CANNED_INVALID_TOKEN_PREFIX,
  CANNED_VERIFIED_NAME,
} from '@/lib/modules/integraciones/adapters/driven/graph/whatsapp-graph-client-canned';
import { prisma } from '@/lib/shared/db/prisma';
import { WHATSAPP_INTEGRATION_ROUTE, whatsappWebhookPath } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

const USERNAME_PREFIX = 'qc237_e2e_';
const COMPANY_NAME_PREFIX = 'qc237_e2e_empresa_';
const RUN_ID = randomUUID().replace(/-/g, '');

/** Chromium y WebKit corren a la vez: lo huerfano se borra por edad, nunca por prefijo a secas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * El `phone_number_id` es unico entre todas las conexiones vivas, de cualquier empresa: cada worker
 * usa el suyo para no chocar con el otro navegador.
 */
const PHONE_NUMBER_ID = `qc237${RUN_ID}`;

const CONNECTION_INPUT = {
  displayName: `WhatsApp ${RUN_ID.slice(0, 8)}`,
  metaAppId: '100000000000001',
  wabaId: '200000000000002',
  phoneNumberId: PHONE_NUMBER_ID,
  accessToken: `token-e2e-${RUN_ID}`,
  appSecret: `secret-e2e-${RUN_ID}`,
} as const;

const FIELD_TESTIDS = {
  displayName: 'whatsapp-field-display-name',
  metaAppId: 'whatsapp-field-meta-app-id',
  wabaId: 'whatsapp-field-waba-id',
  phoneNumberId: 'whatsapp-field-phone-number-id',
  accessToken: 'whatsapp-field-access-token',
  appSecret: 'whatsapp-field-app-secret',
} as const;

let companyId: string | null = null;
let administradorRoleId: string | null = null;

async function createAdministrador(
  suffix: string,
): Promise<{ id: string; username: string; password: string }> {
  if (!administradorRoleId) throw new Error('el rol Administrador no se resolvio: fallo el beforeAll');
  if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');

  const username = `${USERNAME_PREFIX}${RUN_ID}_${suffix}`;
  /** Contrasena conocida del usuario de prueba. Solo vive aqui; nunca se escribe en consola. */
  const password = `Qc237-E2E-${RUN_ID.slice(0, 12)}`;

  const user = await prisma.user.create({
    data: {
      firstNames: `Qc237${RUN_ID.slice(0, 8)}${suffix}`,
      lastNames: 'WhatsApp',
      birthDate: new Date('1990-01-01'),
      email: `${username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: 'CC',
      documentNumber: `qc237${RUN_ID}${suffix}`,
      username,
      passwordHash: await createPasswordHash(password),
      roleId: administradorRoleId,
      companyId,
      // La columna es `pending` por defecto y una cuenta `pending` no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  return { id: user.id, username, password };
}

test.beforeAll(async () => {
  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!role) throw new Error(`el rol '${ROLE_ADMINISTRADOR}' no existe: correr el seed antes de este E2E`);
  administradorRoleId = role.id;

  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanies = await prisma.company.findMany({
    where: { name: { startsWith: COMPANY_NAME_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanCompanyIds = orphanCompanies.map((company) => company.id);
  await prisma.whatsappConnection.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  await prisma.user.deleteMany({
    where: { username: { startsWith: USERNAME_PREFIX }, createdAt: { lt: orphanCutoff } },
  });
  await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });

  const companyName = `${COMPANY_NAME_PREFIX}${RUN_ID}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;
});

test.afterAll(async () => {
  try {
    if (companyId) await prisma.whatsappConnection.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({
      where: { username: { startsWith: `${USERNAME_PREFIX}${RUN_ID}` } },
    });
    await prisma.company.deleteMany({ where: { name: `${COMPANY_NAME_PREFIX}${RUN_ID}` } });
  } finally {
    await prisma.$disconnect();
  }
});

// `next dev` compila cada ruta bajo demanda y bcrypt con coste 10 tarda a proposito.
test.setTimeout(180_000);

test.describe('la conexion de WhatsApp de la empresa', () => {
  test('R35: la pantalla muestra «Conexión» activa y «Plantillas» deshabilitada con «Disponible próximamente»', async ({
    page,
  }) => {
    const credentials = await createAdministrador('tabs');
    await loginAndLand(page, credentials);

    const response = await page.goto(WHATSAPP_INTEGRATION_ROUTE);
    expect(response?.status()).toBe(200);

    await expect(page.getByTestId('whatsapp-integration-tabs')).toBeVisible({ timeout: 60_000 });

    const connectionTab = page.getByTestId('whatsapp-tab-connection');
    await expect(connectionTab).toHaveText(WHATSAPP_TABS_TEXTS.connection);
    await expect(connectionTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('whatsapp-connection-panel')).toBeVisible();

    const templatesTab = page.getByTestId('whatsapp-tab-templates');
    await expect(templatesTab).toContainText(WHATSAPP_TABS_TEXTS.templates);
    await expect(templatesTab).toContainText(WHATSAPP_TABS_TEXTS.comingSoon);
    await expect(templatesTab.getByText(WHATSAPP_TABS_TEXTS.comingSoon)).toBeVisible();
    await expect(templatesTab).toBeDisabled();
  });

  test('R23, R22, R38, R41, R16, R11, R29, R30: alta rechazada por Meta, alta valida con el doble, recarga sin verify token, edicion del nombre, deshabilitar y habilitar', async ({
    page,
  }) => {
    if (!companyId) throw new Error('la empresa del fixture no existe: fallo el beforeAll');
    const fixtureCompanyId = companyId;
    // Una empresa tiene una sola conexion viva: se parte siempre de ninguna.
    await prisma.whatsappConnection.deleteMany({ where: { companyId: fixtureCompanyId } });

    const credentials = await createAdministrador('flujo');
    await loginAndLand(page, credentials);
    await page.goto(WHATSAPP_INTEGRATION_ROUTE);

    const form = page.getByTestId('whatsapp-connection-form');
    await expect(form).toBeVisible({ timeout: 60_000 });
    await expect(form).toHaveAttribute('data-mode', 'create');
    await expect(page.getByTestId('whatsapp-setup-guide')).toBeVisible();

    async function fillCreateForm(accessToken: string): Promise<void> {
      await page.getByTestId(FIELD_TESTIDS.displayName).fill(CONNECTION_INPUT.displayName);
      await page.getByTestId(FIELD_TESTIDS.metaAppId).fill(CONNECTION_INPUT.metaAppId);
      await page.getByTestId(FIELD_TESTIDS.wabaId).fill(CONNECTION_INPUT.wabaId);
      await page.getByTestId(FIELD_TESTIDS.phoneNumberId).fill(CONNECTION_INPUT.phoneNumberId);
      await page.getByTestId(FIELD_TESTIDS.accessToken).fill(accessToken);
      await page.getByTestId(FIELD_TESTIDS.appSecret).fill(CONNECTION_INPUT.appSecret);
    }

    await test.step('R23: un Access Token que Meta rechaza muestra su mensaje, no crea nada y conserva los campos no secretos', async () => {
      await fillCreateForm(`${CANNED_INVALID_TOKEN_PREFIX}_${RUN_ID}`);
      await page.getByTestId('whatsapp-connection-form-submit').click();

      await expect(page.getByTestId('whatsapp-connection-form-error')).toContainText(
        CANNED_GRAPH_ERROR_MESSAGE,
        { timeout: 60_000 },
      );
      await expect(page.getByTestId('whatsapp-connection-card')).toHaveCount(0);
      await expect(page.getByTestId(FIELD_TESTIDS.displayName)).toHaveValue(CONNECTION_INPUT.displayName);
      await expect(page.getByTestId(FIELD_TESTIDS.phoneNumberId)).toHaveValue(CONNECTION_INPUT.phoneNumberId);
      await expect(page.getByTestId(FIELD_TESTIDS.accessToken)).toHaveValue('');
      await expect(page.getByTestId(FIELD_TESTIDS.appSecret)).toHaveValue('');

      expect(
        await prisma.whatsappConnection.count({ where: { companyId: fixtureCompanyId } }),
        'una prueba fallida no puede dejar fila',
      ).toBe(0);
    });

    let verifyToken = '';
    let connectionId = '';

    await test.step('R22, R38, R41: el alta valida crea la conexion Pendiente con el numero y el nombre del doble y revela verify token y URL', async () => {
      await fillCreateForm(CONNECTION_INPUT.accessToken);
      await page.getByTestId('whatsapp-connection-form-submit').click();

      const card = page.getByTestId('whatsapp-connection-card');
      await expect(card).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('whatsapp-connection-phone')).toHaveText(CANNED_DISPLAY_PHONE_NUMBER);
      await expect(page.getByTestId('whatsapp-connection-verified-name')).toHaveText(CANNED_VERIFIED_NAME);
      await expect(page.getByTestId('whatsapp-connection-status')).toHaveAttribute('data-status', 'PENDING');
      await expect(page.getByTestId('whatsapp-status-badge')).toHaveText(WHATSAPP_STATUS_LABELS.PENDING);
      await expect(page.getByTestId('whatsapp-connection-form')).toHaveCount(0);

      const row = await prisma.whatsappConnection.findFirst({
        where: { companyId: fixtureCompanyId, deletedAt: null },
        select: {
          id: true,
          status: true,
          phoneNumberId: true,
          displayPhoneNumber: true,
          verifiedName: true,
          accessTokenEnc: true,
          appSecretEnc: true,
          verifyTokenHash: true,
          createdById: true,
        },
      });
      expect(row, 'el alta valida tiene que dejar una fila viva').not.toBeNull();
      if (!row) return;
      connectionId = row.id;
      expect(row.status).toBe('PENDING');
      expect(row.phoneNumberId).toBe(PHONE_NUMBER_ID);
      expect(row.displayPhoneNumber).toBe(CANNED_DISPLAY_PHONE_NUMBER);
      expect(row.verifiedName).toBe(CANNED_VERIFIED_NAME);
      expect(row.createdById).toBe(credentials.id);
      expect(row.accessTokenEnc).not.toContain(CONNECTION_INPUT.accessToken);
      expect(row.appSecretEnc).not.toContain(CONNECTION_INPUT.appSecret);

      const notice = page.getByTestId('whatsapp-verify-token-notice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(WHATSAPP_WEBHOOK_TEXTS.tokenOnce);
      verifyToken = await page.getByTestId('whatsapp-verify-token').inputValue();
      expect(verifyToken.length, 'el verify token revelado no puede estar vacio').toBeGreaterThan(0);
      expect(row.verifyTokenHash).not.toContain(verifyToken);

      const webhookUrl = await page.getByTestId('whatsapp-webhook-url').inputValue();
      expect(webhookUrl.endsWith(whatsappWebhookPath(connectionId))).toBe(true);
      expect(webhookUrl.startsWith('http')).toBe(true);
      await expect(page.getByTestId('whatsapp-webhook-incomplete')).toHaveCount(0);
    });

    await test.step('R16: tras recargar, el verify token no esta ni en la pagina ni en el HTML servido', async () => {
      const response = await page.reload();
      const servedHtml = (await response?.text()) ?? '';

      await expect(page.getByTestId('whatsapp-connection-card')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('whatsapp-webhook-url')).toBeVisible();
      await expect(page.getByTestId('whatsapp-verify-token-notice')).toHaveCount(0);
      await expect(page.getByTestId('whatsapp-verify-token')).toHaveCount(0);

      expect(servedHtml.length).toBeGreaterThan(0);
      expect(servedHtml.includes(verifyToken), 'el HTML servido no puede llevar el verify token').toBe(false);
      expect((await page.content()).includes(verifyToken)).toBe(false);
    });

    await test.step('R11: editar solo el nombre visible lo guarda, conserva los secretos tal cual y no cambia el estado', async () => {
      const before = await prisma.whatsappConnection.findUniqueOrThrow({
        where: { id: connectionId },
        select: { accessTokenEnc: true, appSecretEnc: true, status: true },
      });
      const newDisplayName = `Editada ${RUN_ID.slice(0, 8)}`;

      await page.getByTestId('whatsapp-action-edit').click();
      const editForm = page.getByTestId('whatsapp-connection-form');
      await expect(editForm).toHaveAttribute('data-mode', 'edit');
      await expect(page.getByTestId(FIELD_TESTIDS.displayName)).toHaveValue(CONNECTION_INPUT.displayName);
      await expect(page.getByTestId(FIELD_TESTIDS.accessToken)).toHaveValue('');
      await expect(page.getByTestId(FIELD_TESTIDS.appSecret)).toHaveValue('');

      await page.getByTestId(FIELD_TESTIDS.displayName).fill(newDisplayName);
      await page.getByTestId('whatsapp-connection-form-submit').click();

      await expect(page.getByTestId('whatsapp-connection-form')).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByTestId('whatsapp-connection-status')).toHaveAttribute('data-status', 'PENDING');

      const after = await prisma.whatsappConnection.findUniqueOrThrow({
        where: { id: connectionId },
        select: { displayName: true, accessTokenEnc: true, appSecretEnc: true, status: true },
      });
      expect(after.displayName).toBe(newDisplayName);
      expect(after.status).toBe(before.status);
      expect(after.accessTokenEnc, 'el Access Token guardado no se vuelve a cifrar').toBe(before.accessTokenEnc);
      expect(after.appSecretEnc, 'el App Secret guardado no se vuelve a cifrar').toBe(before.appSecretEnc);

      await page.getByTestId('whatsapp-action-edit').click();
      await expect(page.getByTestId(FIELD_TESTIDS.displayName)).toHaveValue(newDisplayName);
      await page.getByTestId('whatsapp-connection-form-cancel').click();
      await expect(page.getByTestId('whatsapp-connection-actions')).toBeVisible();
    });

    await test.step('R29: deshabilitar, tras confirmar, la deja «Deshabilitada» y quita «Probar conexión»', async () => {
      await page.getByTestId('whatsapp-action-disable').click();
      const dialog = page.getByTestId('whatsapp-disable-dialog');
      await expect(dialog).toBeVisible();
      await page.getByTestId('whatsapp-disable-confirm').click();

      await expect(page.getByTestId('whatsapp-connection-status')).toHaveAttribute('data-status', 'DISABLED', {
        timeout: 60_000,
      });
      await expect(page.getByTestId('whatsapp-status-badge')).toHaveText(WHATSAPP_STATUS_LABELS.DISABLED);
      await expect(page.getByTestId('whatsapp-action-test')).toHaveCount(0);
      await expect(page.getByTestId('whatsapp-action-enable')).toBeVisible();
    });

    await test.step('R30: habilitar vuelve a probar con el doble y la deja «Pendiente»', async () => {
      await page.getByTestId('whatsapp-action-enable').click();

      await expect(page.getByTestId('whatsapp-connection-status')).toHaveAttribute('data-status', 'PENDING', {
        timeout: 60_000,
      });
      await expect(page.getByTestId('whatsapp-status-badge')).toHaveText(WHATSAPP_STATUS_LABELS.PENDING);
      await expect(page.getByTestId('whatsapp-action-feedback')).toHaveCount(0);
      await expect(page.getByTestId('whatsapp-action-disable')).toBeVisible();

      const row = await prisma.whatsappConnection.findUniqueOrThrow({
        where: { id: connectionId },
        select: { status: true },
      });
      expect(row.status).toBe('PENDING');
    });
  });
});
