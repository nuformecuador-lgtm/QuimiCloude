// Transporte `smtp` TEMPORAL con `nodemailer`, contra un DOBLE de la libreria.
// Mismas garantias que `mailer-resend.test.ts` (R13, R28, R29, R30):
//
//   - la URL se arma con la configuracion y lleva el secreto **en el camino** (R13);
//   - el transporte se construye DENTRO de la funcion, con la configuracion de ESA invocacion (R28);
//   - un fallo del servidor devuelve `'failed'` y **no lanza** (R30);
//   - la linea de registro **no** lleva la URL, ni el secreto, ni el correo del destinatario.

const sdk = vi.hoisted(() => ({
  sendMail: vi.fn(),
  opcionesDeTransporte: [] as unknown[],
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (opciones: unknown) => {
      sdk.opcionesDeTransporte.push(opciones);
      return { sendMail: sdk.sendMail };
    },
  },
}));

import { sendCredentialSetupLink } from '@/lib/modules/identity/adapters/driven/mail/credential-setup-mailer-smtp';

const HOST = 'smtp.dominio-de-prueba.com';
const USER = 'cuenta@dominio-de-prueba.com';
const PASS = 'contrasena-de-aplicacion-de-prueba';
const FROM = 'avisos@dominio-de-prueba.com';
const BASE_URL = 'https://app.dominio-de-prueba.com';
const TO = 'persona@dominio-de-prueba.com';
const SECRET = 'RmFsc28tc2VjcmV0by1kZS1wcnVlYmEtNDNjaGFycy1YWVpfLTA';

const VARS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM_ADDRESS',
  'APP_BASE_URL',
] as const;

const original = new Map<string, string | undefined>();

function ultimoEnvio(): { from: string; to: string; subject: string; text: string } {
  expect(sdk.sendMail).toHaveBeenCalled();
  return sdk.sendMail.mock.calls.at(-1)?.[0] as {
    from: string;
    to: string;
    subject: string;
    text: string;
  };
}

function registro(espia: { readonly mock: { readonly calls: readonly unknown[][] } }): string {
  return espia.mock.calls
    .map((args: readonly unknown[]) => args.map((arg: unknown) => String(arg)).join(' '))
    .join('\n');
}

beforeEach(() => {
  for (const nombre of VARS) original.set(nombre, process.env[nombre]);
  process.env.SMTP_HOST = HOST;
  process.env.SMTP_PORT = '587';
  delete process.env.SMTP_SECURE;
  process.env.SMTP_USER = USER;
  process.env.SMTP_PASS = PASS;
  process.env.MAIL_FROM_ADDRESS = FROM;
  process.env.APP_BASE_URL = BASE_URL;

  sdk.sendMail.mockReset();
  sdk.opcionesDeTransporte.length = 0;
});

afterEach(() => {
  for (const [nombre, valor] of original) {
    if (valor === undefined) delete process.env[nombre];
    else process.env[nombre] = valor;
  }
  original.clear();
  vi.restoreAllMocks();
});

describe('envio por smtp (R13, R28, R29)', () => {
  it('envia con la configuracion y el secreto EN EL CAMINO de la URL', async () => {
    sdk.sendMail.mockResolvedValue({ messageId: '<1@dominio-de-prueba.com>' });

    await expect(sendCredentialSetupLink({ to: TO, secret: SECRET })).resolves.toBe('sent');

    const envio = ultimoEnvio();
    expect(envio.text).toContain(`${BASE_URL}/establecer-contrasena/${SECRET}`);
    expect(envio.from).toBe(FROM);
    expect(envio.to).toBe(TO);
    expect(envio.subject.length).toBeGreaterThan(0);
    expect(`${envio.subject}\n${envio.text}`).not.toContain(PASS);

    expect(sdk.opcionesDeTransporte).toEqual([
      { host: HOST, port: 587, secure: false, auth: { user: USER, pass: PASS } },
    ]);
  });

  it('el transporte se construye en la invocacion, con la configuracion de ESE momento (R28)', async () => {
    sdk.sendMail.mockResolvedValue({ messageId: '<1@dominio-de-prueba.com>' });

    await sendCredentialSetupLink({ to: TO, secret: SECRET });
    process.env.SMTP_PORT = '465';
    await sendCredentialSetupLink({ to: TO, secret: SECRET });

    expect(sdk.opcionesDeTransporte).toMatchObject([
      { port: 587, secure: false },
      { port: 465, secure: true },
    ]);
  });
});

describe('un fallo devuelve failed, NO lanza y no registra URL, secreto ni destinatario (R13, R30)', () => {
  it('cuando el servidor rechaza: registra solo el codigo del error', async () => {
    const fallo = Object.assign(
      new Error(`Invalid login para ${TO}: ${BASE_URL}/establecer-contrasena/${SECRET}`),
      { code: 'EAUTH' },
    );
    sdk.sendMail.mockRejectedValue(fallo);
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendCredentialSetupLink({ to: TO, secret: SECRET })).resolves.toBe('failed');

    const lineas = registro(espia);
    expect(lineas).toContain('EAUTH');
    expect(lineas).not.toContain(SECRET);
    expect(lineas).not.toContain('/establecer-contrasena/');
    expect(lineas).not.toContain(TO);
    expect(lineas).not.toContain(PASS);
  });

  it('cuando falta configuracion: failed, y el registro NOMBRA la variable sin su valor', async () => {
    delete process.env.SMTP_PASS;
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendCredentialSetupLink({ to: TO, secret: SECRET })).resolves.toBe('failed');

    const lineas = registro(espia);
    expect(lineas).toContain('SMTP_PASS');
    expect(lineas).not.toContain(USER);
    expect(lineas).not.toContain(BASE_URL);
    expect(sdk.sendMail, 'sin configuracion no se llama al servidor').not.toHaveBeenCalled();
  });
});
