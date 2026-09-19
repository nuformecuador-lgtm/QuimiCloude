// `processing-config-env.ts`, leido EN LA INVOCACION: importar el modulo sin llamar a ninguna de
// sus funciones no debe fallar aunque el entorno este vacio (R23).

import { afterEach, describe, expect, it } from 'vitest';

import {
  readProcessingConfigFromEnv,
  readQstashConfigFromEnv,
} from '@/lib/modules/documentos/adapters/driven/config/processing-config-env';
import {
  DEFAULT_PROCESSING_MAX_RETRIES,
  DEFAULT_PROCESSING_TIMEOUT_SECONDS,
} from '@/lib/modules/documentos/domain/processing-timeouts';

const REQUIRED_QSTASH_VARS = [
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

describe('documentos — configuracion del procesamiento desde el entorno (R23)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_QSTASH_VARS) delete process.env[name];
    delete process.env.DOCUMENT_PROCESSING_TIMEOUT_SECONDS;
    delete process.env.DOCUMENT_PROCESSING_MAX_RETRIES;
    Object.assign(process.env, originalEnv);
  });

  it('si falta UNA variable de QStash, falla NOMBRANDOLA', () => {
    configurarEnv();
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;

    expect(() => readQstashConfigFromEnv()).toThrow(/QSTASH_CURRENT_SIGNING_KEY/);
  });

  it('si faltan VARIAS, las nombra todas juntas', () => {
    delete process.env.QSTASH_TOKEN;
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
    delete process.env.QSTASH_TARGET_URL;

    expect(() => readQstashConfigFromEnv()).toThrow(
      /QSTASH_TOKEN.*QSTASH_CURRENT_SIGNING_KEY.*QSTASH_NEXT_SIGNING_KEY.*QSTASH_TARGET_URL/,
    );
  });

  it('el mensaje de fallo nunca incluye el VALOR de una variable', () => {
    process.env.QSTASH_TOKEN = 'secreto-que-no-debe-filtrarse';

    let mensaje = '';
    try {
      readQstashConfigFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }

    expect(mensaje).not.toContain('secreto-que-no-debe-filtrarse');
  });

  it('con las cuatro variables presentes, devuelve la configuracion completa', () => {
    configurarEnv();

    expect(readQstashConfigFromEnv()).toEqual({
      token: 'token-de-prueba',
      currentSigningKey: 'clave-actual',
      nextSigningKey: 'clave-siguiente',
      targetUrl: 'https://app.invalido/api/documentos/trabajos',
    });
  });

  it('los dos plazos son OPCIONALES: vacios, aplican su valor por defecto', () => {
    const config = readProcessingConfigFromEnv();

    expect(config.timeoutSeconds()).toBe(DEFAULT_PROCESSING_TIMEOUT_SECONDS);
    expect(config.maxRetries()).toBe(DEFAULT_PROCESSING_MAX_RETRIES);
  });

  it('con los dos plazos configurados, los respeta', () => {
    process.env.DOCUMENT_PROCESSING_TIMEOUT_SECONDS = '120';
    process.env.DOCUMENT_PROCESSING_MAX_RETRIES = '5';

    const config = readProcessingConfigFromEnv();

    expect(config.timeoutSeconds()).toBe(120);
    expect(config.maxRetries()).toBe(5);
  });
});
