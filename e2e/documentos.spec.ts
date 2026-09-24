/**
 * E2E de la carga de documentos (QC-107, T15): el recorrido completo de R20 —login, pantalla de
 * detalle de proveedor, elegir tres PDFs, subirlos, ver tres filas y verlas llegar a «listo»—,
 * en Chromium y en WebKit (R21: WebKit es el motor de iOS y se ejercita, no se supone).
 *
 * Que aporta sobre los unit de componente, que es lo unico que justifica su coste:
 *  - La cadena entera en un navegador de verdad: cookie firmada por el servidor, middleware, el
 *    Server Component del detalle y las Server Actions REALES de `documentos` contra Postgres.
 *    En jsdom esas acciones son dobles; aqui son las de verdad.
 *  - La SUBIDA desde el navegador (R5): el `PUT` sale del cliente al enlace firmado y no atraviesa
 *    ninguna accion. Aqui se ve salir de verdad.
 *  - El sondeo vivo: las filas pasan de su fase de navegador al estado que persiste el modulo.
 *
 * SIN RED. El servidor de Playwright arranca con los tres dobles del modulo encendidos
 * (`playwright.config.ts > webServer.env`): almacenamiento en memoria, cola en linea e IA de
 * guion. Lo unico que sale del navegador es el `PUT` al enlace firmado, y lo intercepta
 * `page.route()` mas abajo.
 *
 * LA URL NUNCA SE ESCRIBE A MANO: sale de `supplierDetailRoute`, igual que `LOGIN_ROUTE` lo hace
 * dentro del helper de login. Y ningun assert mira literales de copy: se afirma sobre
 * `data-testid` estables, sobre `data-phase`/`data-status` y sobre roles accesibles.
 *
 * DATOS: `companies`, `users`, `suppliers`, `document_batches` y `document_files` son tablas
 * reales y COMPARTIDAS, y los dos proyectos corren a la vez. Por eso todo lo que este spec crea
 * lleva el prefijo `qc107_e2e_` con el `RUN_ID` del worker dentro, los asserts filtran por ESE
 * nombre —nunca por «la primera fila»— y el `afterAll` borra por los nombres EXACTOS de este
 * worker aunque el test reviente.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { normalizeCompanyName, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { normalizeSupplierName } from '@/lib/modules/proveedores';
import { prisma } from '@/lib/shared/db/prisma';
import { supplierDetailRoute } from '@/lib/shared/routes';

import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc107_e2e_';

/** Identificador unico de este proceso de worker (mismo mecanismo que el resto de specs). */
const RUN_ID = randomUUID().replace(/-/g, '');

/**
 * Edad minima para considerar huerfana una fila con nuestro prefijo. Chromium y WebKit corren a la
 * vez: borrar por prefijo a secas se llevaria lo que el otro proyecto acaba de crear.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Cuantos PDFs sube el recorrido. Es el numero que pide R20, no un tope del modulo. */
const FILES_IN_BATCH = 3;

/**
 * El origen al que el almacenamiento en memoria firma sus subidas. Es un TLD RESERVADO: no resuelve
 * en ningun DNS, asi que si esta interceptacion dejara de casar, el `PUT` fallaria ruidosamente en
 * vez de salir a la red. Que casa de verdad lo afirma el contador de mas abajo.
 */
const STORAGE_ORIGIN = 'https://documentos-e2e.invalid';

/** El tipo de contenido que admite el borde del modulo; el selector no acepta otro. */
const PDF_MIME_TYPE = 'application/pdf';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc107-Admin-${RUN_ID.slice(0, 12)}`,
};

/** Prefijo del rol efimero sin permiso de subida. El barrido de huerfanos lo busca por este. */
const ROLE_NAME_PREFIX = `${FIXTURE_PREFIX}rol_`;

/**
 * Nombre EXACTO del rol efimero de R20: lleva `proveedores.consultar`, `proveedores.modificar` y
 * `unidades.consultar` (esta ultima porque la pantalla de detalle tambien pide la lista de
 * unidades), y sigue sin `documentos.modificar`.
 */
const noUploadRoleName = `${ROLE_NAME_PREFIX}${RUN_ID}`;

/** Usuario del rol efimero de R20: entra a la pantalla pero no puede subir. */
const noUploadUser: Credentials = {
  username: `${FIXTURE_PREFIX}noupload_${RUN_ID}`,
  password: `Qc107-NoUpload-${RUN_ID.slice(0, 12)}`,
};

const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;
const supplierName = `${FIXTURE_PREFIX}proveedor_${RUN_ID}`;

/** El alta de un proveedor exige al menos un telefono o un correo. */
const supplierPhone = '+573000000000';

/**
 * Los nombres de los tres archivos, unicos por worker: los asserts los buscan EXACTOS, asi que dos
 * ejecuciones simultaneas no pueden confundirse de fila.
 */
const fileNames = Array.from(
  { length: FILES_IN_BATCH },
  (_, index) => `${FIXTURE_PREFIX}doc_${index + 1}_${RUN_ID}.pdf`,
);

/**
 * Los bytes que elige quien sube. Da igual QUE contienen: el `PUT` esta interceptado y el
 * almacenamiento en memoria devuelve su propio PDF minimo cuando el trabajo baja el archivo. Lo
 * que importa es que el navegador tenga bytes que mandar.
 */
const pdfBytes = Buffer.from('%PDF-1.4\n%%EOF\n', 'ascii');

/** El PDF que elige el usuario sin `documentos.modificar` en el caso R20 de esta ficha. */
const noUploadFileName = `${FIXTURE_PREFIX}noupload_doc_${RUN_ID}.pdf`;

let companyId: string | null = null;
let supplierId: string | null = null;
let noUploadRoleId: string | null = null;

test.beforeAll(async () => {
  // LIMPIEZA DEFENSIVA DE HUERFANOS: un `pnpm run e2e` interrumpido deja filas `qc107_e2e_*`, y esa
  // basura pone rojo tests de otras features que cuentan filas. El orden lo imponen las FK: las
  // filas de documentos -> las tandas -> proveedores -> usuarios -> empresas.
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphanCompanyIds = (
    await prisma.company.findMany({
      where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((company) => company.id);

  if (orphanCompanyIds.length > 0) {
    await prisma.documentFile.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
    await prisma.documentBatch.deleteMany({ where: { companyId: { in: orphanCompanyIds } } });
  }
  await prisma.supplier.deleteMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
  });

  // Roles efimeros huerfanos. El rol nace unos segundos ANTES que su usuario, asi que
  // se decide primero QUE roles se van y se arrastran sus usuarios aunque sean recientes; si no,
  // `role_permissions` -> `role` (`onDelete: Restrict`) tumbaria este `beforeAll`.
  const orphanRoleIds = (
    await prisma.role.findMany({
      where: { name: { startsWith: ROLE_NAME_PREFIX }, createdAt: { lt: orphanCutoff } },
      select: { id: true },
    })
  ).map((role) => role.id);

  await prisma.user.deleteMany({
    where: {
      username: { startsWith: FIXTURE_PREFIX },
      OR: [{ createdAt: { lt: orphanCutoff } }, { roleId: { in: orphanRoleIds } }],
    },
  });
  if (orphanRoleIds.length > 0) {
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: orphanRoleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: orphanRoleIds } } });
  }
  // Las empresas van DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict`.
  if (orphanCompanyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanyIds } } });
  }

  // La empresa efimera de este worker, ANTES que su usuario. Nunca la de instalacion: el indice de
  // nombre de empresa es GLOBAL y chocaria con la que siembra `db:seed`.
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;

  // El rol tiene que llamarse EXACTAMENTE asi: lo siembra `pnpm run db:seed` y lleva
  // `proveedores.consultar` —que abre la pantalla— y `documentos.modificar` —que el caso de uso de
  // la subida exige—. Este caso usa el rol real del Administrador porque es a el a quien la
  // migracion asigna esos permisos; el caso sin permiso, mas abajo, si usa un rol efimero.
  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `falta el rol "${ROLE_ADMINISTRADOR}": este E2E no lo crea. Siembra la base con ` +
        'db:seed antes de correr los recorridos.',
    );
  }

  // Hash REAL: el objetivo es que bcrypt, el adaptador Prisma y la Server Action de login se
  // entiendan de verdad.
  await prisma.user.create({
    data: {
      firstNames: `Qc107${RUN_ID.slice(0, 8)}`,
      lastNames: 'Documentos',
      birthDate: new Date('1990-01-01'),
      email: `${adminUser.username}@example.test`,
      phone: supplierPhone,
      documentTypeCode: 'CC',
      documentNumber: adminUser.username,
      username: adminUser.username,
      passwordHash: await createPasswordHash(adminUser.password),
      roleId: role.id,
      companyId: company.id,
      // Explicito y no por defecto: la columna nace `pending` y un usuario `pending` no pasa el
      // login, asi que este fixture no llegaria a la pantalla.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  // Con Prisma y no por la UI: el alta de proveedor ya la recorre `e2e/proveedores.spec.ts`, y lo
  // que este spec viene a probar empieza en la pantalla de detalle.
  const supplier = await prisma.supplier.create({
    data: {
      name: supplierName,
      nameNormalized: normalizeSupplierName(supplierName),
      phone: supplierPhone,
      companyId: company.id,
    },
    select: { id: true },
  });
  supplierId = supplier.id;

  // Rol efimero sin permiso de subida: `proveedores.consultar`, `proveedores.modificar` y
  // `unidades.consultar` (la pantalla de detalle tambien lista unidades y sin el permiso pinta el
  // error de la pagina entera antes de montar la subida), sin `documentos.modificar`. Precedente de
  // rol efimero: `e2e/inventario.spec.ts`.
  const noUploadRole = await prisma.role.create({
    data: {
      name: noUploadRoleName,
      description: 'Rol efimero del E2E de documentos (QC-142). Se borra en afterAll.',
      permissions: {
        create: [
          { permissionCode: 'proveedores.consultar' },
          { permissionCode: 'proveedores.modificar' },
          { permissionCode: 'unidades.consultar' },
        ],
      },
    },
    select: { id: true },
  });
  noUploadRoleId = noUploadRole.id;

  await prisma.user.create({
    data: {
      firstNames: `Qc142${RUN_ID.slice(0, 8)}`,
      lastNames: 'Documentos',
      birthDate: new Date('1990-01-01'),
      email: `${noUploadUser.username}@example.test`,
      phone: supplierPhone,
      documentTypeCode: 'CC',
      documentNumber: noUploadUser.username,
      username: noUploadUser.username,
      passwordHash: await createPasswordHash(noUploadUser.password),
      roleId: noUploadRole.id,
      companyId: company.id,
      accountStatus: 'active',
    },
    select: { id: true },
  });
});

test.afterAll(async () => {
  // Borra SIEMPRE, aunque el `beforeAll` fallara a medias o un test reventara: por eso cada paso va
  // en su propio `try`/`finally`. Las tandas y sus filas se borran por la empresa EXACTA de este
  // worker, que es el unico ambito que las identifica: sus nombres los pone el servidor.
  try {
    if (companyId !== null) {
      await prisma.documentFile.deleteMany({ where: { companyId } });
      await prisma.documentBatch.deleteMany({ where: { companyId } });
    }
  } finally {
    try {
      await prisma.supplier.deleteMany({ where: { name: supplierName } });
    } finally {
      try {
        await prisma.user.deleteMany({ where: { username: adminUser.username } });
      } finally {
        try {
          await prisma.user.deleteMany({ where: { username: noUploadUser.username } });
        } finally {
          try {
            if (noUploadRoleId !== null) {
              // Asignaciones del rol ANTES que el rol: `role_permissions.role_id` es
              // `onDelete: Restrict`.
              await prisma.rolePermission.deleteMany({ where: { roleId: noUploadRoleId } });
              await prisma.role.deleteMany({ where: { id: noUploadRoleId } });
            }
          } finally {
            try {
              // La empresa, DESPUES de sus usuarios: `users.company_id` es `onDelete: Restrict`.
              await prisma.company.deleteMany({ where: { name: companyName } });
            } finally {
              await prisma.$disconnect();
            }
          }
        }
      }
    }
  }
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda, bcrypt tarda a
// proposito y el sondeo consulta cada dos segundos. Un timeout corto produce rojos que no son del
// codigo.
test.setTimeout(180_000);

test.describe('documentos', () => {
  test('sube tres PDFs y ve cambiar el estado de cada uno hasta terminar (R20)', async ({
    page,
  }) => {
    const supplier = supplierId;
    const company = companyId;
    if (supplier === null || company === null) {
      throw new Error('el fixture no esta completo: fallo el beforeAll');
    }

    // --- 1. La subida al enlace firmado se atiende AQUI, en el navegador. Es el unico trafico que
    // sale del proceso, y se cuenta para que un cambio de origen en el almacenamiento en memoria se
    // note como un rojo con nombre y no como un recorrido que parece pasar.
    let intercepted = 0;
    await page.route(`${STORAGE_ORIGIN}/**`, async (route) => {
      // Cabeceras de CORS porque el destino es de otro origen: sin ellas el navegador descarta la
      // respuesta y la fila se quedaria en «no se pudo subir». El preflight se responde igual.
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'PUT, OPTIONS',
        'access-control-allow-headers': 'content-type',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      intercepted += 1;
      await route.fulfill({ status: 200, headers, body: '' });
    });

    await loginAndLand(page, adminUser);

    // --- 2. La pantalla de detalle, por su constante de ruta. El componente se monta debajo del
    // catalogo y no depende de ningun dato del proveedor.
    await page.goto(supplierDetailRoute(supplier));
    await expect(page.getByTestId('supplier-detail-name')).toHaveText(supplierName, {
      timeout: 60_000,
    });
    await expect(page.getByTestId('document-upload')).toBeVisible({ timeout: 60_000 });

    // --- 3. Elegir los tres PDFs por el selector real, que es la unica via de entrada (R21: nada
    // depende de arrastrar con un raton).
    await page
      .getByTestId('document-upload-input')
      .setInputFiles(fileNames.map((name) => ({ name, mimeType: PDF_MIME_TYPE, buffer: pdfBytes })));

    // --- 4. Tres filas, una por archivo, con SU nombre y todavia en fase de navegador: es el
    // «antes» contra el que se afirma despues que el estado CAMBIO.
    await expect(page.getByTestId('document-upload-list')).toBeVisible({ timeout: 60_000 });
    for (const [index, name] of fileNames.entries()) {
      await expect(page.getByTestId(`document-upload-row-name-${index}`)).toHaveText(name);
      await expect(page.getByTestId(`document-upload-row-phase-${index}`)).toHaveAttribute(
        'data-phase',
        'pending',
      );
    }
    expect(
      await page.locator('[data-testid^="document-upload-row-name-"]').count(),
      'una fila por archivo elegido, ni una mas',
    ).toBe(FILES_IN_BATCH);

    // --- 5. Subir: emision de enlaces y encolado con las Server Actions REALES, y el `PUT` de cada
    // archivo saliendo del navegador.
    await page.getByTestId('document-upload-submit').click();

    // --- 6. Y cada fila llega a «listo» por su cuenta, sin que nadie recargue: el sondeo la lleva
    // del estado que el modulo persiste hasta el final. Se afirma el ESTADO, nunca el texto que la
    // IA de guion devolvio, que ninguna pantalla pinta.
    for (const index of fileNames.keys()) {
      await expect(page.getByTestId(`document-upload-row-status-${index}`)).toHaveAttribute(
        'data-status',
        'done',
        { timeout: 120_000 },
      );
    }

    // Ninguna accion ni consulta se quejo por el camino.
    await expect(page.getByTestId('document-upload-error')).toHaveCount(0);
    await expect(page.getByTestId('document-upload-selection-error')).toHaveCount(0);

    expect(intercepted, 'los tres archivos suben sus bytes desde el navegador').toBe(
      FILES_IN_BATCH,
    );

    // Lo guardo el backend de verdad, no solo lo pinto la pantalla: una tanda con sus tres filas
    // terminadas, bajo la empresa de este worker.
    const batches = await prisma.documentBatch.findMany({
      where: { companyId: company },
      select: { id: true, strategy: true },
    });
    expect(batches.length, 'el recorrido encola UNA tanda').toBe(1);
    expect(batches[0].strategy, 'la estrategia es la que monta la pantalla de proveedores').toBe(
      'catalogo',
    );
    expect(
      await prisma.documentFile.count({ where: { batchId: batches[0].id, status: 'done' } }),
      'las tres filas deberian estar terminadas en la base',
    ).toBe(FILES_IN_BATCH);
  });

  test('un rol con proveedores.consultar y proveedores.modificar pero sin documentos.modificar no puede subir (R20 permiso propio)', async ({
    page,
  }) => {
    const supplier = supplierId;
    const company = companyId;
    if (supplier === null || company === null) {
      throw new Error('el fixture no esta completo: fallo el beforeAll');
    }

    // Ningun PUT deberia salir del navegador: el rechazo pasa en el service, antes de emitir el
    // enlace firmado.
    let intercepted = 0;
    await page.route(`${STORAGE_ORIGIN}/**`, async (route) => {
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'PUT, OPTIONS',
        'access-control-allow-headers': 'content-type',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      intercepted += 1;
      await route.fulfill({ status: 200, headers, body: '' });
    });

    // Conteo tomado ANTES del intento: los dos casos comparten empresa, y este afirma sobre su
    // propia variacion en vez de depender del orden de los tests.
    const batchesBefore = await prisma.documentBatch.count({ where: { companyId: company } });

    await loginAndLand(page, noUploadUser);

    await page.goto(supplierDetailRoute(supplier));
    await expect(page.getByTestId('supplier-detail-name')).toHaveText(supplierName, {
      timeout: 60_000,
    });
    await expect(page.getByTestId('document-upload')).toBeVisible({ timeout: 60_000 });

    // La pagina monto la subida antes de intentar nada: si esto fallara, el caso no probaria R20,
    // probaria que la pantalla nunca llego a cargar.
    await expect(page.getByTestId('document-upload-trigger')).toBeVisible({ timeout: 60_000 });

    await page
      .getByTestId('document-upload-input')
      .setInputFiles([{ name: noUploadFileName, mimeType: PDF_MIME_TYPE, buffer: pdfBytes }]);

    await page.getByTestId('document-upload-submit').click();

    await expect(page.getByTestId('document-upload-error')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('document-upload-error')).toHaveAttribute(
      'data-code',
      'unauthorized',
    );

    expect(intercepted, 'el rechazo pasa antes de emitir ningun enlace firmado').toBe(0);

    const batchesAfter = await prisma.documentBatch.count({ where: { companyId: company } });
    expect(batchesAfter, 'ninguna tanda queda persistida en esta empresa').toBe(batchesBefore);
  });
});
