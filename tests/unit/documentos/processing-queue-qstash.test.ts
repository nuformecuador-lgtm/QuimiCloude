// Adaptador `ProcessingQueue` contra `@upstash/qstash`, doblado con `vi.mock`: ningun caso de este
// archivo toca la red ni depende de que una variable de entorno tenga valor de verdad.

import { afterEach, describe, expect, it, vi } from 'vitest';

const publishJSONMock = vi.fn();
const clientConstructorMock = vi.fn();

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(function ClientDouble(config: unknown) {
    clientConstructorMock(config);
    return { publishJSON: publishJSONMock };
  }),
}));

const REQUIRED_QSTASH_VARS = [
  'QSTASH_TOKEN',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
  'QSTASH_TARGET_URL',
] as const;

function configurarEnv(maxRetries?: string): void {
  process.env.QSTASH_TOKEN = 'token-de-prueba';
  process.env.QSTASH_CURRENT_SIGNING_KEY = 'clave-actual';
  process.env.QSTASH_NEXT_SIGNING_KEY = 'clave-siguiente';
  process.env.QSTASH_TARGET_URL = 'https://app.invalido/api/documentos/trabajos';
  if (maxRetries !== undefined) process.env.DOCUMENT_PROCESSING_MAX_RETRIES = maxRetries;
}

describe('documentos — ProcessingQueue con @upstash/qstash', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_QSTASH_VARS) delete process.env[name];
    delete process.env.DOCUMENT_PROCESSING_MAX_RETRIES;
    Object.assign(process.env, originalEnv);
    publishJSONMock.mockReset();
    clientConstructorMock.mockClear();
  });

  it('publica con la url de destino y el cuerpo, y devuelve el messageId', async () => {
    configurarEnv();
    publishJSONMock.mockResolvedValueOnce({ messageId: 'msg-1', url: 'https://x' });

    const { publishToQstash } = await import(
      '@/lib/modules/documentos/adapters/driven/queue/processing-queue-qstash'
    );

    const resultado = await publishToQstash({ documentFileId: 'archivo-1' });

    expect(resultado).toBe('msg-1');
    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://app.invalido/api/documentos/trabajos',
        body: { documentFileId: 'archivo-1' },
      }),
    );
    expect(clientConstructorMock).toHaveBeenCalledWith({ token: 'token-de-prueba' });
  });

  it('el tope de reintentos que se manda es el de la CONFIGURACION, no un literal', async () => {
    configurarEnv('7');
    publishJSONMock.mockResolvedValueOnce({ messageId: 'msg-2', url: 'https://x' });

    const { publishToQstash } = await import(
      '@/lib/modules/documentos/adapters/driven/queue/processing-queue-qstash'
    );

    await publishToQstash({ documentFileId: 'archivo-2' });

    expect(publishJSONMock).toHaveBeenCalledWith(expect.objectContaining({ retries: 7 }));
  });

  it('sin `DOCUMENT_PROCESSING_MAX_RETRIES`, usa el valor por defecto de la configuracion', async () => {
    configurarEnv();
    publishJSONMock.mockResolvedValueOnce({ messageId: 'msg-3', url: 'https://x' });

    const { publishToQstash } = await import(
      '@/lib/modules/documentos/adapters/driven/queue/processing-queue-qstash'
    );
    const { DEFAULT_PROCESSING_MAX_RETRIES } = await import(
      '@/lib/modules/documentos/domain/processing-timeouts'
    );

    await publishToQstash({ documentFileId: 'archivo-3' });

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({ retries: DEFAULT_PROCESSING_MAX_RETRIES }),
    );
  });
});
