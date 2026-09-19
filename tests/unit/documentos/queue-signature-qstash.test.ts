// Adaptador `QueueSignature` contra `@upstash/qstash`, doblado con `vi.mock`: ningun caso de este
// archivo toca la red ni depende de que una variable de entorno tenga valor de verdad.

import { afterEach, describe, expect, it, vi } from 'vitest';

const verifyMock = vi.fn();
const receiverConstructorMock = vi.fn();

vi.mock('@upstash/qstash', () => ({
  Receiver: vi.fn(function ReceiverDouble(config: unknown) {
    receiverConstructorMock(config);
    return { verify: verifyMock };
  }),
}));

const REQUIRED_VARS = [
  'QSTASH_TOKEN',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
  'QSTASH_TARGET_URL',
] as const;

function configurarEnv(): void {
  process.env.QSTASH_TOKEN = 'token-de-prueba';
  process.env.QSTASH_CURRENT_SIGNING_KEY = 'clave-actual';
  process.env.QSTASH_NEXT_SIGNING_KEY = 'clave-siguiente';
  process.env.QSTASH_TARGET_URL = 'https://app.invalido/api/documentos/trabajos';
}

describe('documentos — QueueSignature con @upstash/qstash', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
    verifyMock.mockReset();
    receiverConstructorMock.mockClear();
  });

  it('firma valida: `verify` devuelve true', async () => {
    configurarEnv();
    verifyMock.mockResolvedValueOnce(true);

    const { verifyQstashSignature } = await import(
      '@/lib/modules/documentos/adapters/driven/queue/queue-signature-qstash'
    );

    const resultado = await verifyQstashSignature({ rawBody: '{}', signature: 'una-firma' });

    expect(resultado).toBe(true);
    expect(verifyMock).toHaveBeenCalledWith({ signature: 'una-firma', body: '{}' });
    expect(receiverConstructorMock).toHaveBeenCalledWith({
      currentSigningKey: 'clave-actual',
      nextSigningKey: 'clave-siguiente',
    });
  });

  it('`verify` que LANZA: se captura y devuelve false, sin propagar', async () => {
    configurarEnv();
    verifyMock.mockRejectedValueOnce(new Error('firma invalida'));

    const { verifyQstashSignature } = await import(
      '@/lib/modules/documentos/adapters/driven/queue/queue-signature-qstash'
    );

    await expect(
      verifyQstashSignature({ rawBody: '{}', signature: 'una-firma-mala' }),
    ).resolves.toBe(false);
  });

  it('`signature: null`: devuelve false SIN construir el Receiver', async () => {
    configurarEnv();

    const { verifyQstashSignature } = await import(
      '@/lib/modules/documentos/adapters/driven/queue/queue-signature-qstash'
    );

    const resultado = await verifyQstashSignature({ rawBody: '{}', signature: null });

    expect(resultado).toBe(false);
    expect(receiverConstructorMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('`messageIdOf` encuentra la cabecera en minusculas', async () => {
    const { qstashMessageIdOf } = await import(
      '@/lib/modules/documentos/adapters/driven/queue/queue-signature-qstash'
    );

    expect(qstashMessageIdOf({ 'upstash-message-id': 'msg-1' })).toBe('msg-1');
  });

  it('`messageIdOf` encuentra la cabecera en mayusculas', async () => {
    const { qstashMessageIdOf } = await import(
      '@/lib/modules/documentos/adapters/driven/queue/queue-signature-qstash'
    );

    expect(qstashMessageIdOf({ 'Upstash-Message-Id': 'msg-2' })).toBe('msg-2');
  });

  it('`messageIdOf` devuelve null si la cabecera no viene', async () => {
    const { qstashMessageIdOf } = await import(
      '@/lib/modules/documentos/adapters/driven/queue/queue-signature-qstash'
    );

    expect(qstashMessageIdOf({ 'content-type': 'application/json' })).toBeNull();
  });
});
