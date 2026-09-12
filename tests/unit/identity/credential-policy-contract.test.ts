// QC-19 — T4: el contrato de la politica y lo que esta feature NO trae.
//
// Centinelas de TEXTO, al estilo de `tests/unit/identity/schema/identity-schema.test.ts`:
// lo que se vigila aqui es la DECLARACION (que exporta el contrato, que hay en el schema,
// quien referencia la politica), no el comportamiento — ese es `credential-policy.test.ts`.
//
// Cubre R11 (segunda mitad), R16, R20, R21, R22, R23.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CREDENTIAL_MAX_LENGTH,
  CREDENTIAL_MIN_LENGTH,
  CREDENTIAL_RULES,
  createCredentialPolicy,
  evaluateCredentialRules,
} from '@/lib/modules/identity';

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

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '.worktrees']);
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs']);

/** Todos los archivos de codigo bajo `dir`, recursivo. Ruta POSIX relativa a la raiz. */
function listFiles(dir: string): readonly string[] {
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = readdirSync(join(repoRoot, dir), { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.isDirectory()) {
      return IGNORED_DIRS.has(entry.name) ? [] : listFiles(`${dir}/${entry.name}`);
    }
    return SCANNED_EXTENSIONS.has(extname(entry.name)) ? [`${dir}/${entry.name}`] : [];
  });
}

const policySource = read('lib', 'modules', 'identity', 'domain', 'credential-policy.ts');
const contractSource = read('lib', 'modules', 'identity', 'index.ts');
const rawSchema = read('db', 'schema.prisma');

/** El schema sin comentarios: aqui se vigila lo DECLARADO, no lo explicado. */
const schemaDeclarations = rawSchema
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

// --- R11 (segunda mitad) — el maximo no se reinventa -------------------------------

describe('QC-19 — el maximo de credencial se reutiliza (R11)', () => {
  it('el maximo es la constante de credentials.ts, no un literal nuevo', () => {
    expect(policySource).toMatch(
      /import\s*\{\s*CREDENTIAL_MAX_LENGTH\s*\}\s*from\s*'\.\/credentials'/,
    );
    // Ni un `64` suelto en todo el archivo: el maximo tiene un solo dueno (feature 5).
    expect(policySource.replace(/\/\/.*$/gm, '')).not.toMatch(/\b64\b/);
    expect(CREDENTIAL_MAX_LENGTH).toBe(64);
    // Y el minimo si es de esta ficha, declarado aqui y no heredado de nadie.
    expect(policySource).toMatch(/export const CREDENTIAL_MIN_LENGTH = 8/);
    expect(CREDENTIAL_MIN_LENGTH).toBe(8);
  });
});

// --- R16 — la politica vive en el dominio y se expone por el contrato ---------------

describe('QC-19 — la politica se expone por el contrato del modulo (R16)', () => {
  it('el contrato del modulo exporta la politica y el catalogo', () => {
    for (const exportado of [
      'CREDENTIAL_MIN_LENGTH',
      'CREDENTIAL_RULES',
      'createCredentialPolicy',
      'evaluateCredentialRules',
      'CredentialPolicyResult',
      'CredentialRule',
    ]) {
      expect(contractSource, `el contrato no exporta ${exportado}`).toContain(exportado);
    }
    // Y lo hace SOLO desde `./domain/credential-policy`: el contrato no reexporta puertos
    // ni adaptadores (`docs/architecture.md > Modulos`).
    expect(contractSource).toMatch(/from\s*'\.\/domain\/credential-policy'/);
    for (const especificador of [...contractSource.matchAll(/from\s*'([^']+)'/g)].map((m) => m[1])) {
      expect(especificador, `el contrato importa de ${especificador}`).toMatch(/^\.\/domain\//);
    }
    expect(contractSource).not.toContain('breached-credential-list');

    // No es solo texto: los cuatro simbolos existen de verdad en el contrato.
    expect(typeof evaluateCredentialRules).toBe('function');
    expect(typeof createCredentialPolicy).toBe('function');
    expect(CREDENTIAL_RULES.length).toBeGreaterThan(0);

    // Ningun otro punto del repo declara su propia copia de las reglas.
    const otrosCatalogos = [...listFiles('lib'), ...listFiles('app'), ...listFiles('scripts')]
      .filter((file) => !file.endsWith('lib/modules/identity/domain/credential-policy.ts'))
      .filter((file) => /const\s+CREDENTIAL_RULES\b|CREDENTIAL_MIN_LENGTH\s*=/.test(read(...file.split('/'))));
    expect(otrosCatalogos).toEqual([]);
  });
});

// --- R20 — sin historial, ni en la firma ni en la base -----------------------------

describe('QC-19 — la politica no conoce contrasenas anteriores (R20)', () => {
  it('la politica no recibe historial: su unica entrada es la candidata', () => {
    // Una sola entrada, y es la candidata: no hay parametro por donde colar un historial.
    expect(evaluateCredentialRules).toHaveLength(1);
    expect(createCredentialPolicy({ breached: { includes: () => Promise.resolve(false) } })).toHaveLength(1);

    // `deps` tiene exactamente una clave, la lista de filtradas.
    expect(policySource).toMatch(/deps:\s*\{\s*readonly breached: BreachedCredentialList;?\s*\}/);
    // Y en el codigo (sin comentarios) no hay ni rastro de historial de credenciales.
    const policyCode = policySource
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(policyCode).not.toMatch(/histor|previous|anterior/i);
  });

  it('no existe tabla ni columna de contrasenas anteriores en db/schema.prisma', () => {
    // ACOTADO EL 2026-09-02 POR QC-24 (`specs/QC-24-modelo-recetas/`). Este caso enumeraba
    // los modelos del esquema ENTERO y exigia que fueran exactamente los cinco que habia el
    // dia que se escribio. Eso no es lo que R20 pide —R20 dice que no debe existir
    // ALMACENAMIENTO DE CONTRASENAS ANTERIORES— y convertia en rojo a cualquier feature
    // posterior que anadiera un modelo por motivos que no tienen nada que ver con la
    // politica de contrasenas: QC-24 anadio `Recipe` y `RecipeLine`, que son del modulo
    // `recetas`. Un test que se rompe cuando llega la feature siguiente estaba midiendo el
    // repo, no su feature. Se acota a lo que R20 si vigila —que ningun modelo del esquema
    // sea un historial de contrasenas, y que los tres modelos de `identity` sigan ahi— y se
    // conservan intactas las dos aserciones de abajo, que son las que de verdad cierran R20.
    const modelos = [...rawSchema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);

    // Los tres modelos de `identity` siguen existiendo: esta feature no los toco.
    for (const modelo of ['DocumentType', 'Role', 'User']) {
      expect(modelos, `el modelo ${modelo} no debe desaparecer`).toContain(modelo);
    }
    // Y ninguno de los que hay —los de `identity` o los de cualquier otro modulo— es un
    // almacen de contrasenas anteriores.
    for (const modelo of modelos) {
      expect(modelo, `el modelo ${modelo} no debe ser un historial de contrasenas`).not.toMatch(
        /histor|previous|anterior|old.?password|password.?history/i,
      );
    }

    // Sobre lo DECLARADO, no sobre lo explicado: se usa `schemaDeclarations`, que es lo que
    // este mismo archivo define para eso («aqui se vigila lo DECLARADO, no lo explicado»).
    // Antes barria `rawSchema`, con los comentarios dentro, y eso hacia que la PROSA de
    // cualquier feature pudiera romperlo: QC-24 documenta que una linea de receta «no es un
    // hecho historico» y la palabra «historico» bastaba para el rojo. Un comentario no crea
    // ninguna tabla ni ninguna columna, asi que ignorarlo es exacto, no permisivo — y R20
    // habla de que no exista ALMACENAMIENTO, que es declaracion. Acotado el 2026-09-02 por
    // QC-24 por el mismo motivo que los dos casos de arriba.
    expect(schemaDeclarations).not.toMatch(/histor|previous|anterior|old_password|password_history/i);
    // El unico rastro de contrasena en el schema sigue siendo el hash vigente.
    expect([...schemaDeclarations.matchAll(/password\w*/gi)].map((match) => match[0].toLowerCase())).toEqual([
      'passwordhash',
      'password_hash',
    ]);
  });
});

// --- R21 — sin migraciones ni columnas nuevas --------------------------------------

describe('QC-19 — esta feature no toca la persistencia (R21)', () => {
  it('esta feature no anade migraciones ni columnas', () => {
    const migrationsDir = join(repoRoot, 'db', 'migrations');
    const directorios = readdirSync(migrationsDir)
      .filter((entry) => statSync(join(migrationsDir, entry)).isDirectory())
      .sort();

    // ACOTADO EL 2026-09-02 POR QC-24 (`specs/QC-24-modelo-recetas/`). Aqui habia una
    // igualdad contra la lista cerrada de las cuatro migraciones que existian el dia en que
    // se escribio el test. Eso afirma el censo del repo ENTERO y para siempre, no lo que
    // R21 pide —«ESTA feature no debe anadir tablas, columnas, indices ni migraciones»—:
    // se ponia en rojo en cuanto cualquier otra feature anadia una migracion legitima, que
    // es lo que hizo QC-24 con `20260902163256_recipes_and_recipe_lines` (dos tablas del
    // modulo `recetas`, nada que ver con la politica de credenciales). Se acota a lo que R21
    // vigila SOBRE QC-19: que las cuatro migraciones anteriores sigan ahi sin reescribir, y
    // que ninguna migracion del repo introduzca persistencia de politica de credenciales o
    // de contrasenas anteriores. La asercion de abajo sobre las columnas de `User` —el
    // modelo que QC-19 habria tocado si tocara alguno— se conserva intacta y es la que de
    // verdad cierra R21.
    const PREVIAS_A_QC19 = [
      '20260806122638_users_and_roles',
      '20260901220609_user_login_lockout',
      '20260902005510_products_and_presentations',
      '20260902132253_user_must_change_credential',
    ];
    for (const previa of PREVIAS_A_QC19) {
      expect(directorios, `QC-19 no puede quitar ni renombrar ${previa}`).toContain(previa);
    }

    // Ninguna migracion, ni las de antes ni las que vengan, se llama como esta feature ni
    // guarda contrasenas anteriores: si QC-19 hubiera anadido persistencia, aqui estaria.
    for (const directorio of directorios) {
      expect(directorio, `${directorio} no debe ser una migracion de la politica`).not.toMatch(
        /credential.?polic|password.?polic|password.?history|old.?password/i,
      );
      const sql = readFileSync(join(migrationsDir, directorio, 'migration.sql'), 'utf8');
      expect(sql, `${directorio} no debe crear almacenamiento de contrasenas anteriores`).not.toMatch(
        /password_history|old_password|previous_password/i,
      );
    }

    // Y el modelo User conserva exactamente sus columnas: la politica es regla, no dato.
    const cuerpo = /^model\s+User\s*\{([\s\S]*?)^\}/m.exec(rawSchema)?.[1] ?? '';
    const campos = cuerpo
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('@@') && !line.startsWith('///'))
      .map((line) => /^(\w+)\s+\S+/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined)
      .sort();
    expect(campos).toEqual(
      [
        'id',
        'firstNames',
        'lastNames',
        'birthDate',
        'email',
        'phone',
        'documentTypeCode',
        'documentNumber',
        'username',
        'passwordHash',
        'roleId',
        // RETENSADO 2026-09-04 (QC-47). El censo NO se afloja: sigue siendo una igualdad
        // EXACTA, y por eso hubo que nombrar los dos campos que QC-47 anade -la columna
        // `companyId` (R9, `users.company_id` NOT NULL) y su campo de relacion `company`-.
        // `roleId` y `role` siguen en la lista porque QC-47 R13 los deja INTACTOS: si
        // alguien los moviera a otra tabla, este caso caeria, que es justo lo que R13 pide.
        'companyId',
        'company',
        'createdAt',
        'updatedAt',
        'deletedAt',
        'failedLoginAttempts',
        'lockLevel',
        'lockedUntil',
        'mustChangeCredential',
        // RETENSADO 2026-09-08 (QC-65). El censo NO se afloja: sigue siendo una igualdad
        // EXACTA -no un `toContain`-, y por eso hay que nombrar los TRES campos que QC-65
        // anade a `users`: el estado de cuenta y el rastro de su ultimo cambio (`account_status`,
        // `account_status_changed_at`, `account_status_changed_by`). Ninguno de los tres tiene
        // nada que ver con la politica de credenciales de QC-19, que sigue siendo REGLA y no
        // dato: las columnas del bloqueo (`failedLoginAttempts`, `lockLevel`, `lockedUntil`)
        // siguen ahi arriba, intactas, y R18 de QC-65 lo exige con nombre propio.
        // `accountStatusChangedBy` es un ESCALAR sin `@relation` (QC-65 `design.md > 1.3`), asi
        // que NO aparece un cuarto campo de relacion en esta lista.
        'accountStatus',
        'accountStatusChangedAt',
        'accountStatusChangedBy',
        'documentType',
        'role',
        // RETENSADO 2026-09-11 (QC-79). El censo NO se afloja: sigue siendo una igualdad
        // EXACTA, y por eso hay que nombrar el UNICO campo que QC-79 anade a `User`:
        // `credentialSetupTokens`, el lado inverso que Prisma EXIGE para el `@relation` de
        // `CredentialSetupToken`. Es VIRTUAL -no es ninguna columna de `users`, y la migracion
        // `..._credential_setup_tokens` no emite ni un `ALTER TABLE "users"` (QC-79 R37)-, y no
        // tiene nada que ver con la politica de credenciales de QC-19, que sigue siendo REGLA y
        // no dato: el enlace guarda una HUELLA de su propio secreto, nunca una contrasena.
        'credentialSetupTokens',
      ].sort(),
    );
  });
});

// --- R22 — sin ruta, sin Server Action, sin pantalla -------------------------------

describe('QC-19 — la politica se entrega como dato, no como borde (R22)', () => {
  it('la politica no se referencia desde app/ ni desde ningun adaptador driving', () => {
    const RASTROS = /credential-policy|checkCredentialPolicy|createCredentialPolicy|evaluateCredentialRules|CREDENTIAL_RULES/;

    const bordes = [...listFiles('app'), ...listFiles('lib/modules/identity/adapters/driving')];
    expect(bordes.length, 'el barrido no encontro ningun archivo de borde').toBeGreaterThan(0);

    const hallazgos = bordes.filter((file) => RASTROS.test(read(...file.split('/'))));
    expect(hallazgos).toEqual([]);

    // Tampoco hay un route handler ni una Server Action nuevos con su nombre.
    const nuevosBordes = [...listFiles('app'), ...listFiles('lib/modules/identity/adapters/driving')].filter(
      (file) => /credential-policy/.test(file),
    );
    expect(nuevosBordes).toEqual([]);
    expect(policySource).not.toContain("'use server'");
  });
});

// --- R23 — catalogo estable de codigos ---------------------------------------------

describe('QC-19 — catalogo de reglas estable e independiente del idioma (R23)', () => {
  it('CREDENTIAL_RULES exporta los siete codigos estables y toda regla incumplida pertenece al catalogo', () => {
    expect([...CREDENTIAL_RULES]).toEqual([
      'min_length',
      'max_length',
      'no_uppercase',
      'no_lowercase',
      'no_digit',
      'no_symbol',
      'breached',
    ]);
    // Codigos, no mensajes: nada de acentos, espacios ni texto para humanos.
    for (const rule of CREDENTIAL_RULES) {
      expect(rule, `codigo no estable: ${rule}`).toMatch(/^[a-z][a-z_]*$/);
    }

    // Toda regla que devuelva la evaluacion pertenece al catalogo.
    const candidatas = ['', 'a', 'aaaaaaa', 'Xk9#mTq2', 'z'.repeat(CREDENTIAL_MAX_LENGTH + 1)];
    for (const candidate of candidatas) {
      for (const rule of evaluateCredentialRules(candidate).unmet) {
        expect(CREDENTIAL_RULES, `${rule} no esta en el catalogo`).toContain(rule);
      }
    }
  });
});
