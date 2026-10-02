// T10 — Adaptador driven `initial-access-credentials-env.ts` (`design.md > 6`).
// Cubre R5 (las tres salen del entorno), R13 (ausente/vacia => error) y R18 (el mensaje
// de error nunca lleva el valor de ninguna de las tres variables).
//
// Manipula `process.env` con `vi.stubEnv`, que Vitest restaura solo si se le pide: el
// `afterEach` con `vi.unstubAllEnvs()` es lo que evita ensuciar el entorno para el resto
// de la suite.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readInitialAdminCredentialsFromEnv,
  readInitialMaestroCredentialsFromEnv,
} from '@/lib/modules/identity/adapters/driven/config/initial-access-credentials-env';

/** Valores de prueba evidentemente ficticios: nunca se persisten (R8, ajeno a este test). */
const USERNAME_DE_PRUEBA = 'admin.inicial.prueba';
const CREDENCIAL_DE_PRUEBA = 'credencial-de-prueba-no-real';
const EMAIL_DE_PRUEBA = 'admin.inicial.prueba@example.test';

function fijarLasTres(): void {
  vi.stubEnv('SEED_ADMIN_USERNAME', USERNAME_DE_PRUEBA);
  vi.stubEnv('SEED_ADMIN_PASSWORD', CREDENCIAL_DE_PRUEBA);
  vi.stubEnv('SEED_ADMIN_EMAIL', EMAIL_DE_PRUEBA);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('adaptador — credenciales del usuario inicial desde el entorno', () => {
  it('con las tres presentes, devuelve los tres valores', () => {
    fijarLasTres();

    const credenciales = readInitialAdminCredentialsFromEnv();

    expect(credenciales.username).toBe(USERNAME_DE_PRUEBA);
    expect(credenciales.credential).toBe(CREDENCIAL_DE_PRUEBA);
    expect(credenciales.email).toBe(EMAIL_DE_PRUEBA);
  });

  it('sin SEED_ADMIN_USERNAME, lanza y el mensaje la nombra', () => {
    vi.stubEnv('SEED_ADMIN_USERNAME', undefined);
    vi.stubEnv('SEED_ADMIN_PASSWORD', CREDENCIAL_DE_PRUEBA);
    vi.stubEnv('SEED_ADMIN_EMAIL', EMAIL_DE_PRUEBA);

    expect(() => readInitialAdminCredentialsFromEnv()).toThrowError(/SEED_ADMIN_USERNAME/);
  });

  it('sin SEED_ADMIN_PASSWORD, lanza y el mensaje la nombra', () => {
    vi.stubEnv('SEED_ADMIN_USERNAME', USERNAME_DE_PRUEBA);
    vi.stubEnv('SEED_ADMIN_PASSWORD', undefined);
    vi.stubEnv('SEED_ADMIN_EMAIL', EMAIL_DE_PRUEBA);

    expect(() => readInitialAdminCredentialsFromEnv()).toThrowError(/SEED_ADMIN_PASSWORD/);
  });

  it('sin SEED_ADMIN_EMAIL, lanza y el mensaje la nombra', () => {
    vi.stubEnv('SEED_ADMIN_USERNAME', USERNAME_DE_PRUEBA);
    vi.stubEnv('SEED_ADMIN_PASSWORD', CREDENCIAL_DE_PRUEBA);
    vi.stubEnv('SEED_ADMIN_EMAIL', undefined);

    expect(() => readInitialAdminCredentialsFromEnv()).toThrowError(/SEED_ADMIN_EMAIL/);
  });

  it('con SEED_ADMIN_PASSWORD en blanco (solo espacios), lanza', () => {
    vi.stubEnv('SEED_ADMIN_USERNAME', USERNAME_DE_PRUEBA);
    vi.stubEnv('SEED_ADMIN_PASSWORD', '   ');
    vi.stubEnv('SEED_ADMIN_EMAIL', EMAIL_DE_PRUEBA);

    expect(() => readInitialAdminCredentialsFromEnv()).toThrowError(/SEED_ADMIN_PASSWORD/);
  });

  it('el mensaje de error nunca contiene el valor de ninguna de las tres variables', () => {
    vi.stubEnv('SEED_ADMIN_USERNAME', undefined);
    vi.stubEnv('SEED_ADMIN_PASSWORD', undefined);
    vi.stubEnv('SEED_ADMIN_EMAIL', undefined);

    let mensaje = '';
    try {
      readInitialAdminCredentialsFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }

    expect(mensaje).not.toBe('');
    expect(mensaje).not.toContain(USERNAME_DE_PRUEBA);
    expect(mensaje).not.toContain(CREDENCIAL_DE_PRUEBA);
    expect(mensaje).not.toContain(EMAIL_DE_PRUEBA);
  });
});

describe('adaptador — credenciales del primer Maestro desde el entorno (QC-161)', () => {
  const NOMBRES = ['SEED_MAESTRO_USERNAME', 'SEED_MAESTRO_PASSWORD', 'SEED_MAESTRO_EMAIL'] as const;
  const VALORES = ['plataforma.prueba', 'credencial-del-maestro-no-real', 'plataforma.prueba@example.test'] as const;

  function fijarLasDelMaestro(): void {
    NOMBRES.forEach((nombre, indice) => vi.stubEnv(nombre, VALORES[indice]));
  }

  it('QC-161 R12: con las tres presentes devuelve los tres valores, sin leer las del Administrador', () => {
    fijarLasDelMaestro();
    vi.stubEnv('SEED_ADMIN_USERNAME', undefined);
    vi.stubEnv('SEED_ADMIN_PASSWORD', undefined);
    vi.stubEnv('SEED_ADMIN_EMAIL', undefined);

    expect(readInitialMaestroCredentialsFromEnv()).toEqual({
      username: VALORES[0],
      credential: VALORES[1],
      email: VALORES[2],
    });
  });

  it('QC-161 R12: sin ninguna, el error las nombra todas y no lleva ningun valor', () => {
    fijarLasDelMaestro();
    for (const nombre of NOMBRES) vi.stubEnv(nombre, undefined);

    let mensaje = '';
    try {
      readInitialMaestroCredentialsFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }

    expect(mensaje).not.toBe('');
    for (const nombre of NOMBRES) expect(mensaje).toContain(nombre);
    for (const valor of VALORES) expect(mensaje).not.toContain(valor);
  });

  it('QC-161 R12: vacia o solo espacios cuenta como ausente y solo se nombra esa', () => {
    fijarLasDelMaestro();
    vi.stubEnv('SEED_MAESTRO_PASSWORD', '   ');
    vi.stubEnv('SEED_MAESTRO_EMAIL', '');

    let mensaje = '';
    try {
      readInitialMaestroCredentialsFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }

    expect(mensaje).toBe('faltan las variables de entorno: SEED_MAESTRO_PASSWORD, SEED_MAESTRO_EMAIL');
    expect(mensaje).not.toContain(VALORES[0]);
  });
});
