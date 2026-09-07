// T1 — Que forma tiene el contenido firmado para ser interpretable, y cuando caduca. Dominio
// puro: sin cookie, sin Next, sin base de datos (`design.md > 4.3`).

import {
  isSessionExpired,
  parseSessionClaims,
  type SessionClaims,
} from '@/lib/modules/identity/domain/session-claims';

const SUB_VALIDO = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';

// `iat`/`exp` viajan como epoch en SEGUNDOS (el emisor es `session-cookie.ts` de QC-7,
// `toEpochSeconds`, decision cerrada del 2026-09-01 en `design.md > 4.3`): construirlos con
// `Date.parse(...)` a secas daria milisegundos, que es exactamente el bug que este test tiene
// que impedir que vuelva.
const IAT = Math.floor(Date.parse('2026-09-01T08:00:00.000Z') / 1000);
const EXP = Math.floor(Date.parse('2026-09-01T16:00:00.000Z') / 1000);

// QC-9 R26: desde `v2` el contenido firmado lleva tambien el NOMBRE del rol.
const ROL = 'Administrador';

// QC-48 R6: desde `v3` lleva ademas el UUID de la empresa, y nada mas de ella.
const CID_VALIDO = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';

function jsonValido(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    sub: SUB_VALIDO,
    iat: IAT,
    exp: EXP,
    role: ROL,
    cid: CID_VALIDO,
    ...overrides,
  });
}

describe('parseSessionClaims', () => {
  // R6
  it('un JSON valido con sub/iat/exp produce claims con Date', () => {
    const claims = parseSessionClaims(jsonValido());

    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe(SUB_VALIDO);
    expect(claims?.issuedAt).toEqual(new Date(IAT * 1000));
    expect(claims?.expiresAt).toEqual(new Date(EXP * 1000));
  });

  // R6 — ancla la unidad: un `exp` en SEGUNDOS (la que fija el emisor de QC-7) debe producir el
  // `Date` correspondiente multiplicando por 1000, no interpretandolo como milisegundos.
  it('un exp en segundos epoch produce el Date correcto (unidad fijada por el emisor de QC-7)', () => {
    const claims = parseSessionClaims(jsonValido());

    expect(claims?.expiresAt).toEqual(new Date('2026-09-01T16:00:00.000Z'));
    expect(claims?.issuedAt).toEqual(new Date('2026-09-01T08:00:00.000Z'));
  });

  // R6 — un payload que no es JSON es entrada invalida, no un fallo: no lanza, devuelve null.
  it('un texto que no es JSON devuelve null sin lanzar', () => {
    expect(() => parseSessionClaims('esto-no-es-json{{{')).not.toThrow();
    expect(parseSessionClaims('esto-no-es-json{{{')).toBeNull();
  });

  // QC-48 R6 — la empresa firmada se devuelve tal cual, traducida de `cid` a `companyId` en el
  // mismo sitio donde `role` pasa a `roleName`: fuera del codec nadie ve la abreviatura.
  it('un JSON valido con cid produce claims con companyId', () => {
    expect(parseSessionClaims(jsonValido())?.companyId).toBe(CID_VALIDO);

    const otra = '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
    expect(parseSessionClaims(jsonValido({ cid: otra }))?.companyId).toBe(otra);
  });

  // QC-48 R9 — sin empresa con forma valida no hay sesion: ni se consulta la base ni se supone
  // ninguna empresa por defecto. `.uuid()` y no `.min(1)` porque este valor acaba comparandose
  // contra una columna `@db.Uuid`: un texto sin forma de UUID muere aqui, no en Prisma.
  it('un cid ausente, vacio, que no es texto o sin forma de UUID devuelve null', () => {
    expect(
      parseSessionClaims(JSON.stringify({ sub: SUB_VALIDO, iat: IAT, exp: EXP, role: ROL })),
    ).toBeNull();
    expect(parseSessionClaims(jsonValido({ cid: '' }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ cid: 42 }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ cid: null }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ cid: [CID_VALIDO] }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ cid: 'no-es-un-uuid' }))).toBeNull();
  });

  // R6
  it('un JSON valido pero sin los campos esperados devuelve null', () => {
    expect(parseSessionClaims(JSON.stringify({}))).toBeNull();
    expect(parseSessionClaims(JSON.stringify({ sub: SUB_VALIDO, iat: IAT }))).toBeNull();
    expect(parseSessionClaims(JSON.stringify({ iat: IAT, exp: EXP }))).toBeNull();
  });

  // R6 — sub sin forma de UUID
  it('un sub que no tiene formato UUID devuelve null', () => {
    expect(parseSessionClaims(jsonValido({ sub: 'no-es-un-uuid' }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ sub: '' }))).toBeNull();
  });

  // R6 — iat/exp deben ser enteros positivos
  it('iat o exp no enteros o no positivos devuelven null', () => {
    expect(parseSessionClaims(jsonValido({ iat: 1.5 }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ exp: -1 }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ iat: 0 }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ exp: 'ayer' }))).toBeNull();
  });

  // QC-9 R26 — el rol firmado se devuelve tal cual, con el nombre `roleName` para que coincida
  // con `SessionUser.roleName` y sea evidente en el sitio de uso que se habla de un rol.
  it('un JSON valido con role produce claims con roleName', () => {
    expect(parseSessionClaims(jsonValido())?.roleName).toBe(ROL);
    expect(parseSessionClaims(jsonValido({ role: 'Operador' }))?.roleName).toBe('Operador');
  });

  // QC-9 R28 — sin rol con forma valida no hay sesion: ni se consulta la base ni se supone
  // ningun rol por defecto. Un rol por defecto seria un rol INVENTADO, y quien lee el token no
  // es quien lo escribe.
  it('un role ausente, vacio o que no es texto devuelve null', () => {
    expect(parseSessionClaims(JSON.stringify({ sub: SUB_VALIDO, iat: IAT, exp: EXP }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ role: '' }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ role: 42 }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ role: null }))).toBeNull();
    expect(parseSessionClaims(jsonValido({ role: ['Administrador'] }))).toBeNull();
  });
});

describe('isSessionExpired', () => {
  const claims: SessionClaims = {
    sub: SUB_VALIDO,
    issuedAt: new Date(IAT * 1000),
    expiresAt: new Date(EXP * 1000),
    roleName: ROL,
    companyId: CID_VALIDO,
  };

  // R7 — en el instante exacto del exp la sesion YA NO vale (>=, no >).
  it('en el instante exacto de expiresAt la sesion esta caducada', () => {
    expect(isSessionExpired(claims, claims.expiresAt)).toBe(true);
  });

  // R7
  it('un segundo despues de expiresAt sigue caducada', () => {
    expect(isSessionExpired(claims, new Date(claims.expiresAt.getTime() + 1000))).toBe(true);
  });

  // R7 — un instante antes de expiresAt todavia es valida.
  it('un segundo antes de expiresAt la sesion sigue valida', () => {
    expect(isSessionExpired(claims, new Date(claims.expiresAt.getTime() - 1000))).toBe(false);
  });
});
