import { describe, expect, it } from 'vitest';

import { UNKNOWN_ORIGIN, resolveRequestOrigin } from '@/lib/modules/rate-limit/domain/request-origin';

describe('resolveRequestOrigin', () => {
  it('R6 toma la direccion IPv4 cuando la cabecera trae una sola', () => {
    expect(resolveRequestOrigin('203.0.113.5')).toBe('203.0.113.5');
  });

  it('R6 toma la direccion IPv6 cuando la cabecera trae una sola', () => {
    expect(resolveRequestOrigin('2001:db8::1')).toBe('2001:db8::1');
  });

  it('R6 toma la PRIMERA entrada cuando la cabecera trae una lista', () => {
    expect(resolveRequestOrigin('203.0.113.5, 70.41.3.18, 150.172.238.178')).toBe('203.0.113.5');
  });

  it('R6 recorta los espacios alrededor de la primera entrada', () => {
    expect(resolveRequestOrigin('  203.0.113.5  , 70.41.3.18')).toBe('203.0.113.5');
  });

  it('R7 devuelve el origen desconocido cuando la cabecera falta', () => {
    expect(resolveRequestOrigin(null)).toBe(UNKNOWN_ORIGIN);
  });

  it('R7 devuelve el origen desconocido cuando la cabecera esta vacia', () => {
    expect(resolveRequestOrigin('')).toBe(UNKNOWN_ORIGIN);
  });

  it('R7 devuelve el origen desconocido cuando la primera entrada no es una IP valida', () => {
    expect(resolveRequestOrigin('no-soy-una-ip')).toBe(UNKNOWN_ORIGIN);
  });

  it('R7 devuelve el origen desconocido cuando la primera entrada esta vacia entre comas', () => {
    expect(resolveRequestOrigin(' , 203.0.113.5')).toBe(UNKNOWN_ORIGIN);
  });
});
