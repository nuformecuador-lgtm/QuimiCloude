// QC-104 T10 (R16) — el artefacto de la medicion en ejecucion (`design.md > 5.6`).
//
// Lo que este test SI prueba: que la comprobacion en la aplicacion real **se hizo y quedo
// escrita**, con su metodo y con una cifra por pantalla y por guardado, antes y despues.
//
// Lo que NO prueba, y hay que saberlo: que esos numeros sean ciertos. El conteo necesita
// `next build && next start` y una base propia, asi que no puede correr en el gate. La veracidad
// la sostienen el metodo repetible del artefacto y el reviewer.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RUTA = 'progress/medicion_QC-104-sesion-una-sola-vez-por-peticion.md';

function leerArtefacto(): string {
  return readFileSync(resolve(process.cwd(), RUTA), 'utf8');
}

/**
 * Las celdas «antes» y «despues» de la fila de `caso` en la tabla del conteo. `null` si no hay
 * fila: un caso que desaparece de la tabla tiene que poner el test en rojo, no pasar de largo.
 */
function celdasDe(artefacto: string, caso: string): { antes: string; despues: string } | null {
  const fila = artefacto
    .split('\n')
    .find((linea) => linea.trimStart().startsWith('|') && linea.includes(caso));
  if (fila === undefined) return null;

  const columnas = fila
    .split('|')
    .map((celda) => celda.trim())
    .filter((celda) => celda !== '');
  if (columnas.length < 3) return null;

  return { antes: columnas[1], despues: columnas[2] };
}

/** Las tres pantallas de R2 y el guardado: los cuatro casos que R16 exige. */
const CASOS = [
  '/configuracion/usuarios',
  '/pedidos',
  '/configuracion/unidades',
  'guardado (alta de unidad)',
] as const;

describe('QC-104 R16 · artefacto de la medicion en ejecucion', () => {
  it('el artefacto existe y no esta vacio', () => {
    expect(leerArtefacto().trim().length).toBeGreaterThan(0);
  });

  it('tiene la seccion `Metodo`', () => {
    expect(leerArtefacto()).toMatch(/^##\s+Metodo\s*$/m);
  });

  it('tiene la seccion `Conteo en ejecucion`', () => {
    expect(leerArtefacto()).toMatch(/^##\s+Conteo en ejecucion\s*$/m);
  });

  it.each(CASOS)('la tabla trae la fila de %s con antes y despues NUMERICOS', (caso) => {
    const celdas = celdasDe(leerArtefacto(), caso);

    expect(celdas, `falta la fila de "${caso}" en la tabla del conteo`).not.toBeNull();
    // `\d+` y no «algo escrito»: una celda vaciada, un guion o un «pendiente» tienen que morder.
    expect(celdas?.antes, `el «antes» de "${caso}" no es un numero`).toMatch(/^\d+$/);
    expect(celdas?.despues, `el «despues» de "${caso}" no es un numero`).toMatch(/^\d+$/);
  });

  it('no hay ninguna seccion de tiempos (decision de F1.4)', () => {
    const encabezados = leerArtefacto()
      .split('\n')
      .filter((linea) => /^#{1,6}\s/.test(linea));

    expect(encabezados.filter((linea) => /tiempo|duracion|latencia|ms\b/i.test(linea))).toEqual([]);
  });

  it('deja escrito el metodo para repetirlo: la via del conteo y el marcador', () => {
    const artefacto = leerArtefacto();

    expect(artefacto).toContain('pg_stat_user_tables');
    expect(artefacto).toContain('revoked_sessions');
  });
});
