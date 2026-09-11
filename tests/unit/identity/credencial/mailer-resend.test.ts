// QC-79 T15 — El adaptador de correo con `resend`, contra un DOBLE del SDK.
// Cubre R13, R27, R28, R29, R30 (`design.md > 7.2`, `> 9.1`).
//
// El doble no finge el servicio de Resend: finge el CONTRATO del SDK —`new Resend(clave)` y
// `client.emails.send(payload)` devolviendo `{ data, error }`—. Eso basta para demostrar las cuatro
// cosas que importan y ninguna de ellas necesita red:
//
//   - la URL se arma con la configuracion y lleva el secreto **en el camino** (R13);
//   - el cliente se construye DENTRO de la funcion, con la clave de ESA invocacion (R28): se
//     comprueba cambiando la variable entre dos llamadas y viendo que la segunda usa la nueva;
//   - un fallo del proveedor devuelve `'failed'` y **no lanza** (R30), tanto si el SDK responde con
//     `error` como si rechaza la promesa;
//   - la linea de registro **no** lleva la URL, ni el secreto, ni el correo del destinatario.

const sdk = vi.hoisted(() => ({
  send: vi.fn(),
  clavesDeConstruccion: [] as (string | undefined)[],
}));

vi.mock('resend', () => ({
  Resend: class {
    readonly emails = { send: sdk.send };

    constructor(key?: string) {
      sdk.clavesDeConstruccion.push(key);
    }
  },
}));

import { sendCredentialSetupLink } from '@/lib/modules/identity/adapters/driven/mail/credential-setup-mailer-resend';

const API_KEY = 're_clave_secreta_de_prueba';
const FROM = 'avisos@dominio-de-prueba.com';
const BASE_URL = 'https://app.dominio-de-prueba.com';
const TO = 'persona@dominio-de-prueba.com';
const SECRET = 'RmFsc28tc2VjcmV0by1kZS1wcnVlYmEtNDNjaGFycy1YWVpfLTA';

const VARS = ['RESEND_API_KEY', 'MAIL_FROM_ADDRESS', 'APP_BASE_URL'] as const;

const original = new Map<string, string | undefined>();

/** Lo que el adaptador le paso al SDK en la ultima llamada. */
function ultimoEnvio(): { from: string; to: string; subject: string; text: string } {
  expect(sdk.send).toHaveBeenCalled();
  return sdk.send.mock.calls.at(-1)?.[0] as {
    from: string;
    to: string;
    subject: string;
    text: string;
  };
}

/** Todas las lineas escritas por el espia de `console.error`, unidas. */
function registro(espia: { readonly mock: { readonly calls: readonly unknown[][] } }): string {
  return espia.mock.calls
    .map((args: readonly unknown[]) => args.map((arg: unknown) => String(arg)).join(' '))
    .join('\n');
}

beforeEach(() => {
  for (const nombre of [...VARS, 'MAIL_TRANSPORT']) {
    original.set(nombre, process.env[nombre]);
  }
  process.env.RESEND_API_KEY = API_KEY;
  process.env.MAIL_FROM_ADDRESS = FROM;
  process.env.APP_BASE_URL = BASE_URL;

  sdk.send.mockReset();
  sdk.clavesDeConstruccion.length = 0;
});

afterEach(() => {
  for (const [nombre, valor] of original) {
    if (valor === undefined) delete process.env[nombre];
    else process.env[nombre] = valor;
  }
  original.clear();
  vi.restoreAllMocks();
});

describe('la URL del enlace se arma con la configuracion (R13, R28)', () => {
  it('lleva la base de APP_BASE_URL y el secreto EN EL CAMINO, no en la cadena de consulta', async () => {
    sdk.send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    const resultado = await sendCredentialSetupLink({ to: TO, secret: SECRET });

    expect(resultado).toBe('sent');

    const envio = ultimoEnvio();
    expect(envio.text).toContain(`${BASE_URL}/establecer-contrasena/${SECRET}`);
    expect(
      envio.text,
      'el secreto viaja en el CAMINO (design.md > 4.4): una cadena de consulta acaba en los ' +
        'registros de acceso de los intermediarios como un parametro mas',
    ).not.toContain(`?token=${SECRET}`);
    expect(envio.from).toBe(FROM);
    expect(envio.to).toBe(TO);
    expect(envio.subject.length).toBeGreaterThan(0);
  });

  it('una base con barra final no produce una doble barra', async () => {
    process.env.APP_BASE_URL = `${BASE_URL}/`;
    sdk.send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await sendCredentialSetupLink({ to: TO, secret: SECRET });

    expect(ultimoEnvio().text).toContain(`${BASE_URL}/establecer-contrasena/${SECRET}`);
  });

  it('el cuerpo no contiene ninguna contrasena: la funcion no recibe ninguna (R29)', async () => {
    sdk.send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await sendCredentialSetupLink({ to: TO, secret: SECRET });

    const envio = ultimoEnvio();
    for (const prohibido of ['contrasena:', 'password', 'Contrasena provisional', 'clave:']) {
      expect(
        `${envio.subject}\n${envio.text}`.toLowerCase(),
        `el correo no transporta ninguna contrasena (R29); lo unico sensible es el enlace (R13)`,
      ).not.toContain(prohibido.toLowerCase());
    }
    expect(envio.text).not.toContain(API_KEY);
  });

  it('el cliente se construye en la invocacion, con la clave de ESE momento (R28)', async () => {
    sdk.send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await sendCredentialSetupLink({ to: TO, secret: SECRET });
    process.env.RESEND_API_KEY = 're_otra_clave_rotada';
    await sendCredentialSetupLink({ to: TO, secret: SECRET });

    expect(
      sdk.clavesDeConstruccion,
      'si el cliente se construyera al importar el modulo, la segunda llamada seguiria usando la ' +
        'clave vieja y la suite entera necesitaria la variable para poder importar nada',
    ).toEqual([API_KEY, 're_otra_clave_rotada']);
  });
});

describe('un fallo del proveedor devuelve failed y NO lanza (R30)', () => {
  it('cuando el SDK responde con error', async () => {
    sdk.send.mockResolvedValue({
      data: null,
      error: { name: 'application_error', message: `no se pudo enviar a ${TO}`, statusCode: 500 },
    });
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendCredentialSetupLink({ to: TO, secret: SECRET })).resolves.toBe('failed');
    expect(registro(espia)).toContain('application_error');
  });

  it('cuando el SDK rechaza la promesa', async () => {
    const fallo = new TypeError(`fetch failed hacia ${BASE_URL}/establecer-contrasena/${SECRET}`);
    sdk.send.mockRejectedValue(fallo);
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendCredentialSetupLink({ to: TO, secret: SECRET })).resolves.toBe('failed');
    expect(registro(espia)).toContain('TypeError');
  });

  it('cuando falta configuracion: failed, y el registro NOMBRA la variable sin su valor (R28)', async () => {
    delete process.env.RESEND_API_KEY;
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendCredentialSetupLink({ to: TO, secret: SECRET })).resolves.toBe('failed');

    const lineas = registro(espia);
    expect(lineas).toContain('RESEND_API_KEY');
    expect(lineas).not.toContain(FROM);
    expect(lineas).not.toContain(BASE_URL);
    expect(sdk.send, 'sin configuracion no se llama al proveedor').not.toHaveBeenCalled();
  });
});

describe('la linea de registro no lleva URL, ni secreto, ni correo del destinatario (R13, R29)', () => {
  it.each([
    [
      'el error del proveedor arrastra el destinatario y la URL en su mensaje',
      () =>
        sdk.send.mockResolvedValue({
          data: null,
          error: {
            name: 'application_error',
            message: `fallo el envio a ${TO}: ${BASE_URL}/establecer-contrasena/${SECRET}`,
            statusCode: 422,
          },
        }),
    ],
    [
      'el SDK rechaza con un error cuyo mensaje lleva la URL entera',
      () =>
        sdk.send.mockRejectedValue(
          new Error(`POST fallido con ${BASE_URL}/establecer-contrasena/${SECRET} para ${TO}`),
        ),
    ],
  ])('%s', async (_caso, preparar) => {
    preparar();
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendCredentialSetupLink({ to: TO, secret: SECRET })).resolves.toBe('failed');

    const lineas = registro(espia);
    expect(lineas.length, 'el fallo se MANEJA registrandolo, no se descarta').toBeGreaterThan(0);
    expect(lineas, 'el secreto no se escribe en ningun registro (R13)').not.toContain(SECRET);
    expect(lineas, 'la URL del enlace no se escribe en ningun registro (R13)').not.toContain(
      '/establecer-contrasena/',
    );
    expect(lineas, 'la direccion del destinatario es PII y no se registra').not.toContain(TO);
    expect(lineas).not.toContain(API_KEY);
  });
});
