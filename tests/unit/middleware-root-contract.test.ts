// QC-9 T14 — El contrato del `middleware.ts` de la raiz (R20, R21, R22).
//
// Dos afirmaciones, y las dos importan:
//
// 1. **El archivo no decide nada.** Next obliga a que el middleware viva en la raiz, y ese es
//    exactamente el sitio donde es tentador escribir «solo un `if`». La feature vive en
//    `lib/modules/identity`; aqui solo hay un reexport y el `matcher`. Se afirma sobre el TEXTO
//    del archivo porque es lo unico que caza una decision escrita en la raiz antes de que se
//    convierta en la segunda copia de la politica.
// 2. **El `matcher` excluye los estaticos** (R22). Se comprueba ejercitandolo como expresion
//    regular contra rutas reales, no buscando subcadenas: lo que interesa es a que peticiones se
//    aplica, no como esta escrito.
//
// Por que el `matcher` es un literal duplicado y no una constante importada: Next lo lee
// estaticamente al construir el bundle y no resuelve constantes (`design.md > 2`). Importarla
// dejaria el middleware sin aplicarse en produccion, en silencio.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { config, middleware } from '@/middleware';

const RUTA = 'middleware.ts';
const fuente = readFileSync(resolve(process.cwd(), RUTA), 'utf8');

/** El `matcher` de Next, ejercitado como la expresion regular que es. */
function seAplicaA(pathname: string): boolean {
  const [patron] = config.matcher;
  return new RegExp(`^${patron}$`).test(pathname);
}

describe('middleware.ts de la raiz', () => {
  it('exporta el handler y su configuracion', () => {
    expect(typeof middleware).toBe('function');
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher).toHaveLength(1);
  });

  it('delega en el adaptador driving del modulo identity y no reimplementa nada', () => {
    expect(fuente).toContain(
      "export { middleware } from '@/lib/modules/identity/adapters/driving/route-guard-middleware'",
    );
  });

  it('no contiene ninguna decision propia: ni redireccion, ni rutas, ni criptografia (R20)', () => {
    expect(fuente).not.toMatch(/redirect\(/);
    expect(fuente).not.toContain('/dashboard');
    expect(fuente).not.toContain('/login');
    expect(fuente).not.toContain('subtle');
  });

  it('no importa un adaptador driven: el cableado vive solo en lib/composition (R21)', () => {
    expect(fuente).not.toContain('adapters/driven');
    expect(fuente).not.toContain('@prisma/client');
  });

  it('se aplica a las paginas de la aplicacion', () => {
    expect(seAplicaA('/dashboard')).toBe(true);
    expect(seAplicaA('/dashboard/reportes')).toBe(true);
    expect(seAplicaA('/login')).toBe(true);
    expect(seAplicaA('/')).toBe(true);
  });

  it('no se aplica a los recursos estaticos (R22)', () => {
    expect(seAplicaA('/_next/static/chunks/main.js')).toBe(false);
    expect(seAplicaA('/_next/image')).toBe(false);
    expect(seAplicaA('/favicon.ico')).toBe(false);
    for (const asset of [
      '/logo.svg',
      '/foto.png',
      '/foto.jpg',
      '/foto.jpeg',
      '/animacion.gif',
      '/foto.webp',
      '/icono.ico',
    ]) {
      expect(seAplicaA(asset)).toBe(false);
    }
  });
});
