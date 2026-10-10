// QC-255 — el UNICO sitio de los E2E donde se crea un usuario de fixture (R1-R5).
//
// Dos valores por defecto que los specs olvidaban, y que hacian caer el login sin que el caso
// tuviera nada que ver:
//
// - `sessionsValidFrom` en el pasado. La base lo rellena con `now()`, con fraccion de segundo, y
//   el `iat` de la sesion va truncado al segundo: un login en el mismo segundo de reloj en que se
//   creo el usuario nacia revocado (`/login?sesion=fin`). El sello se pone aqui, desde el proceso
//   de Playwright y con margen, asi que no depende del reloj de la base ni de como compare la app.
// - `accountStatus: 'active'`. El default del modelo es `pending` y una cuenta pendiente no entra.
//
// Lo que el llamante fije gana siempre: los specs que ejercitan cuentas pendientes o bloqueadas, o
// un sello concreto, lo siguen pasando tal cual.
//
// `guard-e2e-fixture-user` se pone roja si un spec crea usuarios fuera de aqui.
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

/** Margen del sello respecto al segundo de creacion. */
export const FIXTURE_STAMP_MARGIN_MS = 60_000;

/** El sello que pone el helper: inicio del segundo de `now`, menos el margen. Pura. */
export function fixtureSessionsValidFrom(now: Date): Date {
  const startOfSecond = Math.floor(now.getTime() / 1000) * 1000;
  return new Date(startOfSecond - FIXTURE_STAMP_MARGIN_MS);
}

/** Mismo argumento que `prisma.user.create` y mismo resultado tipado (con `select` si lo hay). */
export function createFixtureUser<T extends Prisma.UserCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.UserCreateArgs>,
) {
  const withDefaults = {
    ...args,
    data: {
      accountStatus: 'active',
      sessionsValidFrom: fixtureSessionsValidFrom(new Date()),
      ...args.data,
    },
  } as Prisma.SelectSubset<T, Prisma.UserCreateArgs>;

  return prisma.user.create<T>(withDefaults);
}
