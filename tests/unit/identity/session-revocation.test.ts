// QC-23 T6 — El dominio de la revocacion: funciones puras, objetos planos y ningun reloj
// (`design.md > 2.3`, `> 5.5`). Cubre R8, R9, R33, R34, R35, R36.
//
// Todo lo de aqui se prueba con literales: no hay puerto que doblar, no hay base que montar y no
// hay `now` que congelar, porque los instantes ENTRAN como parametro. Si algun dia hiciera falta
// un `vi.useFakeTimers()` en este archivo, la regresion no seria del test: seria que alguien metio
// un reloj dentro del dominio.

import { readFileSync } from 'node:fs';

import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import {
  changeRevokesSessions,
  firstIssuedAtAfterStamp,
  floorToSecond,
  isStampedOut,
  issuedAtForNewSession,
  MAX_ISSUE_LEAD_MS,
} from '@/lib/modules/identity/domain/session-revocation';

/** El sello, ya truncado al segundo: es como se guarda (`design.md > 2.3`). */
const SELLO = new Date('2026-09-12T10:00:00.000Z');

describe('floorToSecond — el sello se guarda truncado al segundo (R7)', () => {
  it('trunca hacia abajo, nunca redondea', () => {
    expect(floorToSecond(new Date('2026-09-12T10:00:00.001Z')).toISOString()).toBe(
      '2026-09-12T10:00:00.000Z',
    );
    expect(floorToSecond(new Date('2026-09-12T10:00:00.999Z')).toISOString()).toBe(
      '2026-09-12T10:00:00.000Z',
    );
    expect(floorToSecond(new Date('2026-09-12T10:00:00.500Z')).toISOString()).toBe(
      '2026-09-12T10:00:00.000Z',
    );
  });

  it('un instante ya exacto al segundo se queda como esta', () => {
    expect(floorToSecond(SELLO).getTime()).toBe(SELLO.getTime());
  });

  it('es idempotente: truncar dos veces da lo mismo que truncar una', () => {
    const sucio = new Date('2026-09-12T10:00:00.437Z');

    expect(floorToSecond(floorToSecond(sucio)).getTime()).toBe(floorToSecond(sucio).getTime());
  });

  // Mutar el argumento de quien llama seria mover un instante que puede estar ya dentro de un
  // ticket emitido.
  it('no muta la fecha que se le pasa', () => {
    const original = new Date('2026-09-12T10:00:00.437Z');

    floorToSecond(original);

    expect(original.toISOString()).toBe('2026-09-12T10:00:00.437Z');
  });
});

// ---------------------------------------------------------------------------------------------
// R8, R9 — LA COMPARACION ES `<=`, NO `<` ESTRICTO.
//
// Es la tabla literal de `design.md > 2.3`, y la fila que importa es la del medio: una sesion
// AJENA emitida EN EL MISMO SEGUNDO que el sello queda INVALIDA. Con `<` estricto sobreviviria, y
// eso es un agujero de hasta un segundo en la revocacion (alternativa descartada 4). Si alguien
// cambia el operador, este bloque es lo que se pone rojo.
// ---------------------------------------------------------------------------------------------
describe('isStampedOut — el corte por sello (R8, R9)', () => {
  it('una sesion emitida ANTES del sello es invalida', () => {
    expect(isStampedOut({ issuedAt: new Date('2026-09-12T09:59:59.000Z') }, SELLO)).toBe(true);
    expect(isStampedOut({ issuedAt: new Date('2026-09-12T02:00:00.000Z') }, SELLO)).toBe(true);
  });

  // EL BORDE DE LA FICHA. `<=`, no `<`.
  it('una sesion emitida EN EL MISMO SEGUNDO que el sello es invalida', () => {
    expect(isStampedOut({ issuedAt: new Date(SELLO.getTime()) }, SELLO)).toBe(true);
  });

  it('una sesion emitida DESPUES del sello es valida', () => {
    expect(isStampedOut({ issuedAt: new Date('2026-09-12T10:00:01.000Z') }, SELLO)).toBe(false);
    expect(isStampedOut({ issuedAt: new Date('2026-09-12T18:00:00.000Z') }, SELLO)).toBe(false);
  });

  // R9 — «sin ventana ni excepcion»: un milisegundo despues del sello ya vale. La granularidad de
  // `iat` es el segundo, asi que en la practica el primer valor posible es `sello + 1 s`; esto
  // ancla que la funcion no tiene ningun margen de cortesia escondido.
  it('no hay ventana de gracia: un milisegundo despues del sello ya no esta sellada', () => {
    expect(isStampedOut({ issuedAt: new Date(SELLO.getTime() + 1) }, SELLO)).toBe(false);
    expect(isStampedOut({ issuedAt: new Date(SELLO.getTime() - 1) }, SELLO)).toBe(true);
  });

  // Un sello recien nacido (la fila se creo hoy y nadie ha emitido nada) mata igual: no hay caso
  // especial para «nunca se reboco nada».
  it('un sello igual al instante de nacimiento de la fila mata lo emitido en ese instante', () => {
    const nacimiento = new Date('2026-09-12T00:00:00.000Z');

    expect(isStampedOut({ issuedAt: nacimiento }, nacimiento)).toBe(true);
  });
});

describe('firstIssuedAtAfterStamp — el iat de la reemision de R31', () => {
  // El contrato de esta funcion ES la desigualdad de arriba, y por eso se afirma CONTRA
  // `isStampedOut` y no contra un numero escrito a mano: si el operador cambiara, las dos se
  // moverian juntas o este test se pondria rojo.
  //
  // «El primero» se entiende a la granularidad con la que `iat` viaja, que es el SEGUNDO: el
  // segundo anterior —el del propio sello— ya esta sellado. No se mira el milisegundo anterior
  // porque ese instante no es expresable en un token: `toEpochSeconds` lo truncaria al sello.
  it('produce el primer instante emisible que el sello NO mata', () => {
    expect(isStampedOut({ issuedAt: firstIssuedAtAfterStamp(SELLO) }, SELLO)).toBe(false);

    const unSegundoAntes = new Date(firstIssuedAtAfterStamp(SELLO).getTime() - 1000);
    expect(isStampedOut({ issuedAt: unSegundoAntes }, SELLO)).toBe(true);
    // Y ese segundo anterior es EXACTAMENTE el sello: no hay ningun hueco entre los dos.
    expect(unSegundoAntes.getTime()).toBe(SELLO.getTime());
  });

  // `design.md > 2.3`: la sesion reemitida nace con `iat = sello + 1 s`. El precio declarado y
  // aceptado es que dura un segundo mas de ocho horas.
  it('es exactamente el sello mas un segundo', () => {
    expect(firstIssuedAtAfterStamp(SELLO).toISOString()).toBe('2026-09-12T10:00:01.000Z');
  });

  // Si el sello llegara sin truncar —437 ms de nada—, la emision no puede quedar por debajo del
  // segundo siguiente: equivocarse aqui es emitir una sesion que nace invalida.
  it('un sello sin truncar no desplaza la emision por debajo del segundo', () => {
    const sucio = new Date('2026-09-12T10:00:00.437Z');

    expect(firstIssuedAtAfterStamp(sucio).toISOString()).toBe('2026-09-12T10:00:01.000Z');
    expect(isStampedOut({ issuedAt: firstIssuedAtAfterStamp(sucio) }, floorToSecond(sucio))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// R33, R34, R35, R36 — QUE CAMBIO CORTA LAS SESIONES VIVAS. Tabla de casos con objetos planos.
// ---------------------------------------------------------------------------------------------
describe('changeRevokesSessions — que cambio sube el sello (R33-R36)', () => {
  // R33 — bloquear o desactivar una cuenta corta todo lo abierto, y de forma DURADERA: volver a
  // activarla no revive las cookies que quedaron por ahi (R37).
  it('pasar a blocked o a inactive corta las sesiones (R33)', () => {
    expect(changeRevokesSessions({ kind: 'account_status', next: 'blocked' })).toBe(true);
    expect(changeRevokesSessions({ kind: 'account_status', next: 'inactive' })).toBe(true);
  });

  // R36 — `pending` NO corta: una cuenta pendiente nunca llego a tener sesion. Y `active`
  // tampoco: subir el sello al reactivar echaria a quien acabara de entrar.
  it('pasar a pending o a active NO corta las sesiones (R36)', () => {
    expect(changeRevokesSessions({ kind: 'account_status', next: 'pending' })).toBe(false);
    expect(changeRevokesSessions({ kind: 'account_status', next: 'active' })).toBe(false);
  });

  // La tabla ENTERA del conjunto cerrado de QC-65, para que añadir un quinto estado obligue a
  // decidir aqui en vez de heredar un `false` por descuido.
  it('los cuatro estados del catalogo tienen una respuesta decidida, no heredada', () => {
    const esperado: ReadonlyArray<readonly [UserAccountStatus, boolean]> = [
      ['active', false],
      ['pending', false],
      ['inactive', true],
      ['blocked', true],
    ];

    for (const [estado, corta] of esperado) {
      expect(changeRevokesSessions({ kind: 'account_status', next: estado }), estado).toBe(corta);
    }
  });

  // R35 — solo si el rol cambio DE VERDAD. QC-66 R19 es reemplazo completo: casi toda edicion
  // reescribe el mismo `role_id`, y cortar ahi echaria a la persona cada vez que un administrador
  // le corrige el telefono.
  it('el cambio de rol corta solo si el rol cambio de verdad (R35)', () => {
    expect(changeRevokesSessions({ kind: 'role', changed: true })).toBe(true);
    expect(changeRevokesSessions({ kind: 'role', changed: false })).toBe(false);
  });

  // R34 — el borrado corta siempre, sin condicion.
  it('el borrado corta las sesiones, sin condicion (R34)', () => {
    expect(changeRevokesSessions({ kind: 'delete' })).toBe(true);
  });
});

// `design.md > 5.5` y la cabecera del archivo: la DECISION es dominio y la APLICACION es del
// adaptador. Un reloj aqui dentro romperia lo primero y haria intestable lo segundo.
describe('el dominio de la revocacion es puro (R46)', () => {
  it('no lee el reloj ni importa framework, Prisma o lo compartido', () => {
    const fuente = readFileSync(
      new URL('../../../lib/modules/identity/domain/session-revocation.ts', import.meta.url),
      'utf8',
    );

    expect(fuente.length).toBeGreaterThan(0);
    // `now` NUNCA se lee dentro: los instantes entran como parametro. Se mira el CODIGO, no los
    // comentarios, que es donde la frase «sin reloj» esta escrita a proposito.
    const codigo = fuente
      .split(/\r?\n/)
      .filter((linea) => !linea.trimStart().startsWith('*') && !linea.trimStart().startsWith('//'))
      .join('\n');
    expect(codigo).not.toContain('new Date()');
    expect(codigo).not.toContain('Date.now(');

    // Y lo mismo con las dependencias: se miran los IMPORT, no la cabecera que los prohibe.
    const imports = [...fuente.matchAll(/from '([^']+)'/g)].map((match) => match[1] as string);
    expect(imports).toEqual(['./account-status']);
  });
});

// ---------------------------------------------------------------------------------------------
// El instante de emision de una sesion nueva frente al sello: el login en el mismo segundo que el
// sello no puede nacer revocado, y el corte de las sesiones anteriores no se afloja.
// ---------------------------------------------------------------------------------------------
describe('issuedAtForNewSession — el login en el mismo segundo que el sello', () => {
  const at = (iso: string): Date => new Date(`2026-09-12T${iso}Z`);

  it('R1: sello truncado y login 16 ms despues, en su mismo segundo → segundo siguiente', () => {
    expect(issuedAtForNewSession(at('10:00:00.016'), at('10:00:00.000')).toISOString()).toBe(
      '2026-09-12T10:00:01.000Z',
    );
  });

  it('R1, R2: sello con fraccion de segundo (el del alta) y login en su mismo segundo → segundo siguiente', () => {
    expect(issuedAtForNewSession(at('10:00:00.516'), at('10:00:00.500')).toISOString()).toBe(
      '2026-09-12T10:00:01.000Z',
    );
  });

  it('R3: un login ya en el segundo siguiente al sello se emite con el instante actual, el mismo objeto', () => {
    const now = at('10:00:01.000');
    expect(issuedAtForNewSession(now, at('10:00:00.000'))).toBe(now);
  });

  it('R3: un sello de ayer no toca la emision', () => {
    const now = at('10:00:00.016');
    expect(issuedAtForNewSession(now, new Date('2026-09-11T10:00:00.000Z'))).toBe(now);
  });

  it('R4: adelanto de exactamente MAX_ISSUE_LEAD_MS → adelanta; 1 ms mas → instante actual', () => {
    expect(MAX_ISSUE_LEAD_MS).toBe(2_000);

    // El primer instante que no invalida el sello 10:00:01 es 10:00:02; desde 10:00:00.000 son 2 000 ms.
    const enElBorde = at('10:00:00.000');
    expect(issuedAtForNewSession(enElBorde, at('10:00:01.000')).toISOString()).toBe(
      '2026-09-12T10:00:02.000Z',
    );

    // Desde 09:59:59.999 son 2 001 ms: no se adelanta y la sesion nace invalida, como sin el ajuste.
    const pasado = at('09:59:59.999');
    const emitido = issuedAtForNewSession(pasado, at('10:00:01.000'));
    expect(emitido).toBe(pasado);
    expect(isStampedOut({ issuedAt: floorToSecond(emitido) }, at('10:00:01.000'))).toBe(true);
  });

  it('R7: cuando adelanta, el corte deja pasar el instante emitido y corta un milisegundo antes', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['10:00:00.016', '10:00:00.000'],
      ['10:00:00.516', '10:00:00.500'],
      ['10:00:00.999', '10:00:00.999'],
      ['10:00:00.000', '10:00:00.000'],
      ['10:00:00.300', '10:00:00.700'],
      ['10:00:00.000', '10:00:01.000'],
    ];

    for (const [now, sello] of casos) {
      const emitido = issuedAtForNewSession(at(now), at(sello));
      expect(emitido.getTime(), `${now} / ${sello}`).not.toBe(at(now).getTime());
      expect(isStampedOut({ issuedAt: floorToSecond(emitido) }, at(sello)), `${now} / ${sello}`).toBe(false);
      const unMsAntes = new Date(emitido.getTime() - 1);
      expect(isStampedOut({ issuedAt: floorToSecond(unMsAntes) }, at(sello)), `${now} / ${sello}`).toBe(true);
    }
  });

  it('R16: vive en el dominio de la revocacion sin leer ningun reloj', () => {
    const fuente = readFileSync(
      new URL('../../../lib/modules/identity/domain/session-revocation.ts', import.meta.url),
      'utf8',
    );
    const codigo = fuente
      .split(/\r?\n/)
      .filter((linea) => !linea.trimStart().startsWith('*') && !linea.trimStart().startsWith('//'))
      .join('\n');

    expect(codigo).toContain('export function issuedAtForNewSession(now: Date, sessionsValidFrom: Date)');
    expect(codigo).not.toContain('new Date()');
    expect(codigo).not.toContain('Date.now(');
  });
});
