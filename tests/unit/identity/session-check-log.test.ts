// QC-23 T10/T19 — el adaptador del registro del servidor de la comprobacion de sesion
// (`lib/modules/identity/adapters/driven/observability/session-check-log-console.ts`,
// `design.md > 4.2`, `> 7`). Cubre R17.
//
// QUE SE EJERCITA AQUI Y NO EN `resolve-session.test.ts`: que la causa y el **identificador de
// peticion de QC-71** acaban en la MISMA linea. El dominio no puede afirmarlo —QC-71 R9 prohibe
// que el identificador atraviese el `domain/` o los `ports/` de un modulo de negocio, y su
// guardia lo vigila—, asi que R17 se comprueba del lado del adaptador, que es donde las dos
// mitades se juntan.
//
// La lectura de la cabecera entra por parametro, igual que en `createErrorStateTranslator`: aqui
// se le pasa un doble y no se parchea `next/headers` ni la consola global.

import { createSessionCheckLogConsole } from '@/lib/modules/identity/adapters/driven/observability/session-check-log-console';

const IDENTIFICADOR_DE_PETICION = '0b8f5b3c-9d21-4f77-a1c4-6e2b8d5a3f19';
const CAUSA = 'resolve-session: la comprobacion de sesion fallo (connect ECONNREFUSED)';

describe('createSessionCheckLogConsole', () => {
  // R17 — la causa y el identificador, juntos y en la misma linea. Es la unica forma de
  // distinguir, mirando los logs, un corte de base de un cierre de sesion.
  it('escribe la causa junto al identificador de peticion', async () => {
    const escribir = vi.fn();
    const registro = createSessionCheckLogConsole(
      async () => IDENTIFICADOR_DE_PETICION,
      escribir,
    );

    registro.log(CAUSA);
    // El puerto es sincrono y la lectura de la cabecera no lo es: se cede el turno para que la
    // linea llegue a escribirse.
    await Promise.resolve();
    await Promise.resolve();

    expect(escribir).toHaveBeenCalledTimes(1);
    const linea = escribir.mock.calls[0]?.[0] as string;
    expect(linea).toContain(IDENTIFICADOR_DE_PETICION);
    expect(linea).toContain(CAUSA);
  });

  // QC-71 R8 visto desde aqui — si el identificador no llego (peticion fuera del `matcher`, o el
  // cruce roto), la linea se escribe IGUAL, con el hueco. Perder la constancia de que una
  // comprobacion de sesion fallo es exactamente lo que R17 impide.
  it('sin identificador escribe la linea igual, con el hueco', async () => {
    const escribir = vi.fn();
    const registro = createSessionCheckLogConsole(async () => null, escribir);

    registro.log(CAUSA);
    await Promise.resolve();
    await Promise.resolve();

    expect(escribir).toHaveBeenCalledTimes(1);
    const linea = escribir.mock.calls[0]?.[0] as string;
    expect(linea).toContain('sin-identificador');
    expect(linea).toContain(CAUSA);
  });

  // R17 — y si la lectura de la cabecera LANZA, tampoco se pierde la linea. El `catch` del
  // adaptador no esta vacio: cae al hueco y sigue escribiendo.
  it('si la lectura de la cabecera lanza sigue escribiendo la causa', async () => {
    const escribir = vi.fn();
    const registro = createSessionCheckLogConsole(async () => {
      throw new Error('headers() fuera de una peticion');
    }, escribir);

    registro.log(CAUSA);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(escribir).toHaveBeenCalledTimes(1);
    expect(escribir.mock.calls[0]?.[0]).toContain(CAUSA);
  });

  // El puerto no espera por la linea: `log` devuelve `void` y el camino que ya decidio cortar
  // sigue sin bloquearse. Se afirma sobre el valor devuelto, que es lo que el tipo promete.
  it('log no devuelve ninguna promesa por la que esperar', () => {
    const registro = createSessionCheckLogConsole(async () => null, vi.fn());

    expect(registro.log(CAUSA)).toBeUndefined();
  });
});
