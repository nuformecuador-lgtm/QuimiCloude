// QC-255 T1 — el helper de usuarios de fixture de los E2E (R1, R2, R3, R4).
//
// La base se mockea: aqui se prueba que valores llegan a `prisma.user.create`. Que el usuario
// creado entre sin `sesion=fin` lo cierra la corrida E2E real.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@/lib/shared/db/prisma', () => ({
  prisma: { user: { create: createMock } },
}));

import {
  FIXTURE_STAMP_MARGIN_MS,
  createFixtureUser,
  fixtureSessionsValidFrom,
} from '@/e2e/helpers/fixture-user';

const BASE_DATA = {
  firstNames: 'Qc255',
  lastNames: 'Fixture',
  birthDate: new Date('1990-01-01'),
  email: 'qc255@example.test',
  phone: '+573000000000',
  documentTypeCode: 'CC',
  documentNumber: 'qc255',
  username: 'qc255',
  passwordHash: 'hash',
  roleId: '00000000-0000-4000-8000-000000000001',
  companyId: '00000000-0000-4000-8000-000000000002',
};

type CreateCall = { data: Record<string, unknown>; select?: unknown };

function lastCreateCall(): CreateCall {
  const call = createMock.mock.calls.at(-1);
  if (call === undefined) throw new Error('createFixtureUser no llamo a prisma.user.create');
  return call[0] as CreateCall;
}

describe('QC-255 — fixtureSessionsValidFrom deja el sello antes del segundo de creacion', () => {
  it.each(['2026-10-10T12:00:00.000Z', '2026-10-10T12:00:00.500Z', '2026-10-10T12:00:00.999Z'])(
    'con now = %s, el sello cae al menos 1 s antes del inicio de su segundo (R1)',
    (iso) => {
      const now = new Date(iso);
      const startOfSecond = Math.floor(now.getTime() / 1000) * 1000;
      const stamp = fixtureSessionsValidFrom(now);

      expect(startOfSecond - stamp.getTime()).toBeGreaterThanOrEqual(1000);
      expect(stamp.getTime()).toBe(startOfSecond - FIXTURE_STAMP_MARGIN_MS);
    },
  );

  it('un iat truncado al segundo de la creacion queda estrictamente por encima del sello (R1)', () => {
    const now = new Date('2026-10-10T12:00:00.999Z');
    const iatSeconds = Math.floor(now.getTime() / 1000);

    expect(iatSeconds * 1000).toBeGreaterThan(fixtureSessionsValidFrom(now).getTime());
  });
});

describe('QC-255 — createFixtureUser pone los valores por defecto y respeta los del llamante', () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({ id: 'u1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin accountStatus, crea la cuenta active (R2)', async () => {
    await createFixtureUser({ data: BASE_DATA });

    expect(lastCreateCall().data.accountStatus).toBe('active');
  });

  it('sin sello, pone el sello del helper calculado sobre el reloj de la creacion (R1)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00.400Z'));

    await createFixtureUser({ data: BASE_DATA });

    expect(lastCreateCall().data.sessionsValidFrom).toEqual(
      fixtureSessionsValidFrom(new Date('2026-10-10T12:00:00.400Z')),
    );
  });

  it('con accountStatus pending, lo respeta tal cual (R3)', async () => {
    await createFixtureUser({ data: { ...BASE_DATA, accountStatus: 'pending' } });

    expect(lastCreateCall().data.accountStatus).toBe('pending');
  });

  it('con un sello explicito, lo respeta tal cual (R3)', async () => {
    const stamp = new Date('2030-01-01T00:00:00.000Z');

    await createFixtureUser({ data: { ...BASE_DATA, sessionsValidFrom: stamp } });

    expect(lastCreateCall().data.sessionsValidFrom).toBe(stamp);
  });

  it('pasa sin tocar el resto de los datos del llamante (R3)', async () => {
    await createFixtureUser({ data: BASE_DATA });

    expect(lastCreateCall().data).toMatchObject(BASE_DATA);
  });

  it('pasa el select del llamante y devuelve lo que devuelve prisma (R4)', async () => {
    createMock.mockResolvedValue({ id: 'u-42' });

    const created = await createFixtureUser({ data: BASE_DATA, select: { id: true } });

    expect(lastCreateCall().select).toEqual({ id: true });
    expect(created).toEqual({ id: 'u-42' });
  });
});
