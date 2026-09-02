// QC-21 — T6: centinelas de TEXTO sobre los tres archivos nuevos de `components/shared/`.
//
// Al estilo de `tests/unit/identity/credential-policy-contract.test.ts`: se vigila lo que los
// archivos DECLARAN, no lo que hacen en tiempo de ejecucion. Cubre R2, R6, R14, R19, R21, R22.

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
//
// R19 se verifica sobre el CONTENIDO de los tres artefactos que esta feature declara
// (`NEW_FILES`), no sobre el diff de git. A PROPOSITO no se lee `git` ni se barre `app/`,
// `db/` ni `lib/`: cualquiera de las dos cosas haria que este test dependiera del estado
// de la rama que lo ejecute, y en cuanto esta feature se fusione a `dev` el test se
// pondria rojo por archivos ajenos que otra feature futura (QC-32, QC-36, cualquier
// ficha de backend) toque bajo esas carpetas — el mismo patron que ya costo bloqueantes
// en QC-6, QC-14 y QC-19. Version anterior de este bloque, con ese defecto: revision
// B1 de `progress/review_QC-21-ayuda-visual-de-contrasena.md`.
//
// TAMPOCO se afirma el censo de `components/shared/` (p. ej. "esta carpeta contiene
// exactamente estos tres archivos"): esa carpeta es un recurso COMPARTIDO — QC-29 esta
// añadiendo `theme-provider.tsx` ahi mismo en paralelo — y un assert de censo se
// romperia en su gate por un archivo que no es de esta feature.
//
// LIMITE, dicho en voz alta: `NEW_FILES` esta enumerada a mano. Si alguien añadiera un
// septimo archivo a esta feature sin sumarlo a `NEW_FILES`, este bloque no lo veria. Es
// el precio de no depender de estado compartido (git o el arbol de `components/shared/`)
// y no una garantia que este bloque no da.

describe('credential-help-contract — sin rutas, paginas, acciones ni migraciones nuevas (R19)', () => {
  it('la feature no anade rutas, paginas, acciones ni migraciones', () => {
    for (const { path, source } of NEW_FILES) {
      const sinComentarios = stripComments(source);

      // Ninguna Server Action. R6 ya lo cubre por import; aqui se repite a proposito
      // porque R19 lo exige por su cuenta ("NO DEBE crear... Server Action").
      expect(sinComentarios, `${path} declara 'use server'`).not.toMatch(/['"]use server['"]/);

      // Ningun route handler de App Router (con o sin `async`).
      expect(sinComentarios, `${path} exporta un route handler`).not.toMatch(
        /export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/,
      );

      // Ninguna pagina ni layout de App Router.
      expect(sinComentarios, `${path} tiene un export default`).not.toMatch(/export\s+default\b/);
      expect(sinComentarios, `${path} exporta metadata`).not.toMatch(/export\s+const\s+metadata\b/);
      expect(sinComentarios, `${path} exporta generateMetadata`).not.toMatch(/generateMetadata\s*\(/);
      expect(sinComentarios, `${path} exporta generateStaticParams`).not.toMatch(
        /generateStaticParams\s*\(/,
      );
      expect(sinComentarios, `${path} exporta una config de ruta`).not.toMatch(
        /export\s+const\s+(?:dynamic|revalidate|runtime|fetchCache)\b/,
      );

      // Ninguna persistencia: sin Prisma, sin acceso directo a `@/db`, sin SQL de tabla.
      expect(sinComentarios, `${path} importa @prisma/client`).not.toMatch(/@prisma\/client/);
      expect(sinComentarios, `${path} usa PrismaClient`).not.toMatch(/PrismaClient/);
      expect(sinComentarios, `${path} importa de @/db`).not.toMatch(/from\s+['"]@\/db/);
      expect(sinComentarios, `${path} contiene CREATE TABLE`).not.toMatch(/CREATE\s+TABLE/i);
      expect(sinComentarios, `${path} contiene ALTER TABLE`).not.toMatch(/ALTER\s+TABLE/i);
      expect(sinComentarios, `${path} declara un model de Prisma`).not.toMatch(/\bmodel\s+\w+\s*\{/);

      // El unico modulo del repo del que se importa es el barrel `@/lib/modules/identity`
      // (mas `@/components/ui/*` y rutas relativas `./credential-*`): nada que alcance
      // dentro de `lib/` por ruta profunda, ni `@/app/`, ni `@/db`, ni `@/scripts`.
      const especificadores = [...sinComentarios.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
        (match) => match[1] as string,
      );
      const prohibidos = especificadores.filter((especificador) => {
        if (especificador.startsWith('@/app/')) return true;
        if (especificador.startsWith('@/db')) return true;
        if (especificador.startsWith('@/scripts')) return true;
        if (especificador.startsWith('@/lib/') && especificador !== '@/lib/modules/identity') return true;
        return false;
      });
      expect(prohibidos, `${path} importa de una ruta prohibida`).toEqual([]);
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

  // Punto ciego de `findPlaintextPasswordDeclarations` (m-1 de la review): su regex de
  // declaracion exige `:` o `=` pegado al identificador, y una propiedad OPCIONAL
  // (`nombre?: Tipo`) rompe esa adyacencia porque el `?` se interpone. Todas las props de
  // esta feature se declaran con esa forma (`readonly breachedState?: ...`), asi que el
  // punto ciego cae justo donde mas pesa. Esto NO reemplaza a la guardia compartida: solo
  // TAPA el punto ciego para los tres archivos de QC-21. El defecto es de
  // `guard-password-never-plaintext` y ampliar su regex es trabajo de `/afinar-regla`
  // (anotado como deuda por el leader en `progress/current.md`), no de esta ficha.
  const OPTIONAL_PROPERTY_PATTERN = /(?:^|[{,;(])\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\?\s*:/gm;

  function declaredOptionalProperties(source: string): readonly string[] {
    const sinComentarios = stripComments(source);
    return [...sinComentarios.matchAll(OPTIONAL_PROPERTY_PATTERN)].map((match) => match[1] as string);
  }

  function isPlaintextPasswordName(identifier: string): boolean {
    const lower = identifier.toLowerCase();
    // Los MISMOS segmentos que declara la guardia compartida (`FORBIDDEN_SEGMENTS` en
    // `guard-password-never-plaintext.test.ts:60`), con la `ñ` incluida. Lo que aqui se
    // replica es el VOCABULARIO, no el criterio de deteccion: el criterio se hereda
    // importando `findPlaintextPasswordDeclarations`, y este centinela solo cubre la forma
    // (`nombre?:`) que ese criterio no ve.
    const segmentosProhibidos = ['password', 'pass', 'contrasena', 'contraseña'];
    const nombraLaCredencial = segmentosProhibidos.some((segmento) => lower.includes(segmento));
    if (!nombraLaCredencial) return false;
    return !lower.endsWith('hash');
  }

  it('ninguna propiedad opcional nueva nombra la contrasena sin acabar en hash', () => {
    for (const { path, source } of NEW_FILES) {
      const opcionales = declaredOptionalProperties(source);
      const hallazgos = opcionales.filter(isPlaintextPasswordName);
      expect(hallazgos, `${path}: ${hallazgos.join(', ')}`).toEqual([]);
    }
  });

  it('el centinela de opcionales muerde: detecta un prop password opcional', () => {
    const fuenteDePrueba = 'type Props = { readonly password?: string };';

    expect(declaredOptionalProperties(fuenteDePrueba).filter(isPlaintextPasswordName)).toContain(
      'password',
    );

    // Documenta el punto ciego de forma ejecutable, no en prosa: el centinela de la
    // guardia compartida NO ve esta misma declaracion.
    expect(findPlaintextPasswordDeclarations('archivo-de-prueba.tsx', fuenteDePrueba)).not.toContain(
      'password',
    );
  });
});
