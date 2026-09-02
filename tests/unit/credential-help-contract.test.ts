// QC-21 — T6: centinelas de TEXTO sobre los tres archivos nuevos de `components/shared/`.
//
// Al estilo de `tests/unit/identity/credential-policy-contract.test.ts`: se vigila lo que los
// archivos DECLARAN, no lo que hacen en tiempo de ejecucion. Cubre R2, R6, R14, R19, R21, R22.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findPlaintextPasswordDeclarations } from '../guards/guard-password-never-plaintext.test';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

function read(...segments: readonly string[]): string {
  return readFileSync(join(repoRoot, ...segments), 'utf8');
}

/** Los tres archivos nuevos de esta feature, con su ruta relativa a la raiz del repo. */
const NEW_FILES: ReadonlyArray<{ path: string; source: string }> = [
  { path: 'components/shared/credential-rule-labels.ts', source: read('components', 'shared', 'credential-rule-labels.ts') },
  { path: 'components/shared/credential-requirements.tsx', source: read('components', 'shared', 'credential-requirements.tsx') },
  { path: 'components/shared/credential-field.tsx', source: read('components', 'shared', 'credential-field.tsx') },
];

/** Quita comentarios de bloque y de linea: se vigila lo declarado, no lo explicado. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** Quita el contenido de `className="..."` / `className={...}`: ahi viven clases de Tailwind
 * como `gap-1` o `size-4`, que no son literales de longitud de credencial. */
function stripClassNameProps(source: string): string {
  return source.replace(/className\s*=\s*(?:"[^"]*"|\{[^}]*\})/g, 'className=""');
}

// --- R2 — sin regla, umbral ni regex propios ---------------------------------------

describe('credential-help-contract — sin regla propia (R2)', () => {
  it('no declara ninguna regla ni umbral propio', () => {
    for (const { path, source } of NEW_FILES) {
      const sinComentarios = stripComments(source);
      const sinClases = stripClassNameProps(sinComentarios);

      // Ningun literal numerico de longitud: los unicos numeros legitimos vienen de
      // `CREDENTIAL_MIN_LENGTH` / `CREDENTIAL_MAX_LENGTH`, importados, nunca copiados.
      // El digito tiene que ser un TOKEN numerico suelto, no parte de un identificador
      // como `CheckCircle2` (un icono de lucide-react, no un umbral de longitud).
      expect(sinClases, `${path} contiene un literal numerico suelto`).not.toMatch(
        /(?<![A-Za-z0-9_$])\d+(?![A-Za-z0-9_$])/,
      );

      // Ninguna expresion regular de composicion (p. ej. `/[A-Z]/`, `/\d/`, `/[^a-zA-Z0-9]/`):
      // el estado de una regla se deriva siempre de `evaluateCredentialRules`, nunca de un
      // patron propio.
      expect(sinComentarios, `${path} contiene una regex de composicion`).not.toMatch(/\/\[[^\]]*\]\//);
      expect(sinComentarios, `${path} contiene una regex de digito`).not.toMatch(/\\d/);
      expect(sinComentarios, `${path} contiene RegExp`).not.toMatch(/RegExp\s*\(/);
    }
  });
});

// --- R6 / R14 — sin servidor, sin composicion, sin adaptador ------------------------

describe('credential-help-contract — sin servidor ni composicion (R6, R14)', () => {
  it('no importa composicion, adaptadores ni servidor, y no declara Server Actions', () => {
    const PROHIBIDOS = ["@/lib/composition", "adapters/driven", "next/headers", "'use server'"];

    for (const { path, source } of NEW_FILES) {
      for (const prohibido of PROHIBIDOS) {
        expect(source, `${path} contiene "${prohibido}"`).not.toContain(prohibido);
      }
    }
  });
});

// --- R19 — nada bajo app/, db/ ni lib/, ni migraciones nuevas ----------------------

/**
 * Rutas (POSIX, relativas a la raiz del repo) que ESTA rama anade o modifica desde que
 * diverge de `origin/dev`. Se calcula contra el punto de divergencia real
 * (`git merge-base HEAD origin/dev`), no contra la punta de `origin/dev`: otra feature
 * ya puede haberse fusionado a `dev` despues de que esta rama arrancara, y diferenciar
 * contra la punta mezclaria cambios ajenos con los de esta feature. Se combinan los
 * cambios ya trackeados (`git diff --name-only <merge-base>`) con los archivos nuevos
 * todavia sin commitear (`git status --porcelain`), porque esta feature se verifica
 * antes de su propio commit.
 */
function changedFilesSinceDevDiverged(): readonly string[] {
  let mergeBase: string;
  try {
    mergeBase = execFileSync('git', ['merge-base', 'HEAD', 'origin/dev'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    throw new Error(`no se pudo calcular el punto de divergencia con origin/dev: ${String(error)}`);
  }

  let tracked: string;
  let statusPorcelain: string;
  try {
    tracked = execFileSync('git', ['diff', '--name-only', mergeBase], { cwd: repoRoot, encoding: 'utf8' });
    statusPorcelain = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(`no se pudo obtener el diff de la rama contra origin/dev: ${String(error)}`);
  }

  const trackedFiles = tracked
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const untrackedFiles = statusPorcelain
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim())
    .filter((line) => line.length > 0);

  return [...new Set([...trackedFiles, ...untrackedFiles])];
}

describe('credential-help-contract — sin rutas, paginas, acciones ni migraciones nuevas (R19)', () => {
  it('la feature no anade rutas, paginas, acciones ni migraciones', () => {
    // Un diff vacio es un estado LEGITIMO (esta rama ya se fusiono a `dev`, asi que
    // `merge-base` coincide con la punta y no queda nada por diferenciar): no puede teñir
    // el gate de rojo. Por eso ya no se exige `cambios.length > 0` aqui; en su lugar, el
    // assert de abajo sobre `NEW_FILES` garantiza que el bloque sigue teniendo algo real
    // que verificar tanto en la rama como despues del merge.
    const cambios = changedFilesSinceDevDiverged();

    const bajoRutaProhibida = cambios.filter(
      (file) => file.startsWith('app/') || file.startsWith('db/') || file.startsWith('lib/'),
    );
    expect(bajoRutaProhibida, 'esta rama toco app/, db/ o lib/').toEqual([]);

    // Ancla que no depende del estado de git: los tres archivos de esta feature existen de
    // verdad (fuente no vacia) y ninguno vive bajo app/, db/ ni lib/.
    for (const { path, source } of NEW_FILES) {
      expect(source.trim().length, `${path} esta vacio`).toBeGreaterThan(0);
      expect(
        path.startsWith('app/') || path.startsWith('db/') || path.startsWith('lib/'),
        `${path} vive bajo una ruta prohibida`,
      ).toBe(false);
    }
  });
});

// --- R21 — sin console.* -------------------------------------------------------------

describe('credential-help-contract — sin console (R21)', () => {
  it('ningun archivo nuevo usa console', () => {
    for (const { path, source } of NEW_FILES) {
      expect(source, `${path} usa console.*`).not.toMatch(/console\./);
    }
  });
});

// --- R22 — ningun identificador nombra la contrasena sin terminar en hash ----------

describe('credential-help-contract — ningun identificador nombra la contrasena en claro (R22)', () => {
  it('ningun identificador nuevo nombra la contrasena sin acabar en hash', () => {
    for (const { path, source } of NEW_FILES) {
      const hallazgos = findPlaintextPasswordDeclarations(path, source);
      expect(hallazgos, `${path}: ${hallazgos.join(', ')}`).toEqual([]);
    }
  });

  it('el centinela muerde: detecta un prop password declarado a proposito', () => {
    const fuenteDePrueba = 'type Props = { password: string };\nfunction Component({ password }: Props) {}';
    expect(findPlaintextPasswordDeclarations('archivo-de-prueba.tsx', fuenteDePrueba)).toContain('password');
  });
});
