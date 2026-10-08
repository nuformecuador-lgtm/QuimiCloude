// QC-79 T5 — Las cuatro variables de entorno del correo y su lector (R28; `design.md > 7.3`).
//
// La suite entera pasa con las CUATRO variables vacias: este archivo no importa el adaptador del
// proveedor ni su libreria —eso es T15— y `mail-config-env.ts` por si solo no lee nada al
// importarse ni hace ninguna llamada. Mismo patron, y mismos casos, que
// `tests/unit/recetas/storage-config.test.ts` (QC-25 T11).
//
// Cubre R28.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAIL_TRANSPORTS,
  readCredentialSetupLinkBaseUrlFromEnv,
  readMailTransportFromEnv,
  readResendMailConfigFromEnv,
  readSmtpMailConfigFromEnv,
} from '@/lib/modules/identity/adapters/driven/config/mail-config-env';

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

const RESEND_VARS = ['RESEND_API_KEY', 'MAIL_FROM_ADDRESS', 'APP_BASE_URL'] as const;
const TRANSPORT_VAR = 'MAIL_TRANSPORT';
const ALL_VARS = [...RESEND_VARS, TRANSPORT_VAR] as const;

const CONFIG_SOURCE_PATH = 'lib/modules/identity/adapters/driven/config/mail-config-env.ts';

/** El valor de prueba de cada variable. Ninguno debe aparecer NUNCA en un mensaje de error. */
const VALORES: Readonly<Record<(typeof RESEND_VARS)[number], string>> = {
  RESEND_API_KEY: 're_clave_secreta_de_prueba',
  MAIL_FROM_ADDRESS: 'avisos@dominio-de-prueba.com',
  APP_BASE_URL: 'https://app.dominio-de-prueba.com',
};

function mensajeDe(invocar: () => unknown): string {
  try {
    invocar();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

describe('.env.example declara las cuatro variables del correo, vacias', () => {
  it('las cuatro estan presentes y VACIAS', () => {
    const envExamplePath = join(repoRoot, '.env.example');
    expect(existsSync(envExamplePath)).toBe(true);
    const source = readFileSync(envExamplePath, 'utf8');

    for (const name of ALL_VARS) {
      expect(source, `${name} debe estar declarada y VACIA en .env.example`).toMatch(
        new RegExp(`^${name}=$`, 'm'),
      );
    }
  });

  it('el remitente lleva escrito que su valor lo decide el humano (pregunta abierta 1)', () => {
    const source = readFileSync(join(repoRoot, '.env.example'), 'utf8');
    const bloque = source.slice(source.indexOf('RESEND_API_KEY'));

    expect(bloque).toMatch(/LO DECIDE EL HUMANO/i);
    expect(bloque).toMatch(/pregunta abierta 1/i);
  });
});

describe('la configuracion se lee EN LA INVOCACION, nunca al importar el modulo (R28)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of ALL_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it('importar el modulo con las cuatro variables ausentes no lanza', async () => {
    for (const name of ALL_VARS) delete process.env[name];

    await expect(
      import('@/lib/modules/identity/adapters/driven/config/mail-config-env'),
    ).resolves.toBeDefined();
  });

  it('ninguna lectura de process.env ocurre en el cuerpo del modulo', () => {
    const source = readFileSync(join(repoRoot, CONFIG_SOURCE_PATH), 'utf8');

    // `process.env` solo puede aparecer dentro de una funcion: una linea de nivel superior que
    // declare algo leyendo el entorno seria exactamente el fallo que R28 prohibe.
    for (const linea of source.split('\n')) {
      if (!linea.includes('process.env')) continue;
      expect(linea, `lectura de entorno fuera de una funcion: ${linea}`).toMatch(/^\s{2,}/);
    }
    expect(source).not.toMatch(/^(export\s+)?(const|let|var)\s+[^=]*=\s*process\.env/m);
  });
});

describe('readResendMailConfigFromEnv nombra las que faltan y no filtra ningun valor (R28)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of ALL_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it('sin ninguna variable, el mensaje nombra las tres', () => {
    for (const name of ALL_VARS) delete process.env[name];

    const mensaje = mensajeDe(readResendMailConfigFromEnv);
    for (const name of RESEND_VARS) expect(mensaje).toContain(name);
  });

  it('con una sola presente, el mensaje nombra solo las que faltan y no incluye su valor', () => {
    for (const name of ALL_VARS) delete process.env[name];
    process.env.RESEND_API_KEY = VALORES.RESEND_API_KEY;

    const mensaje = mensajeDe(readResendMailConfigFromEnv);
    expect(mensaje).not.toContain('RESEND_API_KEY');
    expect(mensaje).toContain('MAIL_FROM_ADDRESS');
    expect(mensaje).toContain('APP_BASE_URL');
    expect(mensaje).not.toContain(VALORES.RESEND_API_KEY);
  });

  it('ningun valor de ninguna de las tres aparece en el mensaje, falte la que falte', () => {
    for (const ausente of RESEND_VARS) {
      for (const name of ALL_VARS) delete process.env[name];
      for (const name of RESEND_VARS) {
        if (name !== ausente) process.env[name] = VALORES[name];
      }

      const mensaje = mensajeDe(readResendMailConfigFromEnv);
      expect(mensaje).toContain(ausente);
      for (const valor of Object.values(VALORES)) {
        expect(mensaje, `el mensaje filtra un valor al faltar ${ausente}`).not.toContain(valor);
      }
    }
  });

  it('una variable vacia o solo espacios cuenta como ausente', () => {
    for (const name of ALL_VARS) delete process.env[name];
    process.env.RESEND_API_KEY = '   ';
    process.env.MAIL_FROM_ADDRESS = VALORES.MAIL_FROM_ADDRESS;
    process.env.APP_BASE_URL = VALORES.APP_BASE_URL;

    expect(() => readResendMailConfigFromEnv()).toThrowError(/RESEND_API_KEY/);
  });

  it('con las tres presentes, resuelve la configuracion sin lanzar y sin recortar', () => {
    for (const name of ALL_VARS) delete process.env[name];
    for (const name of RESEND_VARS) process.env[name] = VALORES[name];

    expect(readResendMailConfigFromEnv()).toEqual({
      apiKey: VALORES.RESEND_API_KEY,
      from: VALORES.MAIL_FROM_ADDRESS,
      baseUrl: VALORES.APP_BASE_URL,
    });
  });
});

describe('readCredentialSetupLinkBaseUrlFromEnv: la base de la URL, sin exigir nada mas', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of ALL_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it('resuelve con SOLO APP_BASE_URL presente: el buzon no necesita la credencial del proveedor', () => {
    for (const name of ALL_VARS) delete process.env[name];
    process.env.APP_BASE_URL = VALORES.APP_BASE_URL;

    expect(readCredentialSetupLinkBaseUrlFromEnv()).toBe(VALORES.APP_BASE_URL);
  });

  it('sin APP_BASE_URL falla nombrandola y sin ningun valor', () => {
    for (const name of ALL_VARS) delete process.env[name];
    process.env.RESEND_API_KEY = VALORES.RESEND_API_KEY;

    const mensaje = mensajeDe(readCredentialSetupLinkBaseUrlFromEnv);
    expect(mensaje).toContain('APP_BASE_URL');
    expect(mensaje).not.toContain(VALORES.RESEND_API_KEY);
  });
});

describe('readMailTransportFromEnv: resend por defecto, outbox o smtp a peticion, nada mas (R28)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of ALL_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it('ausente = resend, y se resuelve SIN ninguna de las otras tres', () => {
    for (const name of ALL_VARS) delete process.env[name];

    expect(readMailTransportFromEnv()).toBe('resend');
  });

  it('vacia o solo espacios = resend', () => {
    for (const name of ALL_VARS) delete process.env[name];

    process.env.MAIL_TRANSPORT = '';
    expect(readMailTransportFromEnv()).toBe('resend');

    process.env.MAIL_TRANSPORT = '   ';
    expect(readMailTransportFromEnv()).toBe('resend');
  });

  it('los transportes admitidos se resuelven tal cual', () => {
    for (const name of ALL_VARS) delete process.env[name];

    for (const transporte of MAIL_TRANSPORTS) {
      process.env.MAIL_TRANSPORT = transporte;
      expect(readMailTransportFromEnv()).toBe(transporte);
    }
    expect(MAIL_TRANSPORTS).toEqual(['resend', 'outbox', 'smtp']);
  });

  it('cualquier otro valor falla nombrando la variable y sin repetir el valor recibido', () => {
    for (const invalido of ['SMTP', 'RESEND', 'outbox-de-prueba', 'nodemailer']) {
      for (const name of ALL_VARS) delete process.env[name];
      process.env.MAIL_TRANSPORT = invalido;

      const mensaje = mensajeDe(readMailTransportFromEnv);
      expect(mensaje, `el valor ${invalido} deberia fallar`).toContain(TRANSPORT_VAR);
      expect(mensaje, `el mensaje repite el valor ${invalido}`).not.toContain(invalido);
    }
  });
});

describe('readSmtpMailConfigFromEnv: transporte smtp temporal (nodemailer)', () => {
  const originalEnv = { ...process.env };
  const SMTP_VARS = {
    SMTP_HOST: 'smtp.dominio-de-prueba.com',
    SMTP_PORT: '587',
    SMTP_USER: 'cuenta@dominio-de-prueba.com',
    SMTP_PASS: 'contrasena-de-aplicacion-de-prueba',
    MAIL_FROM_ADDRESS: VALORES.MAIL_FROM_ADDRESS,
    APP_BASE_URL: VALORES.APP_BASE_URL,
  } as const;

  beforeEach(() => {
    delete process.env.SMTP_SECURE;
    Object.assign(process.env, SMTP_VARS);
  });

  afterEach(() => {
    for (const name of [...Object.keys(SMTP_VARS), 'SMTP_SECURE']) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it('resuelve la configuracion; sin SMTP_SECURE, 587 es STARTTLS y 465 es TLS directo', () => {
    expect(readSmtpMailConfigFromEnv()).toEqual({
      host: SMTP_VARS.SMTP_HOST,
      port: 587,
      secure: false,
      user: SMTP_VARS.SMTP_USER,
      pass: SMTP_VARS.SMTP_PASS,
      from: SMTP_VARS.MAIL_FROM_ADDRESS,
      baseUrl: SMTP_VARS.APP_BASE_URL,
    });

    process.env.SMTP_PORT = '465';
    expect(readSmtpMailConfigFromEnv().secure).toBe(true);
  });

  it('SMTP_SECURE explicito manda sobre el puerto', () => {
    process.env.SMTP_SECURE = 'true';
    expect(readSmtpMailConfigFromEnv().secure).toBe(true);
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_PORT = '465';
    expect(readSmtpMailConfigFromEnv().secure).toBe(false);
  });

  it('si faltan variables, las nombra todas juntas sin incluir ningun valor', () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PASS;

    const mensaje = mensajeDe(readSmtpMailConfigFromEnv);
    expect(mensaje).toContain('SMTP_HOST');
    expect(mensaje).toContain('SMTP_PASS');
    for (const valor of Object.values(SMTP_VARS)) expect(mensaje).not.toContain(valor);
  });

  it('un puerto o un SMTP_SECURE invalidos fallan nombrando la variable y sin el valor', () => {
    for (const invalido of ['abc', '0', '70000', '58.7']) {
      process.env.SMTP_PORT = invalido;
      const mensaje = mensajeDe(readSmtpMailConfigFromEnv);
      expect(mensaje, `el puerto ${invalido} deberia fallar`).toContain('SMTP_PORT');
      expect(mensaje).not.toContain(invalido);
    }

    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'quizas';
    const mensaje = mensajeDe(readSmtpMailConfigFromEnv);
    expect(mensaje).toContain('SMTP_SECURE');
    expect(mensaje).not.toContain('quizas');
  });
});
