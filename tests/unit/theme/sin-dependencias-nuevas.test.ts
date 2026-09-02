// T17 — Guardia de D9/R28: ninguna libreria de tema entra en `package.json`. No se congela la
// lista entera de dependencias (eso seria un peaje para toda feature futura); la guardia
// `guard-dependencias-aprobadas` ya cubre el caso general contra `docs/dependencias.md`. Este
// test protege especificamente la decision D9: `next-themes` fue propuesta y el humano la
// rechazo (18 meses sin release), asi que el mecanismo de tema es codigo propio de este repo.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PACKAGE_JSON_PATH = fileURLToPath(new URL('../../../package.json', import.meta.url));

// Cualquier nombre de paquete que contenga "theme" es sospechoso en el contexto de esta
// feature: cubre `next-themes` y variantes razonables sin listar cada libreria de tema que
// exista.
const THEME_LIBRARY_PATTERN = /theme/i;

describe('sin-dependencias-nuevas', () => {
  it('no incorpora next-themes ni ninguna libreria de tema a package.json', () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];

    expect(allDependencyNames).not.toContain('next-themes');

    const themeLibraries = allDependencyNames.filter((name) => THEME_LIBRARY_PATTERN.test(name));
    expect(themeLibraries).toEqual([]);
  });
});
