// T7 — Guardia: nadie produce un hash de contrasena sin evaluar la politica (R18, R19),
// mas las propiedades ESTATICAS del modulo de la politica (R12, R14, R24).
//
// Recorre el ARBOL DE ARCHIVOS de `lib/`, `app/` y `scripts/`, no el grafo de imports:
// un script suelto que nadie importa tambien puede fijar una contrasena, y ningun test
// unitario lo veria. Por eso vive en `tests/guards/` y entra en `pnpm run test:guardias`.
//
// LO QUE ESTA GUARDIA NO DEMUESTRA, dicho aqui y no descubierto en la review
// (`design.md > 7`): que la llamada a la politica ocurra ANTES del hash, ni que se
// respete su resultado. Eso es orden y control de flujo, y un barrido de texto no lo ve;
// lo cubre el test de comportamiento del punto que fija la contrasena
// (`tests/unit/identity/seed/seed-initial-access.test.ts`, caso 8b). La guardia atrapa el
// olvido completo, que es el fallo realista.
//
// Cada regla se autocomprueba sobre un fuente SINTETICO que la viola, igual que
// `guard-password-hash-module`: un `expect(...).toEqual([])` sobre archivos que ya
// cumplen no demuestra que la guardia muerda (`docs/verification.md > Probar que muerde`).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Carpetas barridas: todo lo que puede fijar o cambiar una contrasena (R19). */
const SCANNED_DIRS = ['lib', 'app', 'scripts'] as const;

/** Artefactos generados y dependencias: no son codigo de este repo. */
const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees']);

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs']);

function listFiles(dir: string): readonly string[] {
  let entries: readonly string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return IGNORED_DIRS.has(entry) ? [] : listFiles(full);
    }
    return SCANNED_EXTENSIONS.has(extname(entry)) ? [full] : [];
  });
}

/** Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** Ruta comparable: separadores POSIX, para casar la allowlist venga la ruta como venga. */
function toPosixPath(file: string): string {
  return file.split(sep).join('/').split('\\').join('/');
}

/**
 * Exenciones EXPLICITAS y POR RUTA EXACTA (`design.md > 7`), misma forma que la allowlist
 * de `guard-password-never-plaintext`: el mismo contenido en otra ruta sigue siendo un
 * hallazgo. No hay exencion "por nombre de archivo" ni por patron.
 */
const HASH_WITHOUT_POLICY_ALLOWLIST: readonly string[] = [
  // Es el hasher: implementa el puerto, no fija ninguna contrasena.
  'lib/modules/identity/adapters/driven/security/password-hash.ts',
  // Punto unico de composicion: cablea AMBOS, el hasher y la politica.
  'lib/composition/index.ts',
  // Verifica, no fija: el login NO debe evaluar la politica (R17).
  'lib/modules/identity/domain/verify-credentials.ts',
];

function isAllowlisted(file: string): boolean {
  const posix = toPosixPath(file);
  return HASH_WITHOUT_POLICY_ALLOWLIST.some(
    (allowed) => posix === allowed || posix.endsWith(`/${allowed}`),
  );
}

/**
 * USO que produce un hash de contrasena. Marca la LLAMADA, no la declaracion, y ese
 * matiz es deliberado:
 *
 * `lib/modules/identity/ports/password-hasher.ts` declara `hash(plaintext: string):
 * Promise<string>` y `ports/initial-access-credentials.ts` nombra el tipo en su
 * documentacion. Ninguno de los dos produce un hash: una declaracion de puerto describe
 * lo que alguien podra pedir, no lo pide. Exigirles referenciar la politica seria pedir
 * que un contrato conozca a otro, justo lo contrario de lo que el puerto existe para
 * evitar. Por eso el detector busca `<algo>.hash(` o `createPasswordHash(`, que son
 * invocaciones, y la exencion por ruta cubre los pocos sitios que invocan sin fijar.
 */
export function findHashProductions(source: string): readonly string[] {
  const code = stripComments(source);
  return [
    ...[...code.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*hash\s*\(/g)].map(
      (match) => `${match[1] as string}.hash(`,
    ),
    ...[...code.matchAll(/\bcreatePasswordHash\s*\(/g)].map(() => 'createPasswordHash('),
  ];
}

/** Referencias a la evaluacion de la politica que satisfacen R18 en el mismo archivo. */
export function findPolicyReferences(source: string): readonly string[] {
  return [
    ...stripComments(source).matchAll(/\b(checkCredentialPolicy|evaluateCredentialRules)\b/g),
  ].map((match) => match[1] as string);
}

/**
 * Hallazgo de R18/R19: el archivo produce un hash, no esta exento por ruta y NO
 * referencia la politica en ninguna parte. Devuelve los usos que lo delatan.
 */
export function findHashWithoutPolicy(file: string, content: string): readonly string[] {
  if (isAllowlisted(file)) return [];
  const producciones = findHashProductions(content);
  if (producciones.length === 0) return [];
  if (findPolicyReferences(content).length > 0) return [];
  return [...new Set(producciones)];
}

/** Canales por los que el modulo podria filtrar la candidata (R24). */
export function findOutputChannels(source: string): readonly string[] {
  return [
    ...stripComments(source).matchAll(/\b(console\s*\.\s*\w+|process\s*\.\s*std(?:out|err))\b/g),
  ].map((match) => (match[1] as string).replace(/\s+/g, ''));
}

/**
 * Reloj y azar (R12): la evaluacion depende SOLO de la candidata y de la lista. Un
 * `Date.now()` o un `Math.random()` en el dominio de la politica romperia que dos
 * evaluaciones de la misma candidata devuelvan lo mismo.
 */
export function findClockOrRandomUses(source: string): readonly string[] {
  return [
    ...stripComments(source).matchAll(/\b(new\s+Date|Date\s*\.\s*\w+|Math\s*\.\s*random)\b/g),
  ].map((match) => (match[1] as string).replace(/\s+/g, ' '));
}

/**
 * La libreria de la lista (R14): el dominio pide por el puerto y no sabe que hay detras.
 * Solo el adaptador driven puede nombrarla.
 */
export function findBreachedLibraryImports(source: string): readonly string[] {
  return [...stripComments(source).matchAll(/'(@zxcvbn-ts\/[^']+)'|"(@zxcvbn-ts\/[^"]+)"/g)].map(
    (match) => (match[1] ?? match[2]) as string,
  );
}

const scannedFiles = SCANNED_DIRS.flatMap((dir) => listFiles(join(repoRoot, dir)));

function rutaRelativa(file: string): string {
  return relative(repoRoot, file).split(sep).join('/');
}

const POLICY_DOMAIN_FILE = join(
  repoRoot,
  'lib/modules/identity/domain/credential-policy.ts'.split('/').join(sep),
);
const BREACHED_ADAPTER_FILE = join(
  repoRoot,
  'lib/modules/identity/adapters/driven/security/breached-credential-list.ts'.split('/').join(sep),
);
const policySource = readFileSync(POLICY_DOMAIN_FILE, 'utf8');
const breachedAdapterSource = readFileSync(BREACHED_ADAPTER_FILE, 'utf8');

/** Archivos de cualquier `domain/` del repo, que es donde R14 prohibe la libreria. */
const domainFiles = scannedFiles.filter((file) => toPosixPath(file).includes('/domain/'));

describe('guardia — politica de contrasenas', () => {
  it('todo archivo que produce un hash referencia tambien la politica', () => {
    expect(scannedFiles.length, 'el barrido no encontro ningun archivo que revisar').toBeGreaterThan(
      0,
    );

    // Primero: que el barrido SI ve los sitios que producen hash. Sin esto, un detector
    // roto que no encuentra nada dejaria la guardia en verde para siempre.
    const productores = scannedFiles.filter(
      (file) => findHashProductions(readFileSync(file, 'utf8')).length > 0,
    );
    expect(productores.length, 'el detector no encontro ningun productor de hash').toBeGreaterThan(
      0,
    );

    const hallazgos = scannedFiles.flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return findHashWithoutPolicy(file, content).map((uso) => `${rutaRelativa(file)}: ${uso}`);
    });

    expect(hallazgos).toEqual([]);
  });

  it('la regla detecta un archivo sintetico que hashea sin evaluar la politica', () => {
    const seedMalo = [
      "import { identity } from '@/lib/composition'",
      'export async function altaDeUsuario(candidate: string) {',
      '  const stored = await identity.passwordHasher.hash(candidate)',
      '  return stored',
      '}',
    ].join('\n');
    expect(findHashWithoutPolicy('scripts/alta.ts', seedMalo)).toEqual(['passwordHasher.hash(']);

    const adaptadorMalo = "const stored = await createPasswordHash(candidate)";
    expect(findHashWithoutPolicy('lib/modules/otro/adapters/driven/alta.ts', adaptadorMalo)).toEqual(
      ['createPasswordHash('],
    );

    // El mismo archivo que SI llama a la politica no es hallazgo.
    const seedBueno = [
      'const veredicto = await checkCredentialPolicy(candidate)',
      "if (!veredicto.ok) throw new Error('no cumple')",
      'const stored = await identity.passwordHasher.hash(candidate)',
    ].join('\n');
    expect(findHashWithoutPolicy('scripts/alta.ts', seedBueno)).toEqual([]);

    // Y la version sincrona del dominio tambien vale como referencia a la politica.
    const conLaFuncionPura = [
      'const veredicto = evaluateCredentialRules(candidate)',
      "if (!veredicto.ok) throw new Error('no cumple')",
      'const stored = await hasher.hash(candidate)',
    ].join('\n');
    expect(findHashWithoutPolicy('scripts/alta.ts', conLaFuncionPura)).toEqual([]);

    // Un COMENTARIO que prometa la politica no la ejecuta: sigue siendo hallazgo.
    const soloComentario = [
      '// aqui habria que llamar a checkCredentialPolicy antes de hashear',
      'const stored = await hasher.hash(candidate)',
    ].join('\n');
    expect(findHashWithoutPolicy('scripts/alta.ts', soloComentario)).toEqual(['hasher.hash(']);

    // Y un archivo que no produce ningun hash no exige nada.
    expect(findHashWithoutPolicy('scripts/otra-cosa.ts', 'export const x = 1')).toEqual([]);
  });

  it('la exencion es por ruta exacta: el mismo archivo en otra ruta sigue siendo hallazgo', () => {
    const contenidoDelHasher = [
      "import { hash } from 'bcryptjs'",
      'export async function createPasswordHash(plaintext: string): Promise<string> {',
      '  return hash(plaintext, 10)',
      '}',
      'export const alias = { run: () => createPasswordHash("x") }',
    ].join('\n');

    // En su ruta real: exento.
    expect(
      findHashWithoutPolicy(
        'lib/modules/identity/adapters/driven/security/password-hash.ts',
        contenidoDelHasher,
      ),
    ).toEqual([]);

    // Copiado a otra ruta: hallazgo, aunque el nombre de archivo sea el mismo.
    expect(findHashWithoutPolicy('lib/otro/sitio/password-hash.ts', contenidoDelHasher)).toEqual([
      'createPasswordHash(',
    ]);

    // Las otras dos exenciones se comportan igual.
    const usoDeLaPolitica = 'const stored = await passwordHasher.hash(candidate)';
    expect(findHashWithoutPolicy('lib/composition/index.ts', usoDeLaPolitica)).toEqual([]);
    expect(findHashWithoutPolicy('lib/composition/otro.ts', usoDeLaPolitica)).toEqual([
      'passwordHasher.hash(',
    ]);
    expect(
      findHashWithoutPolicy('lib/modules/identity/domain/verify-credentials.ts', usoDeLaPolitica),
    ).toEqual([]);
    expect(
      findHashWithoutPolicy('lib/modules/otro/domain/verify-credentials.ts', usoDeLaPolitica),
    ).toEqual(['passwordHasher.hash(']);
  });

  it('el modulo de la politica no escribe en ningun canal de salida', () => {
    expect(policySource.length, 'el dominio de la politica no se pudo leer').toBeGreaterThan(0);
    expect(breachedAdapterSource.length, 'el adaptador no se pudo leer').toBeGreaterThan(0);

    expect(findOutputChannels(policySource)).toEqual([]);
    expect(findOutputChannels(breachedAdapterSource)).toEqual([]);
  });

  it('la regla de canales de salida detecta un console y una escritura directa a stdout', () => {
    expect(findOutputChannels('console.log(candidate)')).toEqual(['console.log']);
    expect(findOutputChannels('console . error(candidate)')).toEqual(['console.error']);
    expect(findOutputChannels('process.stdout.write(candidate)')).toEqual(['process.stdout']);
    expect(findOutputChannels('process.stderr.write(unmet.join(","))')).toEqual(['process.stderr']);
    expect(findOutputChannels('// console.log(candidate)')).toEqual([]);
  });

  it('el dominio de la politica no usa Date ni Math.random', () => {
    expect(findClockOrRandomUses(policySource)).toEqual([]);
  });

  it('la regla de reloj y azar detecta cada forma', () => {
    expect(findClockOrRandomUses('const ahora = new Date()')).toEqual(['new Date']);
    expect(findClockOrRandomUses('const ahora = Date.now()')).toEqual(['Date.now']);
    expect(findClockOrRandomUses('if (Math.random() > 0.5) return ok')).toEqual(['Math.random']);
    // Un comentario que las mencione no las usa.
    expect(findClockOrRandomUses('// sin Date.now ni Math.random: R12')).toEqual([]);
    // Y no marca lo que si es puro.
    expect(findClockOrRandomUses('return /\\p{Lu}/u.test(candidate)')).toEqual([]);
  });

  it('ningun archivo de domain/ importa la libreria de la lista', () => {
    expect(domainFiles.length, 'el barrido no encontro ningun archivo de domain/').toBeGreaterThan(
      0,
    );

    const hallazgos = domainFiles.flatMap((file) =>
      findBreachedLibraryImports(readFileSync(file, 'utf8')).map(
        (paquete) => `${rutaRelativa(file)}: ${paquete}`,
      ),
    );
    expect(hallazgos).toEqual([]);

    // Y el adaptador SI la importa: si dejara de hacerlo, la lista real no vendria de
    // ninguna parte y el barrido de arriba seguiria en verde por vacio.
    expect(findBreachedLibraryImports(breachedAdapterSource).length).toBeGreaterThan(0);
  });

  it('la regla de la libreria detecta un import en el dominio', () => {
    const dominioMalo = "import { dictionary } from '@zxcvbn-ts/language-common'";
    expect(findBreachedLibraryImports(dominioMalo)).toEqual(['@zxcvbn-ts/language-common']);
    expect(findBreachedLibraryImports('const x = await import("@zxcvbn-ts/core")')).toEqual([
      '@zxcvbn-ts/core',
    ]);
    // Un comentario que nombre la libreria no la importa.
    expect(findBreachedLibraryImports("// la lista viene de '@zxcvbn-ts/language-common'")).toEqual(
      [],
    );
  });
});
