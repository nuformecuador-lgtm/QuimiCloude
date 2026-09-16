/**
 * QC-60 T14 — la carrera del correlativo por empresa (R14, R15), contra Postgres REAL.
 *
 * El patron medido de QC-81 (`specs/QC-81-lote-y-fecha-de-compra/design.md > 8`,
 * `tests/integration/inventario/product-batch-lot.int.test.ts`), trasladado al alta de pedido.
 *
 * Aislamiento por COMMIT y no por transaccion: `createOrder` usa el cliente Prisma GLOBAL y abre
 * SU PROPIA `prisma.$transaction` por intento —con el `pg_advisory_xact_lock` dentro—, asi que un
 * rollback del test no desharia nada; y la carrera necesita ademas que cada alta CONFIRME para que
 * la siguiente vea su fila. Cada caso fabrica su empresa efimera y la borra en un `finally`.
 *
 * **REQUISITO: EL POOL DE PRISMA TIENE QUE TENER MAS DE UNA CONEXION.** Con `connection_limit=1`
 * las altas se serializarian en el pool —una transaccion detras de otra, cada una viendo la fila de
 * la anterior— y este archivo pasaria en verde **sin** el lock: no mediria nada. El caso de empresas
 * distintas lo necesita tambien, porque un alta ocupa una conexion mientras otra lee
 * `pg_stat_activity` y una tercera da de alta en la otra empresa. Si algun dia la URL de la corrida
 * fija `connection_limit=1`, este test deja de morder aunque siga verde.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { createOrder } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { OrderScope } from '@/lib/modules/pedidos/domain/order-scope';
import type { NewOrder, OrderRow } from '@/lib/modules/pedidos/domain/order-view';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('falta DATABASE_URL (o DIRECT_URL) en el entorno de la corrida de integracion');
  }
  return url;
}

let recetaId: string;

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
};

async function createFixture(): Promise<Fixture> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const nombre = `Empresa ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  // `orders.created_by` es FK real a `users`.
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
  };
}

/** En orden de FK. Borrar por `companyId` no alcanza filas ajenas: la empresa nacio en el caso. */
async function dropFixture(fixture: Fixture): Promise<void> {
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

function ambito(fixture: Fixture): OrderScope {
  return { companyId: fixture.companyId };
}

function pedidoNuevo(): NewOrder {
  return { recipeId: recetaId, quantity: '3.0000', priority: 'BAJA', status: 'PENDIENTE' };
}

/** El ano sale del MISMO `now` que se escribe en `created_at`, como en el caso de uso: lo exige el
 *  `CHECK orders_order_year_matches_created_at`. */
function altaDe(fixture: Fixture): Promise<OrderRow | 'duplicate_number'> {
  const now = new Date();
  return createOrder(pedidoNuevo(), now.getUTCFullYear(), fixture.actorId, now, ambito(fixture));
}

/** Relanza el PRIMER rechazo antes de afirmar nada y antes de limpiar. Con `Promise.all` el
 *  `finally` borraba el fixture con altas aun escribiendo, y el error visible era el de la FK, no
 *  la causa (leccion medida de QC-81). */
function cumplidasOLanza<T>(asentadas: readonly PromiseSettledResult<T>[]): T[] {
  const primerRechazo = asentadas.find(
    (asentada): asentada is PromiseRejectedResult => asentada.status === 'rejected',
  );
  if (primerRechazo !== undefined) {
    const causa: unknown = primerRechazo.reason;
    throw causa;
  }
  return asentadas.map((asentada) => {
    if (asentada.status !== 'fulfilled') throw new Error('inalcanzable: ya se relanzo el rechazo');
    return asentada.value;
  });
}

beforeAll(async () => {
  const marca = token();
  const receta = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}` },
    select: { id: true },
  });
  recetaId = receta.id;
});

afterAll(async () => {
  await prisma.recipe.deleteMany({ where: { id: recetaId } });
  await prisma.$disconnect();
});

describe('R14, R15 — altas simultaneas de la MISMA empresa obtienen correlativos distintos y consecutivos', () => {
  const ALTAS_POR_RONDA = 8;
  const RONDAS = 3;

  it('3 rondas de 8 altas a la vez resuelven todas, sin duplicate_number, sin reintentos y consecutivas', async () => {
    // Sin el lock, las 8 altas de una ronda leen el mismo maximo, chocan contra
    // `orders_company_year_sequence_key` y reintentan —o agotan los tres intentos y devuelven
    // `duplicate_number`—. Si el reintento lo tapara, el conteo de transacciones pasaria de 8: por
    // eso se cuenta. Tres rondas para que no pase por suerte, y la segunda y la tercera parten de
    // un maximo que ya no es cero.
    const fixture = await createFixture();
    const spy = vi.spyOn(prisma, '$transaction');
    try {
      for (let ronda = 0; ronda < RONDAS; ronda += 1) {
        spy.mockClear();

        // Sin `await` entre las altas, para que compitan de verdad.
        const altas = Array.from({ length: ALTAS_POR_RONDA }, () => altaDe(fixture));
        const resultados = cumplidasOLanza(await Promise.allSettled(altas));

        const duplicados = resultados.filter((r) => r === 'duplicate_number').length;
        expect(duplicados, `ronda ${String(ronda + 1)}: altas que agotaron los reintentos`).toBe(0);
        // Ningun reintento: exactamente una transaccion por alta.
        expect(spy, `ronda ${String(ronda + 1)}: transacciones abiertas`).toHaveBeenCalledTimes(
          ALTAS_POR_RONDA,
        );

        const numeros = resultados
          .map((r) => (r === 'duplicate_number' ? Number.NaN : r.number.sequence))
          .sort((a, b) => a - b);
        const desde = ronda * ALTAS_POR_RONDA + 1;
        const esperados = Array.from({ length: ALTAS_POR_RONDA }, (_, i) => desde + i);

        expect(new Set(numeros).size).toBe(ALTAS_POR_RONDA);
        expect(numeros).toEqual(esperados);
      }

      // Lo devuelto es lo guardado.
      const guardados = await prisma.order.findMany({
        where: { companyId: fixture.companyId },
        select: { orderSequence: true },
        orderBy: { orderSequence: 'asc' },
      });
      expect(guardados.map((g) => g.orderSequence)).toEqual(
        Array.from({ length: ALTAS_POR_RONDA * RONDAS }, (_, i) => i + 1),
      );
    } finally {
      spy.mockRestore();
      await dropFixture(fixture);
    }
  });
});

/** Las mismas claves que el lock de aviso del correlativo en `order-prisma.ts`. Si el adaptador las
 *  cambia, el control positivo de abajo —«la misma empresa SI espera»— se pone rojo. */
const CORRELATIVO_LOCK_NAMESPACE = 60;
const CORRELATIVO_LOCK_PREFIJO = 'orders_sequence:';

/** Muy por debajo de los 5 s por defecto de la transaccion interactiva de Prisma. */
const COTA_DE_BLOQUEO_MS = 3_000;

type Vigilada<T> = {
  readonly operacion: Promise<T>;
  readonly haTerminado: () => boolean;
};

function vigilar<T>(operacion: Promise<T>): Vigilada<T> {
  let terminada = false;
  const anotar = (): void => {
    terminada = true;
  };
  void operacion.then(anotar, anotar);
  return { operacion, haTerminado: () => terminada };
}

/**
 * Espera a ver un backend de la base de la corrida bloqueado en un lock de aviso. Se lee por el
 * pool de Prisma y no por el `Client` que sujeta el lock: dentro de una transaccion,
 * `pg_stat_activity` se congela en la primera lectura.
 */
async function esperarBloqueoDeAviso(observada: Vigilada<unknown>, siTerminaAntes: string): Promise<void> {
  const limite = Date.now() + COTA_DE_BLOQUEO_MS;
  for (;;) {
    const filas = await prisma.$queryRaw<ReadonlyArray<{ n: number }>>`
      SELECT count(*)::int AS "n"
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND wait_event_type = 'Lock'
         AND wait_event IN (${Prisma.join(['advisory'])})`;
    if ((filas[0]?.n ?? 0) > 0) return;
    if (observada.haTerminado()) throw new Error(siTerminaAntes);
    if (Date.now() > limite) {
      throw new Error(`${siTerminaAntes}: nadie espero un lock de aviso en ${String(COTA_DE_BLOQUEO_MS)} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Resuelve con la operacion o rechaza si tarda mas que la cota: «no espero» se mide con reloj. */
async function antesDe<T>(operacion: Promise<T>, ms: number, que: string): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const plazo = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => {
      reject(new Error(`${que}: no termino en ${String(ms)} ms`));
    }, ms);
  });
  try {
    return await Promise.race([operacion, plazo]);
  } finally {
    clearTimeout(temporizador);
  }
}

describe('R14 — dos altas de empresas DISTINTAS no se esperan', () => {
  it('con el lock de la empresa A tomado, el alta de B termina y la de A espera hasta soltarlo', async () => {
    const empresaA = await createFixture();
    const empresaB = await createFixture();
    const sujetador = new Client({ connectionString: connectionString() });
    const pendientes: Promise<unknown>[] = [];
    try {
      await sujetador.connect();
      const ano = new Date().getUTCFullYear();

      // Otra sesion toma el lock del correlativo de A —el mismo que tomaria un alta de A en curso—.
      await sujetador.query('BEGIN');
      await sujetador.query('SELECT pg_advisory_xact_lock($1::int, hashtext($2::text))', [
        CORRELATIVO_LOCK_NAMESPACE,
        `${CORRELATIVO_LOCK_PREFIJO}${empresaA.companyId}:${String(ano)}`,
      ]);

      // Control positivo: el alta de A SI espera. Sin esto, un lock que nunca se tomara —o con otra
      // clave— dejaria verde el caso de B por no haber nada que esperar.
      const altaA = vigilar(altaDe(empresaA));
      pendientes.push(altaA.operacion);
      await esperarBloqueoDeAviso(altaA, 'el alta de A no espero al lock de su propia empresa');

      // El alta de B, con A bloqueada: tiene que terminar sin que nadie suelte nada.
      const altaB = altaDe(empresaB);
      pendientes.push(altaB);
      const [resultadoB] = cumplidasOLanza(
        await Promise.allSettled([antesDe(altaB, COTA_DE_BLOQUEO_MS, 'el alta de B, con A bloqueada')]),
      );
      expect(resultadoB).not.toBe('duplicate_number');
      if (resultadoB === undefined || resultadoB === 'duplicate_number') throw new Error('alta de B fallida');
      expect(resultadoB.number.sequence).toBe(1);
      // Y A sigue esperando: B no la adelanto ni la desbloqueo.
      expect(altaA.haTerminado()).toBe(false);

      await sujetador.query('COMMIT');

      const [resultadoA] = cumplidasOLanza(await Promise.allSettled([altaA.operacion]));
      if (resultadoA === undefined || resultadoA === 'duplicate_number') throw new Error('alta de A fallida');
      expect(resultadoA.number.sequence).toBe(1);
    } finally {
      // Cerrar la conexion deshace lo que no se confirmo y suelta el lock antes de limpiar.
      await sujetador.end().catch(() => undefined);
      await Promise.allSettled(pendientes);
      await dropFixture(empresaA);
      await dropFixture(empresaB);
    }
  });
});
