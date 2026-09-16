// QC-104 T2 — La semantica de `lib/shared/request-scope.ts` (`design.md > 5.1`), con un
// `renderStore` INYECTADO: en Vitest el `cache` real de React no memoiza nada
// (`design.md > 0`, H5), asi que el ambito de pintado se simula y lo que se prueba aqui es
// el cableado, no React.
// Cubre R4, R5, R6, R7, R9 y la prueba de fuente de R20.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createRequestScope } from '@/lib/shared/request-scope';

/**
 * Un `renderStore` que el test controla: mientras hay «pintado», devuelve SIEMPRE el mismo
 * `Map` (lo que hace `React.cache` dentro de una peticion); fuera, devuelve uno nuevo en
 * cada llamada (lo que hace `cache` sin peticion de React).
 */
function crearPintadoSimulado() {
  let mapaDelPintado: Map<object, unknown> | null = null;
  return {
    renderStore: () => mapaDelPintado ?? new Map<object, unknown>(),
    empezarPintado: () => {
      mapaDelPintado = new Map<object, unknown>();
    },
    terminarPintado: () => {
      mapaDelPintado = null;
    },
  };
}

/** Ambito de peticion sin ningun pintado activo: el caso de las Server Actions. */
function crearAmbitoSinPintado() {
  return createRequestScope({ renderStore: () => new Map<object, unknown>() });
}

/** Un contador de evaluaciones con una promesa que el test resuelve cuando quiere. */
function crearContador<T>(valor: T) {
  let llamadas = 0;
  return {
    get llamadas() {
      return llamadas;
    },
    compute: async () => {
      llamadas += 1;
      return valor;
    },
  };
}

describe('QC-104 · request-scope', () => {
  describe('dentro de un ambito explicito', () => {
    it('evalua `compute` UNA sola vez aunque la funcion envuelta se llame N veces', async () => {
      const { requestScoped, runInRequestScope } = crearAmbitoSinPintado();
      const contador = crearContador('sesion');
      const leerSesion = requestScoped(contador.compute);

      const resultados = await runInRequestScope(async () =>
        Promise.all([leerSesion(), leerSesion(), leerSesion(), leerSesion()]),
      );

      expect(contador.llamadas).toBe(1);
      expect(resultados).toEqual(['sesion', 'sesion', 'sesion', 'sesion']);
    });

    it('comparte la MISMA promesa entre dos llamadas simultaneas, no solo el valor', async () => {
      const { requestScoped, runInRequestScope } = crearAmbitoSinPintado();
      const leerSesion = requestScoped(crearContador('sesion').compute);

      const [primera, segunda] = await runInRequestScope(async () => [leerSesion(), leerSesion()]);

      expect(primera).toBe(segunda);
      await Promise.all([primera, segunda]);
    });
  });

  describe('nunca entre peticiones (R5, R6)', () => {
    it('dos ambitos SEGUIDOS no comparten: `compute` se evalua una vez en cada uno', async () => {
      const { requestScoped, runInRequestScope } = crearAmbitoSinPintado();
      const contador = crearContador('sesion');
      const leerSesion = requestScoped(contador.compute);

      await runInRequestScope(async () => leerSesion());
      await runInRequestScope(async () => leerSesion());

      expect(contador.llamadas).toBe(2);
    });

    it('dos ambitos SIMULTANEOS no comparten, y cada uno recibe lo suyo', async () => {
      const { requestScoped, runInRequestScope } = crearAmbitoSinPintado();
      let llamadas = 0;
      // Cada evaluacion devuelve un valor distinto: si los ambitos compartieran, los dos
      // veedores recibirian el mismo, que es exactamente lo que R6 prohibe.
      const leerSesion = requestScoped(async () => {
        llamadas += 1;
        // El valor se fija ANTES de ceder el turno: si se leyera el contador despues del
        // await, las dos evaluaciones devolverian el mismo texto y el test mentiria.
        const mio = `sesion-${llamadas}`;
        // Un salto de microtarea para que los dos ambitos se solapen de verdad.
        await Promise.resolve();
        return mio;
      });

      const [primera, segunda] = await Promise.all([
        runInRequestScope(async () => Promise.all([leerSesion(), leerSesion()])),
        runInRequestScope(async () => Promise.all([leerSesion(), leerSesion()])),
      ]);

      expect(llamadas).toBe(2);
      expect(primera[0]).toBe(primera[1]);
      expect(segunda[0]).toBe(segunda[1]);
      expect(primera[0]).not.toBe(segunda[0]);
    });
  });

  describe('reutilizacion del ambito activo', () => {
    it('un `runInRequestScope` ANIDADO reutiliza el de fuera y no abre otro', async () => {
      const { requestScoped, runInRequestScope } = crearAmbitoSinPintado();
      const contador = crearContador('sesion');
      const leerSesion = requestScoped(contador.compute);

      await runInRequestScope(async () => {
        await leerSesion();
        await runInRequestScope(async () => leerSesion());
        await leerSesion();
      });

      expect(contador.llamadas).toBe(1);
    });

    it('con un ambito de PINTADO activo no abre otro y comparte con el pintado (design.md > 2.4)', async () => {
      const pintado = crearPintadoSimulado();
      const { requestScoped, runInRequestScope } = createRequestScope({
        renderStore: pintado.renderStore,
      });
      const contador = crearContador('sesion');
      const leerSesion = requestScoped(contador.compute);

      pintado.empezarPintado();
      // El layout lee mientras se pinta...
      await leerSesion();
      // ...y una Server Action invocada por un componente de servidor durante ese mismo
      // pintado NO abre un ambito propio: comparte la lectura del pintado (R1 depende de
      // esto).
      await runInRequestScope(async () => leerSesion());
      await leerSesion();
      pintado.terminarPintado();

      expect(contador.llamadas).toBe(1);
    });
  });

  describe('fuera de todo ambito (R7)', () => {
    it('no memoiza: `compute` se evalua en cada llamada', async () => {
      const { requestScoped } = crearAmbitoSinPintado();
      const contador = crearContador('sesion');
      const leerSesion = requestScoped(contador.compute);

      await leerSesion();
      await leerSesion();
      await leerSesion();

      expect(contador.llamadas).toBe(3);
    });

    it('tampoco memoiza DESPUES de que un ambito explicito haya terminado', async () => {
      const { requestScoped, runInRequestScope } = crearAmbitoSinPintado();
      const contador = crearContador('sesion');
      const leerSesion = requestScoped(contador.compute);

      await runInRequestScope(async () => leerSesion());
      await leerSesion();

      expect(contador.llamadas).toBe(2);
    });
  });

  describe('fallo cerrado (R9)', () => {
    it('comparte la promesa RECHAZADA y no reintenta `compute` dentro del ambito', async () => {
      const { requestScoped, runInRequestScope } = crearAmbitoSinPintado();
      let llamadas = 0;
      const leerSesion = requestScoped(async () => {
        llamadas += 1;
        throw new Error('la base fallo');
      });

      const resultados = await runInRequestScope(async () =>
        Promise.allSettled([leerSesion(), leerSesion(), leerSesion()]),
      );

      expect(llamadas).toBe(1);
      expect(resultados.map((resultado) => resultado.status)).toEqual([
        'rejected',
        'rejected',
        'rejected',
      ]);
    });

    it('el ambito SIGUIENTE vuelve a intentarlo: el rechazo no sale de su peticion', async () => {
      const { requestScoped, runInRequestScope } = crearAmbitoSinPintado();
      let llamadas = 0;
      const leerSesion = requestScoped(async () => {
        llamadas += 1;
        throw new Error('la base fallo');
      });

      await runInRequestScope(async () => leerSesion()).catch(() => null);
      await runInRequestScope(async () => leerSesion()).catch(() => null);

      expect(llamadas).toBe(2);
    });
  });

  describe('fin del ambito explicito y repintado posterior (R4)', () => {
    it('al terminar el ambito de la accion, un ambito de PINTADO posterior lee de nuevo', async () => {
      const pintado = crearPintadoSimulado();
      const { requestScoped, runInRequestScope } = createRequestScope({
        renderStore: pintado.renderStore,
      });
      const contador = crearContador('sesion');
      const leerSesion = requestScoped(contador.compute);

      // La Server Action, invocada desde el navegador: sin pintado, ambito explicito.
      await runInRequestScope(async () => Promise.all([leerSesion(), leerSesion()]));
      expect(contador.llamadas).toBe(1);

      // El repintado que Next hace despues, en la misma respuesta: es OTRO ambito y vuelve
      // a leer, asi que pinta la sesion de DESPUES de la mutacion (R4, provisional).
      pintado.empezarPintado();
      await Promise.all([leerSesion(), leerSesion()]);
      pintado.terminarPintado();

      expect(contador.llamadas).toBe(2);
    });
  });

  describe('sin dependencias nuevas (R20)', () => {
    it('el archivo solo importa `react` y `node:async_hooks`', () => {
      const fuente = readFileSync(resolve(process.cwd(), 'lib/shared/request-scope.ts'), 'utf8');
      const especificadores = [...fuente.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(
        (coincidencia) => coincidencia[1],
      );

      expect(especificadores.length).toBeGreaterThan(0);
      expect([...especificadores].sort()).toEqual(['node:async_hooks', 'react']);
    });
  });
});
