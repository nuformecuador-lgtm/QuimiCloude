// Transporte `desactivado`: no envia nada, no escribe nada y lo dice en una linea sin datos.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fsEspias = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  writeFile: fsEspias.writeFile,
  appendFile: fsEspias.appendFile,
  mkdir: fsEspias.mkdir,
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  writeFileSync: fsEspias.writeFileSync,
  appendFileSync: fsEspias.appendFileSync,
  mkdirSync: fsEspias.mkdirSync,
}));

import { sendCredentialSetupLink } from '@/lib/modules/identity/adapters/driven/mail/credential-setup-mailer-desactivado';

const SOURCE_PATH = 'lib/modules/identity/adapters/driven/mail/credential-setup-mailer-desactivado.ts';
const TO = 'persona@dominio-de-prueba.com';
const SECRET = 'RmFsc28tc2VjcmV0by1kZS1wcnVlYmEtNDNjaGFycy1YWVpfLTA';
const BASE_URL = 'https://app.dominio-de-prueba.com';

function registro(espia: { readonly mock: { readonly calls: readonly unknown[][] } }): string {
  return espia.mock.calls
    .map((args: readonly unknown[]) => args.map((arg: unknown) => String(arg)).join(' '))
    .join('\n');
}

describe('credential-setup-mailer-desactivado', () => {
  const originalBaseUrl = process.env.APP_BASE_URL;
  const originalTransport = process.env.MAIL_TRANSPORT;
  let fetchEspia: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_BASE_URL = BASE_URL;
    process.env.MAIL_TRANSPORT = 'desactivado';
    fetchEspia = vi.fn();
    vi.stubGlobal('fetch', fetchEspia);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = originalBaseUrl;
    if (originalTransport === undefined) delete process.env.MAIL_TRANSPORT;
    else process.env.MAIL_TRANSPORT = originalTransport;
  });

  it('R11: devuelve failed y no lanza', async () => {
    await expect(sendCredentialSetupLink({ to: TO, secret: SECRET })).resolves.toBe('failed');
  });

  it('R11: no llama a fetch ni escribe ningun archivo', async () => {
    await sendCredentialSetupLink({ to: TO, secret: SECRET });

    expect(fetchEspia).not.toHaveBeenCalled();
    for (const espia of Object.values(fsEspias)) {
      expect(espia).not.toHaveBeenCalled();
    }
  });

  it('R11: registra una sola linea que dice que el correo esta desactivado, sin destinatario, URL ni secreto', async () => {
    await sendCredentialSetupLink({ to: TO, secret: SECRET });

    const todo = [registro(warn), registro(error), registro(log), registro(info)].join('\n');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(registro(warn)).toContain('correo desactivado');
    expect(registro(warn)).toContain('MAIL_TRANSPORT=desactivado');

    for (const prohibido of [TO, 'persona', SECRET, BASE_URL, 'https://', '/establecer']) {
      expect(todo, `el registro contiene ${prohibido}`).not.toContain(prohibido);
    }
  });

  it('R11: el adaptador no importa nada ni lee el entorno', () => {
    const source = readFileSync(join(process.cwd(), SOURCE_PATH), 'utf8');

    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
    expect(source).not.toMatch(/process\.env/);
  });
});
