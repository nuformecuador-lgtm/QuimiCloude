import { describe, expect, it } from 'vitest';

import { selectBucket } from '@/lib/modules/rate-limit/domain/rate-limit-bucket';

const LOGIN_ROUTE = '/login';

describe('selectBucket', () => {
  it('R2 cuenta la ruta exacta de login en la cuota de login', () => {
    expect(selectBucket('/login', LOGIN_ROUTE)).toBe('login');
  });

  it('R3 cuenta una subruta de login en la cuota general', () => {
    expect(selectBucket('/login/recuperar', LOGIN_ROUTE)).toBe('general');
  });

  it('R3 cuenta la raiz en la cuota general', () => {
    expect(selectBucket('/', LOGIN_ROUTE)).toBe('general');
  });

  it('R3 cuenta una ruta privada cualquiera en la cuota general', () => {
    expect(selectBucket('/dashboard', LOGIN_ROUTE)).toBe('general');
  });

  it('R3 cuenta el enlace de establecer contrasena en la cuota general', () => {
    expect(selectBucket('/establecer-contrasena/x', LOGIN_ROUTE)).toBe('general');
  });
});
