/**
 * QC-79 T21 — El E2E del camino completo (R41, R12; `design.md > 9.2`).
 *
 * EL CAMINO, entero y en un navegador de verdad: alta **sin contrasena** -> el enlace sale por el
 * buzon -> la persona establece su contrasena en la pagina publica -> **entra** con ella al
 * dashboard -> la cuenta quedo en `active` -> y el mismo enlace **ya no sirve** (R12).
 *
 * POR QUE HACE FALTA UN BUZON. El navegador de Playwright no tiene correo, y la base guarda
 * **solo la huella** del secreto (`design.md > 4.1`): si el secreto se pudiera recuperar de la
 * base, el diseno de seguridad estaria mal. Por eso existe el segundo transporte de
 * `CredentialSetupMailer` (`credential-setup-mailer-outbox.ts`), que escribe
 * `{ to, url, writtenAt }` como JSON en `MAIL_OUTBOX_DIR` en vez de llamar al proveedor. Este spec
 * lo enciende con `MAIL_TRANSPORT=outbox` **en su propio proceso** y apuntando a un directorio
 * temporal **suyo**, que borra al terminar. Sin la variable el transporte es el real
 * (`design.md > 7.3`).
 *
 * DONDE SE ENCIENDE, Y POR QUE AHI Y NO EN `playwright.config.ts`. El alta la hace **este
 * proceso** llamando al caso de uso ya cableado de `@/lib/composition`, no el servidor de Next:
 * QC-67 —la pantalla de administracion de usuarios— sigue `pending` y R40 la deja **fuera** de
 * esta ficha, asi que hoy **no existe ninguna superficie de interfaz** desde la que un
 * administrador de de alta a nadie. El alta se siembra por el caso de uso, que es el mismo codigo
 * que ejecutara esa pantalla cuando exista, con el mismo cableado. Consecuencia util: el correo se
 * escribe **aqui**, asi que `MAIL_TRANSPORT`, `MAIL_OUTBOX_DIR` y `APP_BASE_URL` se ponen en este
 * proceso y **`playwright.config.ts` no se toca**. El servidor de Next solo sirve la pagina
 * publica, la Server Action que establece la contrasena y el login: ninguno de los tres lee la
 * configuracion de correo.
 *
 * `APP_BASE_URL` se fija al `baseURL` del proyecto de Playwright —el puerto propio del E2E, 3117—
 * para que la URL que sale del buzon apunte al servidor de ESTE worktree y no a otro.
 *
 * LO QUE ESTE ARCHIVO **NO** HACE: cubrir los seis rechazos de R22 uno a uno. `design.md > 9.2` lo
 * dice con estas palabras: eso es unitario e integracion, y un E2E por rama seria la bateria que
 * `CHECKPOINTS.md` no pide. Aqui se ejerce **uno** de los seis —el enlace ya consumido—, porque es
 * el unico que cae dentro del camino completo y es lo que R12 pide demostrar de punta a punta.
 *
 * DETERMINISMO: ninguna espera por tiempo. El archivo del buzon existe **antes** de que
 * `createUser` resuelva —el envio se espera dentro del caso de uso—, asi que se lee sin sondeo; lo
 * demas son esperas de Playwright sobre el DOM y la URL.
 *
 * AISLAMIENTO: empresa, rol y usuario propios, con `RUN_ID` en todo identificador unico, igual que
 * `login.spec.ts`. Los dos proyectos (chromium y webkit) corren a la vez en procesos distintos y
 * cada uno crea y borra lo suyo. El orden de borrado NO es libre: `credential_setup_tokens` apunta
 * a `users` con `ON DELETE RESTRICT` (`design.md > 3.1`), asi que los enlaces se borran ANTES que
 * los usuarios, y la empresa la ultima (`users.company_id` tambien es RESTRICT).
 *
 * VARIABLES DE ENTORNO: como en `login.spec.ts`, `@prisma/client` lee el `.env` del proyecto al
 * importarse y `next dev` carga el suyo. Este archivo solo anade las tres del correo.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

// El caso de uso YA CABLEADO, el mismo que servira la pantalla de QC-67 cuando exista. No se
// rehace aqui el cableado de puertos: `lib/composition` es el unico sitio donde eso se decide.
import { identity } from '@/lib/composition';
import { errorMessage } from '@/lib/modules/errores';
// Del contrato del modulo: la UNICA definicion de «mismo nombre de empresa» (QC-47 R3) y el
// codigo de documento del conjunto cerrado de QC-4. Ninguno se escribe a mano.
import { DOCUMENT_TYPE_CC, normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';
import { CREDENTIAL_SETUP_ROUTE } from '@/lib/shared/routes';

// QC-93 (R8): el aterrizaje tras el login se deriva de los permisos del usuario en el helper unico.
import { loginAndLand } from './helpers/landing';

/** Ruta publica del login (QC-10), como en `login.spec.ts`: no hay constante para ella. */
const LOGIN_PATH = '/login';

/** Identificador unico de este proceso de worker. Va en todo lo que tiene indice unico. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Prefijos con los que este spec marca TODO lo que crea. Nada fuera de ellos se toca. */
const USERNAME_PREFIX = 'qc79_e2e_';
const ROLE_NAME_PREFIX = 'qc79_e2e_rol_';
const COMPANY_NAME_PREFIX = 'qc79_e2e_empresa_';

/**
 * Buzon propio de este worker, en el temporal del sistema. Se crea vacio y se borra entero en el
 * `afterAll`: un correo de una ejecucion anterior no puede colarse en esta.
 */
const OUTBOX_DIR = join(tmpdir(), 'qc79-e2e-outbox', RUN_ID);

/**
 * La contrasena que la persona ESTABLECE por el enlace. Cumple las seis reglas de QC-19 —ocho o
 * mas caracteres, mayuscula, minuscula, digito y simbolo— y no esta en la lista de filtradas.
 * Solo vive aqui y no se escribe en ninguna consola (R5).
 */
const NEW_CREDENTIAL = `Qc79-Enlace-${RUN_ID.slice(0, 8)}`;

let roleId: string | null = null;
let companyId: string | null = null;
let createdUserId: string | null = null;

/** El mensaje del buzon, tal y como lo escribe `credential-setup-mailer-outbox.ts`. */
type OutboxMessage = { readonly to: string; readonly url: string; readonly writtenAt: string };

/**
 * Lee el UNICO mensaje del buzon. No sondea y no duerme: el caso de uso espera el envio, asi que
 * cuando el alta resuelve el archivo ya esta escrito. Que haya exactamente uno es parte de lo que
 * se afirma: un alta sin contrasena emite **un** enlace y manda **un** correo (R7).
 */
async function readTheOnlyOutboxMessage(): Promise<OutboxMessage> {
  const files = await readdir(OUTBOX_DIR);
  expect(files, 'el alta sin contrasena debe dejar exactamente un correo en el buzon').toHaveLength(
    1,
  );
  return JSON.parse(
    await readFile(join(OUTBOX_DIR, files[0] as string), 'utf8'),
  ) as OutboxMessage;
}

test.beforeAll(async () => {
  // El buzon nace vacio y es solo de este worker.
  await rm(OUTBOX_DIR, { recursive: true, force: true });
  await mkdir(OUTBOX_DIR, { recursive: true });

  // El transporte de buzon, SOLO en este proceso y SOLO para este spec. El valor por defecto
  // sigue siendo `resend` para todo lo demas (`design.md > 9.2`, condicion 1).
  process.env.MAIL_TRANSPORT = 'outbox';
  process.env.MAIL_OUTBOX_DIR = OUTBOX_DIR;

  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}${RUN_ID}`,
      description: 'Rol efimero del E2E del enlace de contrasena (QC-79). Se borra en afterAll.',
    },
    select: { id: true },
  });
  roleId = role.id;

  // `nameNormalized` sale de `normalizeCompanyName`, nunca de una copia escrita a mano (QC-47 R3).
  const companyName = `${COMPANY_NAME_PREFIX}${RUN_ID}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  companyId = company.id;
});

test.afterAll(async () => {
  // Se borra SIEMPRE, aunque un paso reventara a medias, y en el orden que imponen las dos FK
  // `RESTRICT`: enlaces -> usuarios -> rol -> empresa. Cada paso en su propio `try`/`catch` para
  // que un fallo no impida los siguientes. Esto es un fixture de test y borra solo filas propias.
  try {
    if (createdUserId) {
      await prisma.credentialSetupToken.deleteMany({ where: { userId: createdUserId } });
    }
  } catch {
    // se intenta borrar el usuario igualmente
  }
  try {
    await prisma.user.deleteMany({
      where: { username: { startsWith: `${USERNAME_PREFIX}${RUN_ID}` } },
    });
  } catch {
    // se intenta borrar el rol igualmente
  }
  try {
    await prisma.role.deleteMany({ where: { name: `${ROLE_NAME_PREFIX}${RUN_ID}` } });
  } catch {
    // se intenta borrar la empresa igualmente
  }
  try {
    await prisma.company.deleteMany({
      where: { name: { startsWith: `${COMPANY_NAME_PREFIX}${RUN_ID}` } },
    });
  } catch {
    // se limpia el buzon igualmente
  }
  await rm(OUTBOX_DIR, { recursive: true, force: true });
  await prisma.$disconnect();
});

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda, y este camino
// pasa por bcrypt DOS veces (establecer la contrasena y entrar con ella), que tarda a proposito.
test.setTimeout(180_000);

test.describe('establecer la contrasena desde el enlace del correo', () => {
  test('alta sin contrasena, enlace, contrasena establecida, entrada al dashboard y el enlace ya no sirve', async ({
    page,
    baseURL,
  }) => {
    expect(roleId, 'el rol del fixture no existe: fallo el beforeAll').not.toBeNull();
    expect(companyId, 'la empresa del fixture no existe: fallo el beforeAll').not.toBeNull();
    expect(baseURL, 'el proyecto de Playwright debe traer baseURL').toBeTruthy();

    // Los dos transportes arman la URL del enlace con `APP_BASE_URL` (R28). Apuntarla al servidor
    // de ESTE worktree es lo que hace que el enlace del buzon sea navegable desde este test.
    process.env.APP_BASE_URL = baseURL as string;

    const username = `${USERNAME_PREFIX}${RUN_ID}`;
    const email = `${username}@example.test`;

    // --- 1. ALTA SIN CONTRASENA, por el caso de uso cableado (R4, R7).
    //
    // No hay pantalla desde la que hacerlo: QC-67 sigue `pending` y R40 la deja fuera de esta
    // ficha. Se llama al mismo caso de uso que esa pantalla llamara, con el mismo cableado.
    //
    // El ACTOR va POR PARAMETRO y trae el permiso exacto (R6). Su `id` es un uuid cualquiera a
    // proposito: el alta solo lee del actor la EMPRESA y los PERMISOS —QC-66 R49 dejo el alta sin
    // autor—, asi que inventar aqui un administrador de verdad no afirmaria nada mas.
    const alta = await identity.createUser(
      { id: randomUUID(), companyId: companyId as string, permissions: ['usuarios.modificar'] },
      {
        firstNames: 'Persona',
        lastNames: 'Sin Contrasena',
        birthDate: '1990-01-01',
        email,
        phone: '+573000000000',
        documentTypeCode: DOCUMENT_TYPE_CC,
        documentNumber: `qc79${RUN_ID}`,
        username,
        roleId: roleId as string,
        // Ningun campo `credential`: es exactamente el caso de R4. El sistema NO genera ninguna
        // contrasena al azar —eso enmienda QC-66 R15— y el acceso lo dara el enlace.
      },
    );
    createdUserId = alta.id;

    // R30: el resultado DISTINGUE si el correo salio. Aqui salio, al buzon.
    expect(alta.mail, 'el alta sin contrasena debe emitir el enlace e intentar enviarlo').toBe(
      'sent',
    );

    // La cuenta nace en `pending` y ahi se queda: escribir el alta no activa nada (R3, R4).
    const alNacer = await prisma.user.findUniqueOrThrow({
      where: { id: alta.id },
      select: { accountStatus: true },
    });
    expect(alNacer.accountStatus).toBe('pending');

    // --- 2. EL ENLACE SALE DEL BUZON, no de la base: alli solo vive su huella (R9).
    const mensaje = await readTheOnlyOutboxMessage();
    expect(mensaje.to, 'el enlace se manda a la direccion del usuario, no a una de parametro').toBe(
      email,
    );
    // La URL se compone con `credentialSetupRoute` (R13, `design.md > 4.4`): el secreto va en el
    // CAMINO y no en la cadena de consulta. Se afirma contra la constante, nunca contra el literal.
    expect(new URL(mensaje.url).pathname.startsWith(`${CREDENTIAL_SETUP_ROUTE}/`)).toBe(true);
    expect(new URL(mensaje.url).search, 'el secreto no viaja en la cadena de consulta').toBe('');

    // --- 3. LA PERSONA ESTABLECE SU CONTRASENA en la pagina publica, sin sesion (R17, R19).
    await page.goto(mensaje.url);

    await expect(page.getByTestId('set-credential-form')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('set-credential-credential').fill(NEW_CREDENTIAL);
    await page.getByTestId('set-credential-confirmation').fill(NEW_CREDENTIAL);
    await page.getByTestId('set-credential-submit').click();

    await expect(page.getByTestId('set-credential-success')).toBeVisible({ timeout: 120_000 });

    // --- 4. LA CUENTA QUEDO EN `active`, que es la mitad de R41 que no se ve en pantalla, y el
    // enlace quedo CONSUMIDO con su instante (R12, R19). El autor del cambio queda VACIO: lo
    // cambio el sistema, no una persona (el `NULL` de QC-65 R10).
    const trasEstablecer = await prisma.user.findUniqueOrThrow({
      where: { id: alta.id },
      select: { accountStatus: true, accountStatusChangedBy: true },
    });
    expect(trasEstablecer.accountStatus).toBe('active');
    expect(trasEstablecer.accountStatusChangedBy).toBeNull();

    const enlace = await prisma.credentialSetupToken.findFirstOrThrow({
      where: { userId: alta.id },
      select: { consumedAt: true },
    });
    expect(enlace.consumedAt, 'un enlace usado con exito queda consumido, no borrado').not.toBeNull();

    // --- 5. ENTRA DE VERDAD con la contrasena recien establecida (R41). Esta es la parte que R41
    // exige «incluida la entrada efectiva en la aplicacion»: la pantalla publica NO abre sesion
    // (`design.md > 11.5`), asi que la persona pasa por el login como cualquiera.
    await page.getByTestId('set-credential-login-link').click();
    await page.waitForURL((url) => url.pathname === LOGIN_PATH, { timeout: 120_000 });

    // La entrada y la espera del destino las hace el helper unico (QC-93 R8): el destino se DERIVA
    // de los permisos que el usuario tiene en la base, no se escribe aqui. Lo que se afirma sigue
    // siendo la ruta, no lo que se pinte en ella.
    await loginAndLand(page, { username, password: NEW_CREDENTIAL });

    // --- 6. EL MISMO ENLACE YA NO SIRVE (R12). Se reabre tal cual, con la sesion recien abierta
    // encima —que no cambia el resultado (R18)— y con una contrasena que SI cumple la politica,
    // para que lo unico que pueda estar rechazando sea el enlace y no la candidata.
    await page.goto(mensaje.url);

    await expect(page.getByTestId('set-credential-form')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('set-credential-credential').fill(NEW_CREDENTIAL);
    await page.getByTestId('set-credential-confirmation').fill(NEW_CREDENTIAL);
    await page.getByTestId('set-credential-submit').click();

    // La respuesta es la UNICA de R22, afirmada contra el catalogo de QC-70 y nunca contra un
    // literal copiado: si el texto cambia, cambia en un solo sitio.
    await expect(page.getByTestId('set-credential-error')).toHaveText(
      errorMessage('credential_link_invalid'),
      { timeout: 120_000 },
    );
    await expect(page.getByTestId('set-credential-success')).toHaveCount(0);

    // Y el segundo intento NO movio nada: la cuenta sigue activa y el enlace sigue consumido con
    // el MISMO instante que dejo el primer uso.
    const trasElSegundoIntento = await prisma.credentialSetupToken.findFirstOrThrow({
      where: { userId: alta.id },
      select: { consumedAt: true },
    });
    expect(trasElSegundoIntento.consumedAt).toEqual(enlace.consumedAt);

    const alFinal = await prisma.user.findUniqueOrThrow({
      where: { id: alta.id },
      select: { accountStatus: true },
    });
    expect(alFinal.accountStatus).toBe('active');
  });
});
