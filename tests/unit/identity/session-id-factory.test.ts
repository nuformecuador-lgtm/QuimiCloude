// QC-23 T5 — La fabrica del identificador de sesion (`design.md > 3`, R1, R2).
//
// Lo que este archivo tiene que afirmar es exactamente lo que R2 pide y nada mas: que dos
// invocaciones seguidas devuelven identificadores DISTINTOS y con FORMA DE UUID. No se prueba la
// calidad criptografica de `randomUUID` —es API de plataforma y no la escribimos nosotros—, se
// prueba el contrato del puerto.

import { readFileSync } from 'node:fs';

import {
  newSessionId,
  sessionIdCrypto,
} from '@/lib/modules/identity/adapters/driven/session/session-id-crypto';

/** La forma exacta de un UUID en minusculas, que es lo que `SESSION_CLAIMS_SCHEMA` exige. */
const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('SessionIdFactory — el identificador de sesion (QC-23 R1, R2)', () => {
  // R2 — el caso literal del requisito: «dos emisiones para la misma persona, aunque ocurran en
  // el mismo instante, DEBEN producir `sid` distintos». Dos invocaciones seguidas, sin nada en
  // medio: si el valor se derivara del reloj a resolucion de milisegundo, esto seria rojo.
  it('dos invocaciones seguidas devuelven identificadores distintos', () => {
    const primero = newSessionId();
    const segundo = newSessionId();

    expect(primero).not.toBe(segundo);
  });

  // R2 — y no dos, sino muchas: un lote entero sin una sola repeticion. Es la version que
  // atraparia un contador reiniciado o una fuente con periodo corto.
  it('mil invocaciones seguidas no repiten ni una', () => {
    const emitidos = new Set(Array.from({ length: 1000 }, () => newSessionId()));

    expect(emitidos.size).toBe(1000);
  });

  // R1 — con forma de UUID, porque el valor acaba comparandose contra una columna `@db.Uuid`
  // (`revoked_sessions.session_id`) y porque `SESSION_CLAIMS_SCHEMA` lo exige con `.uuid()`. Un
  // base64url de 43 caracteres —como el secreto de QC-79— no valdria aqui.
  it('cada identificador tiene forma de UUID', () => {
    for (let intento = 0; intento < 50; intento += 1) {
      const id = newSessionId();

      expect(id, id).toMatch(FORMA_DE_UUID);
      expect(id).toHaveLength(36);
    }
  });

  // El adaptador completo cumple el puerto y expone EXACTAMENTE un metodo: `newSessionId`. Si
  // alguien le cuelga un segundo —«dame el ultimo», «dame los de este usuario»— esto se pone
  // rojo, y con razon: esta fabrica no guarda estado.
  it('el adaptador expone solo newSessionId y no guarda estado', () => {
    expect(Object.keys(sessionIdCrypto)).toEqual(['newSessionId']);
    expect(sessionIdCrypto.newSessionId()).not.toBe(sessionIdCrypto.newSessionId());
  });

  // R2 escrito en la firma: el metodo NO RECIBE NADA. Sin parametros no hay de donde derivar el
  // identificador —ni del usuario, ni de su empresa, ni de ningun instante—, y esa es justo la
  // propiedad que hace que dos sesiones de la misma persona no puedan colisionar.
  it('la fabrica no recibe ningun parametro del que derivar el identificador', () => {
    expect(newSessionId).toHaveLength(0);
    expect(sessionIdCrypto.newSessionId).toHaveLength(0);
  });

  // El dominio NO tiene fuentes de azar propias (`design.md > 3`): la unica `randomUUID` del
  // modulo vive en este adaptador driven. Si alguien la escribe dentro de `domain/`, esto es lo
  // que lo cuenta antes de que nadie tenga que descubrirlo leyendo un diff.
  it('la aleatoriedad vive en el adaptador, no en el dominio ni en el puerto', () => {
    const adaptador = readFileSync(
      new URL(
        '../../../lib/modules/identity/adapters/driven/session/session-id-crypto.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const puerto = readFileSync(
      new URL('../../../lib/modules/identity/ports/session-id-factory.ts', import.meta.url),
      'utf8',
    );

    expect(adaptador).toContain('crypto.randomUUID()');
    // El puerto es puro: NO IMPORTA NADA. Se miran los `import`, no los comentarios —donde la
    // cabecera dice a proposito que ni `node:crypto` ni el framework entran aqui—.
    expect([...puerto.matchAll(/from '([^']+)'/g)]).toHaveLength(0);
    const cuerpoDelPuerto = puerto
      .split(/\r?\n/)
      .filter((linea) => !linea.trimStart().startsWith('*') && !linea.trimStart().startsWith('//'))
      .join('\n');
    expect(cuerpoDelPuerto).not.toContain('randomUUID');
  });
});
