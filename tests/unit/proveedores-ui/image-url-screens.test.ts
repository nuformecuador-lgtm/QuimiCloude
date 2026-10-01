import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Barrido de las tres pantallas que muestran un recorte (R8): ninguna compone una URL por su
 * cuenta. Reciben la URL ya compuesta por el servidor y la pintan tal cual.
 */

const RAIZ = join(__dirname, '..', '..', '..');

const CARPETAS = [
  join('app', '(private)', 'proveedores', 'components'),
  join('app', '(private)', 'proveedores', '[id]', 'components'),
  join('app', '(private)', 'proveedores', '[id]', 'importar', '[documentoId]', 'components'),
] as const;

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

function fuentesBajo(carpeta: string): string[] {
  const encontradas: string[] = [];

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
        recorrer(completa);
        continue;
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(aPosix(relative(RAIZ, completa)));
      }
    }
  };

  recorrer(join(RAIZ, carpeta));
  return encontradas.sort();
}

const FUENTES = CARPETAS.flatMap((carpeta) => fuentesBajo(carpeta));

describe('las tres pantallas del recorte no componen ninguna URL (R8)', () => {
  it('tiene fuentes que barrer en las tres carpetas', () => {
    expect(FUENTES.length).toBeGreaterThan(0);
  });

  it('ningun archivo importa ni llama a getPublicUrl', () => {
    const culpables = FUENTES.filter((archivo) => leer(archivo).includes('getPublicUrl'));

    expect(culpables, `componen la URL a mano: ${culpables.join(', ')}`).toEqual([]);
  });

  it('ningun archivo escribe el formato interno del bucket (storage/v1)', () => {
    const culpables = FUENTES.filter((archivo) => leer(archivo).includes('storage/v1'));

    expect(culpables, `incrustan el formato de Supabase: ${culpables.join(', ')}`).toEqual([]);
  });

  it('ningun archivo lee una variable de entorno de Supabase', () => {
    const culpables = FUENTES.filter((archivo) => leer(archivo).includes('SUPABASE_'));

    expect(culpables, `leen configuracion de almacenamiento: ${culpables.join(', ')}`).toEqual([]);
  });

  it('ningun archivo concatena una ruta dentro de un src', () => {
    // La forma que delataria una URL montada a mano en marcado: una plantilla o una concatenacion
    // que termina en `src=` o en la prop `path`/`src` de un componente.
    const patronPlantilla = /src=\{`[^`]*\$\{/;
    const patronConcat = /src=\{[^}]*\+[^}]*\}/;

    const culpables = FUENTES.filter((archivo) => {
      const fuente = leer(archivo);
      return patronPlantilla.test(fuente) || patronConcat.test(fuente);
    });

    expect(culpables, `concatenan una ruta en un src: ${culpables.join(', ')}`).toEqual([]);
  });
});
