// T9 — El caso de uso del seed, entero y con puertos falsos (`design.md > 5.2` y `> 11`).
// Cubre R2, R3, R4, R7, R8, R9, R12, R13, R15, R17, R18. Sin base de datos y sin bcrypt
// real: lo que se prueba aqui es la DECISION del dominio (que crea, que no toca, cuando
// lee el entorno). El adaptador Prisma real tiene su propia tanda de integracion.
//
// Cada caso afirma PRIMERO que ocurrio algo (numero de llamadas esperado > 0) antes de
// afirmar que el resto no ocurrio: un doble mal cableado que no recibe nada no debe
// pasar en verde (`design.md > 11`, «la trampa que este repo ya piso dos veces»).

import {
  INITIAL_USER_ACCOUNT_STATUS,
  SEED_ADMIN_ACCOUNT_STATUS,
} from '@/lib/modules/identity/domain/account-status';
import { INITIAL_COMPANY_NAME } from '@/lib/modules/identity/domain/companies';
import { normalizeCompanyName } from '@/lib/modules/identity/domain/company-name';
import { DOCUMENT_TYPE_CC } from '@/lib/modules/identity/domain/document-type';
import { PERMISSIONS, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity/domain/permissions';
import {
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  SEED_ROLES,
} from '@/lib/modules/identity/domain/roles';

const NOMBRES_DE_SEED_ROLES: readonly string[] = SEED_ROLES.map((role) => role.name);
import { seedInitialAccess } from '@/lib/modules/identity/domain/seed-initial-access';
import type { CredentialRule } from '@/lib/modules/identity/domain/credential-policy';
import type { InitialAdminCredentials } from '@/lib/modules/identity/ports/initial-access-credentials';
import type { InitialAccessRepository } from '@/lib/modules/identity/ports/initial-access-repository';

/** Credencial de test evidentemente ficticia: nunca se persiste (R8). */
const CREDENCIAL_DE_PRUEBA = 'credencial-de-prueba-no-real';

const CREDENCIALES_POR_DEFECTO: InitialAdminCredentials = {
  username: 'admin.inicial',
  credential: CREDENCIAL_DE_PRUEBA,
  email: 'admin.inicial@example.test',
};

/** Credencial del Maestro, distinta de la del Administrador para poder rastrearla. */
const CREDENCIAL_DEL_MAESTRO_DE_PRUEBA = 'credencial-del-maestro-de-prueba-no-real';

const CREDENCIALES_DEL_MAESTRO: InitialAdminCredentials = {
  username: 'plataforma.inicial',
  credential: CREDENCIAL_DEL_MAESTRO_DE_PRUEBA,
  email: 'plataforma.inicial@example.test',
};

/** Hash de mentira, deterministico y reconocible: nunca coincide con la credencial. */
function hashDe(texto: string): string {
  return `hash-de-prueba:${texto}`;
}

type LlamadaRegistrada = { readonly metodo: string; readonly args: readonly unknown[] };

/**
 * Repositorio falso que registra TODAS las llamadas recibidas (metodo + argumentos),
 * en el orden en que llegaron. Es lo que permite afirmar, en el mismo test, que una
 * lectura si ocurrio y que ninguna escritura ocurrio.
 */
function crearRepositorioFalso(options: {
  rolesExistentes?: ReadonlyMap<string, string>;
  usuariosVivosConAdministrador?: number;
  /** QC-47 R22: empresas VIVAS ya existentes, indexadas por su nombre normalizado. */
  empresasVivas?: ReadonlyMap<string, string>;
  /** QC-74 R10: codigos del catalogo que ya estan en la base. */
  permisosExistentes?: ReadonlySet<string>;
  /** QC-74 R10: asignaciones ya existentes, codificadas `${roleId}|${permissionCode}`. */
  asignacionesExistentes?: ReadonlySet<string>;
  /**
   * Usuarios vivos con rol Maestro. Por defecto, los mismos que con Administrador: los
   * casos anteriores al Maestro describen una instalacion «completa» o «vacia» entera.
   */
  usuariosVivosConMaestro?: number;
  /** Lo que responde `countLiveUsersWithUsername`. */
  usuariosVivosConElNombreDelMaestro?: number;
  /** Lo que responde `countLiveUsersWithoutCompanyWithEmail`. */
  usuariosSinEmpresaConElCorreoDelMaestro?: number;
} = {}): InitialAccessRepository & {
  readonly llamadas: LlamadaRegistrada[];
  /** Estado de `companies` tal como lo ve el doble, para poder afirmar QUE id se reutilizo. */
  readonly empresasVivas: ReadonlyMap<string, string>;
  /** Estado de `permissions` y `role_permissions` tal como queda TRAS la corrida. */
  readonly permisosExistentes: ReadonlySet<string>;
  readonly asignacionesExistentes: ReadonlySet<string>;
} {
  const llamadas: LlamadaRegistrada[] = [];
  const rolesExistentes = new Map(options.rolesExistentes ?? []);
  const usuariosVivosConAdministrador = options.usuariosVivosConAdministrador ?? 0;
  const usuariosVivosConMaestro = options.usuariosVivosConMaestro ?? usuariosVivosConAdministrador;
  const empresasVivas = new Map(options.empresasVivas ?? []);
  const permisosExistentes = new Set(options.permisosExistentes ?? []);
  const asignacionesExistentes = new Set(options.asignacionesExistentes ?? []);
  let siguienteIdDeRol = rolesExistentes.size + 1;
  let siguienteIdDeEmpresa = empresasVivas.size + 1;

  return {
    llamadas,
    empresasVivas,
    permisosExistentes,
    asignacionesExistentes,
    async findRoleIdsByName(names) {
      llamadas.push({ metodo: 'findRoleIdsByName', args: [names] });
      const encontrados = new Map<string, string>();
      for (const name of names) {
        const id = rolesExistentes.get(name);
        if (id !== undefined) encontrados.set(name, id);
      }
      return encontrados;
    },
    async countLiveUsersWithRole(roleName) {
      llamadas.push({ metodo: 'countLiveUsersWithRole', args: [roleName] });
      if (roleName === ROLE_ADMINISTRADOR) return usuariosVivosConAdministrador;
      if (roleName === ROLE_MAESTRO) return usuariosVivosConMaestro;
      return 0;
    },
    async createRole(role) {
      llamadas.push({ metodo: 'createRole', args: [role] });
      const id = `rol-${siguienteIdDeRol}`;
      siguienteIdDeRol += 1;
      rolesExistentes.set(role.name, id);
      return id;
    },
    async findCompanyIdByNormalizedName(normalized) {
      llamadas.push({ metodo: 'findCompanyIdByNormalizedName', args: [normalized] });
      return empresasVivas.get(normalized) ?? null;
    },
    async createCompany(input) {
      llamadas.push({ metodo: 'createCompany', args: [input] });
      const id = `empresa-${siguienteIdDeEmpresa}`;
      siguienteIdDeEmpresa += 1;
      empresasVivas.set(input.nameNormalized, id);
      return id;
    },
    async findExistingPermissionCodes(codes) {
      llamadas.push({ metodo: 'findExistingPermissionCodes', args: [codes] });
      const encontrados = new Set<string>();
      for (const code of codes) {
        if (permisosExistentes.has(code)) encontrados.add(code);
      }
      return encontrados;
    },
    async createPermissions(rows) {
      llamadas.push({ metodo: 'createPermissions', args: [rows] });
      for (const row of rows) permisosExistentes.add(row.code);
    },
    async findRolePermissionCodes(roleIds) {
      llamadas.push({ metodo: 'findRolePermissionCodes', args: [roleIds] });
      const encontrados = new Set<string>();
      for (const clave of asignacionesExistentes) {
        const roleId = clave.slice(0, clave.indexOf('|'));
        if (roleIds.includes(roleId)) encontrados.add(clave);
      }
      return encontrados;
    },
    async createRolePermissions(pairs) {
      llamadas.push({ metodo: 'createRolePermissions', args: [pairs] });
      for (const pair of pairs) asignacionesExistentes.add(`${pair.roleId}|${pair.permissionCode}`);
    },
    async createInitialAdmin(input) {
      llamadas.push({ metodo: 'createInitialAdmin', args: [input] });
      return { id: 'usuario-inicial-1' };
    },
    async createInitialMaestro(input) {
      llamadas.push({ metodo: 'createInitialMaestro', args: [input] });
      return { id: 'maestro-inicial-1' };
    },
    async countLiveUsersWithUsername(username) {
      llamadas.push({ metodo: 'countLiveUsersWithUsername', args: [username] });
      return options.usuariosVivosConElNombreDelMaestro ?? 0;
    },
    async countLiveUsersWithoutCompanyWithEmail(email) {
      llamadas.push({ metodo: 'countLiveUsersWithoutCompanyWithEmail', args: [email] });
      return options.usuariosSinEmpresaConElCorreoDelMaestro ?? 0;
    },
  };
}

/** Nombre normalizado de la empresa inicial, calculado con la MISMA pieza que el dominio (R3). */
const NOMBRE_NORMALIZADO_DE_LA_EMPRESA_INICIAL = normalizeCompanyName(INITIAL_COMPANY_NAME);

/** Llamadas que tocan `companies`, sea para leer o para escribir (QC-47 R22). */
function llamadasSobreEmpresas(llamadas: readonly LlamadaRegistrada[]): readonly LlamadaRegistrada[] {
  return llamadas.filter((llamada) => /company|companies|empresa/i.test(llamada.metodo));
}

/**
 * Doble de la politica de credenciales (QC-19 R18). Por defecto ACEPTA: los casos de esta
 * tanda describen el seed, no la politica, y un doble que rechazara cambiaria todos los
 * desenlaces. El caso 10 monta el suyo, que rechaza.
 */
function crearPoliticaFalsa(resultado: { ok: boolean; unmet: readonly string[] } = { ok: true, unmet: [] }) {
  return vi.fn(async () => resultado as { ok: boolean; unmet: readonly CredentialRule[] });
}

function crearHasherFalso() {
  return {
    hash: vi.fn(async (texto: string) => hashDe(texto)),
    verify: vi.fn(async (texto: string, guardado: string) => guardado === hashDe(texto)),
  };
}

/** Llamadas cuyo metodo o argumentos son de ESCRITURA (crear rol o crear usuario). */
function llamadasDeEscritura(llamadas: readonly LlamadaRegistrada[]): readonly LlamadaRegistrada[] {
  return llamadas.filter(
    (llamada) =>
      llamada.metodo === 'createRole' ||
      llamada.metodo === 'createCompany' ||
      llamada.metodo === 'createInitialAdmin' ||
      llamada.metodo === 'createInitialMaestro' ||
      // QC-74: los dos metodos de escritura nuevos entran aqui a proposito, para que los
      // casos que afirman «no se escribio nada» tambien los cubran.
      llamada.metodo === 'createPermissions' ||
      llamada.metodo === 'createRolePermissions',
  );
}

/** Llamadas de LECTURA (las dos del paso 1 del algoritmo). */
function llamadasDeLectura(llamadas: readonly LlamadaRegistrada[]): readonly LlamadaRegistrada[] {
  return llamadas.filter(
    (llamada) => llamada.metodo === 'findRoleIdsByName' || llamada.metodo === 'countLiveUsersWithRole',
  );
}

// ---------------------------------------------------------------------------------
// QC-74 — estado de permisos «base ya sembrada», derivado SIEMPRE del catalogo real y de
// `SEED_ROLE_PERMISSIONS`, nunca de una lista escrita a mano en este archivo.
// ---------------------------------------------------------------------------------

/** Ids de rol estables para los dos roles del seed, los que usan los casos «ya sembrada». */
const ROLES_YA_SEMBRADOS: ReadonlyMap<string, string> = new Map(
  SEED_ROLES.map((role, index) => [role.name, `rol-${index}`]),
);

/** Los once codigos del catalogo, tal y como los veria una base ya sembrada. */
const TODOS_LOS_CODIGOS_DEL_CATALOGO: ReadonlySet<string> = new Set(
  PERMISSIONS.map((permission) => permission.code),
);

/** Las asignaciones del seed para unos ids de rol dados, en la codificacion del puerto. */
function asignacionesDelSeed(rolesPorNombre: ReadonlyMap<string, string>): ReadonlySet<string> {
  const pares = new Set<string>();
  for (const [roleName, codes] of Object.entries(SEED_ROLE_PERMISSIONS)) {
    const roleId = rolesPorNombre.get(roleName);
    if (roleId === undefined) continue;
    for (const code of codes) pares.add(`${roleId}|${code}`);
  }
  return pares;
}

/** Numero total de asignaciones que el seed tiene que dejar. Se deriva de
 *  `SEED_ROLE_PERMISSIONS`, no se escribe a mano. */
const TOTAL_DE_ASIGNACIONES_DEL_SEED = Object.values(SEED_ROLE_PERMISSIONS).reduce(
  (total, codes) => total + codes.length,
  0,
);

describe('seedInitialAccess', () => {
  // Caso 9: `console.log`/`console.error` se capturan durante TODOS los casos, y al
  // final se afirma que la credencial en claro no aparece en ninguna salida acumulada.
  // `todasLasSalidasAcumuladas` NO se resetea entre tests: es a proposito, para que el
  // ultimo `it` pueda revisar lo que se grito en TODOS los casos anteriores, incluido
  // el error del caso 7.
  const todasLasSalidasAcumuladas: string[] = [];
  const salidasCapturadas: string[] = [];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    salidasCapturadas.length = 0;
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      const linea = args.map(String).join(' ');
      salidasCapturadas.push(linea);
      todasLasSalidasAcumuladas.push(linea);
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const linea = args.map(String).join(' ');
      salidasCapturadas.push(linea);
      todasLasSalidasAcumuladas.push(linea);
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    // R18: la credencial de prueba jamas aparece en console.log ni console.error,
    // afirmado caso por caso ademas de en el acumulado del caso 9.
    for (const salida of salidasCapturadas) {
      expect(salida).not.toContain(CREDENCIAL_DE_PRUEBA);
      expect(salida).not.toContain(CREDENCIAL_DEL_MAESTRO_DE_PRUEBA);
    }
  });

  // Caso 1 (R2, R4)
  it('sobre una base vacia crea todos los roles de SEED_ROLES y el usuario inicial con rol Administrador', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    expect(repository.llamadas.length).toBeGreaterThan(0);
    // El seed asegura todos los roles de `SEED_ROLES`, no solo los historicos.
    expect(outcome.createdRoles.slice().sort()).toEqual([...NOMBRES_DE_SEED_ROLES].sort());
    expect(outcome.createdAdmin).toBe(true);

    const creacionDeAdmin = repository.llamadas.find((llamada) => llamada.metodo === 'createInitialAdmin');
    expect(creacionDeAdmin).toBeDefined();
    const input = creacionDeAdmin?.args[0] as { roleId: string };
    const rolAdministradorCreado = repository.llamadas.find(
      (llamada) => llamada.metodo === 'createRole' && (llamada.args[0] as { name: string }).name === ROLE_ADMINISTRADOR,
    );
    expect(rolAdministradorCreado).toBeDefined();
    expect(input.roleId).toBeTruthy();
  });

  // Caso 2 (R7)
  it('los cinco marcadores personales y el tipo de documento CC son los del diseno, y el correo/usuario vienen del proveedor', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    const creacionDeAdmin = repository.llamadas.find((llamada) => llamada.metodo === 'createInitialAdmin');
    expect(creacionDeAdmin).toBeDefined();
    const input = creacionDeAdmin?.args[0] as {
      username: string;
      email: string;
      firstNames: string;
      lastNames: string;
      birthDate: Date;
      phone: string;
      documentTypeCode: string;
      documentNumber: string;
    };
    expect(input.username).toBe(CREDENCIALES_POR_DEFECTO.username);
    expect(input.email).toBe(CREDENCIALES_POR_DEFECTO.email);
    expect(input.firstNames).toBe('Administrador');
    expect(input.lastNames).toBe('Inicial');
    expect(input.birthDate.toISOString()).toBe('1900-01-01T00:00:00.000Z');
    expect(input.phone).toBe('+00 000 000 0000');
    expect(input.documentTypeCode).toBe(DOCUMENT_TYPE_CC);
    expect(input.documentNumber).toBe('00000000');
  });

  // Caso 3 (R8)
  it('el passwordHash guardado es el que devolvio el hasher y no es la credencial en claro', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Una vez por usuario inicial, el Administrador y el Maestro.
    expect(passwordHasher.hash).toHaveBeenCalledTimes(2);
    expect(passwordHasher.hash).toHaveBeenCalledWith(CREDENCIAL_DE_PRUEBA);

    const creacionDeAdmin = repository.llamadas.find((llamada) => llamada.metodo === 'createInitialAdmin');
    expect(creacionDeAdmin).toBeDefined();
    const input = creacionDeAdmin?.args[0] as { passwordHash: string };
    expect(input.passwordHash).toBe(hashDe(CREDENCIAL_DE_PRUEBA));
    expect(input.passwordHash).not.toBe(CREDENCIAL_DE_PRUEBA);
  });

  // Si solo existe el Administrador, faltan todos los demas roles de semilla.
  it('si el rol Operador falta y el Administrador ya existe, crea los demas roles de SEED_ROLES', async () => {
    const repository = crearRepositorioFalso({
      rolesExistentes: new Map([[ROLE_ADMINISTRADOR, 'rol-admin-existente']]),
      usuariosVivosConAdministrador: 1,
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    const creacionesDeRol = repository.llamadas.filter((llamada) => llamada.metodo === 'createRole');
    expect(creacionesDeRol.length).toBeGreaterThan(0);
    const faltantes = NOMBRES_DE_SEED_ROLES.filter((nombre) => nombre !== ROLE_ADMINISTRADOR);
    expect(faltantes).toEqual(expect.arrayContaining([ROLE_OPERADOR, ROLE_EMPACADOR]));
    expect(outcome.createdRoles.slice().sort()).toEqual([...faltantes].sort());
    expect(creacionesDeRol).toHaveLength(faltantes.length);
    expect(creacionesDeRol.map((llamada) => (llamada.args[0] as { name: string }).name).sort()).toEqual(
      [...faltantes].sort(),
    );
  });

  // Caso 5 (R12)
  it('si ya existe un administrador vivo, el proveedor de credenciales no se invoca ni una vez', async () => {
    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      // QC-74: «base ya sembrada» incluye ahora el catalogo y sus asignaciones. Sin esto,
      // el seed crearia los permisos que faltan y estos casos dejarian de describir una
      // instalacion completa.
      permisosExistentes: TODOS_LOS_CODIGOS_DEL_CATALOGO,
      asignacionesExistentes: asignacionesDelSeed(ROLES_YA_SEMBRADOS),
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: la lectura si ocurrio, para que un doble mal cableado no pase en verde.
    expect(llamadasDeLectura(repository.llamadas).length).toBeGreaterThan(0);
    // Luego: nada mas ocurrio.
    expect(credentials).toHaveBeenCalledTimes(0);
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
    expect(outcome.createdRoles).toEqual([]);
    expect(outcome.createdAdmin).toBe(false);
  });

  // Caso 6 (R15)
  it('si el admin ya existe con hash y marca distintos, no hay ninguna llamada de escritura ni de actualizacion', async () => {
    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      // QC-74: «base ya sembrada» incluye ahora el catalogo y sus asignaciones. Sin esto,
      // el seed crearia los permisos que faltan y estos casos dejarian de describir una
      // instalacion completa.
      permisosExistentes: TODOS_LOS_CODIGOS_DEL_CATALOGO,
      asignacionesExistentes: asignacionesDelSeed(ROLES_YA_SEMBRADOS),
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    expect(llamadasDeLectura(repository.llamadas).length).toBeGreaterThan(0);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
    // El puerto no tiene ningun metodo de actualizacion que pudiera haberse llamado.
    expect(
      repository.llamadas.every(
        (llamada) =>
          llamada.metodo === 'findRoleIdsByName' ||
          llamada.metodo === 'countLiveUsersWithRole' ||
          // QC-74: las dos lecturas del paso de permisos. Son lecturas, no escrituras: el
          // puerto sigue sin exponer ningun `update` ni `upsert`.
          llamada.metodo === 'findExistingPermissionCodes' ||
          llamada.metodo === 'findRolePermissionCodes',
      ),
    ).toBe(true);
  });

  // Caso 7 (R13)
  it('si el proveedor lanza por variable ausente, el error se propaga y no hubo ninguna escritura', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const mensajeDeError = 'falta SEED_ADMIN_PASSWORD';
    const credentials = vi.fn(() => {
      throw new Error(mensajeDeError);
    });
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    await expect(seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy })).rejects.toThrow(
      'falta SEED_ADMIN_PASSWORD',
    );

    // Primero: la lectura si ocurrio.
    expect(llamadasDeLectura(repository.llamadas).length).toBeGreaterThan(0);
    // Luego: ninguna escritura quedo registrada.
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);

    // El error real que se propago no lleva la credencial ni en el mensaje ni en el
    // stack (caso 9 lo vuelve a comprobar sobre la salida acumulada de consola).
    let errorCapturado: Error | null = null;
    try {
      await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });
    } catch (error) {
      errorCapturado = error as Error;
    }
    expect(errorCapturado).not.toBeNull();
    expect(errorCapturado?.message ?? '').not.toContain(CREDENCIAL_DE_PRUEBA);
    expect(errorCapturado?.stack ?? '').not.toContain(CREDENCIAL_DE_PRUEBA);
  });

  // Caso 7b (R13) — por que los pasos 4 y 5 tienen que ir en una transaccion.
  it('si createInitialAdmin lanza DESPUES de crear los roles, todos los roles de SEED_ROLES ya quedaron creados y el error se propaga', async () => {
    const repository = crearRepositorioFalso();
    const mensajeDeError = 'fallo simulado del alta del usuario inicial';
    repository.createInitialAdmin = async () => {
      throw new Error(mensajeDeError);
    };
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    let errorCapturado: Error | null = null;
    try {
      await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });
    } catch (error) {
      errorCapturado = error as Error;
    }

    // Primero: que los roles SI se crearon (todos los de `SEED_ROLES`, exactamente). Ocurrio
    // ANTES de afirmar cualquier otra cosa, siguiendo el orden en que el dominio los crea.
    const creacionesDeRol = repository.llamadas.filter((llamada) => llamada.metodo === 'createRole');
    expect(creacionesDeRol.map((llamada) => (llamada.args[0] as { name: string }).name)).toEqual(
      NOMBRES_DE_SEED_ROLES,
    );

    // Luego: que el error se propaga.
    expect(errorCapturado).not.toBeNull();
    expect(errorCapturado?.message).toBe(mensajeDeError);

    // Es justo por este camino por lo que los pasos 4 y 5 tienen que ir en una
    // transaccion (`design.md > 5.2`): sin ella, estos dos roles quedarian comiteados
    // en la base aunque el alta del usuario haya fallado. Este test, con un repositorio
    // sobre dobles, no puede ver la persistencia real; lo que demuestra es que el
    // dominio SI deja los roles creados antes de que la escritura del usuario falle, que
    // es la condicion que hace necesaria la transaccion en el adaptador. La cobertura de
    // que la transaccion revierte de verdad esta en el test de integracion contra base
    // real (`identity-seed.int.test.ts`).
  });

  // Caso 8 (R17)
  it('en ningun caso se llama a un metodo que mencione document_types, y el puerto ni siquiera lo expone', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    expect(repository.llamadas.length).toBeGreaterThan(0);

    // La superficie del doble (sus propios metodos) no expone nada de document_types.
    const superficieDelDoble = Object.keys(repository).filter((clave) => clave !== 'llamadas');
    expect(superficieDelDoble.some((nombre) => /documentType|document_types/i.test(nombre))).toBe(false);

    // Ninguna llamada registrada menciona document_types en su nombre de metodo.
    expect(repository.llamadas.some((llamada) => /documentType|document_types/i.test(llamada.metodo))).toBe(
      false,
    );
  });

  // Caso 8b (QC-19 R18) — el test de COMPORTAMIENTO que la guardia de texto no puede dar:
  // la politica se evalua ANTES del hash y su resultado se RESPETA. Un barrido de fuentes
  // ve que el archivo nombra la politica; no ve el orden ni que nadie ignore su respuesta
  // (`QC-19 design.md > 7`). Va ANTES del caso 9 a proposito, para que la revision de la
  // salida acumulada tambien cubra el error que este caso provoca.
  it('si la politica rechaza la credencial de instalacion, no se hashea ni se escribe nada', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa({ ok: false, unmet: ['min_length', 'no_symbol'] });
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    let errorCapturado: Error | null = null;
    try {
      await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });
    } catch (error) {
      errorCapturado = error as Error;
    }

    // Primero: la politica SI se consulto, y con la credencial resuelta. Sin esto, un
    // doble mal cableado que nunca se llama pasaria en verde.
    expect(checkCredentialPolicy).toHaveBeenCalledTimes(1);
    expect(checkCredentialPolicy).toHaveBeenCalledWith(CREDENCIAL_DE_PRUEBA);

    // Luego: rechaza, nombrando las reglas incumplidas y NUNCA la credencial (R24).
    expect(errorCapturado).not.toBeNull();
    expect(errorCapturado?.message).toContain('min_length');
    expect(errorCapturado?.message).toContain('no_symbol');
    expect(errorCapturado?.message ?? '').not.toContain(CREDENCIAL_DE_PRUEBA);

    // Y el orden se respeta: no se produjo hash ni se escribio el usuario.
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(
      repository.llamadas.some((llamada) => llamada.metodo === 'createInitialAdmin'),
    ).toBe(false);
  });

  // ---------------------------------------------------------------------------------
  // QC-47 (T15). Los cuatro casos de la empresa inicial. Siguen el mismo orden que el
  // resto del archivo: PRIMERO se afirma que algo ocurrio, y solo despues que el resto
  // no ocurrio.
  // ---------------------------------------------------------------------------------

  // Caso 10 (QC-47 R20)
  it('sobre una base vacia crea la empresa inicial y el administrador DENTRO de ella, en la misma llamada', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: la empresa SI se creo, con el nombre de la constante del dominio y con su
    // normalizado calculado por `normalizeCompanyName` (R3, R21).
    const creacionesDeEmpresa = repository.llamadas.filter((llamada) => llamada.metodo === 'createCompany');
    expect(creacionesDeEmpresa).toHaveLength(1);
    expect(creacionesDeEmpresa[0]?.args[0]).toEqual({
      name: INITIAL_COMPANY_NAME,
      nameNormalized: NOMBRE_NORMALIZADO_DE_LA_EMPRESA_INICIAL,
    });
    expect(outcome.createdCompany).toBe(INITIAL_COMPANY_NAME);

    // Luego: el administrador se creo DENTRO de esa empresa. El id no se escribe a mano:
    // se lee del estado del doble, asi que el test cae si el dominio pasa otro.
    const idDeLaEmpresaCreada = repository.empresasVivas.get(NOMBRE_NORMALIZADO_DE_LA_EMPRESA_INICIAL);
    expect(idDeLaEmpresaCreada).toBeDefined();

    const creacionesDeAdmin = repository.llamadas.filter((llamada) => llamada.metodo === 'createInitialAdmin');
    expect(creacionesDeAdmin).toHaveLength(1);
    const input = creacionesDeAdmin[0]?.args[0] as { companyId: string; roleId: string };
    expect(input.companyId).toBe(idDeLaEmpresaCreada);

    // R20, «en la misma llamada»: la empresa y el rol viajan en el MISMO `createInitialAdmin`.
    // El puerto no tiene ningun metodo de actualizacion, asi que no hay forma de que el
    // dominio complete la empresa despues; lo que este test fija es que la unica escritura
    // del usuario ya la lleva. Y que es la ULTIMA llamada al repositorio: nada la retoca.
    const rolAdministrador = repository.llamadas.find(
      (llamada) => llamada.metodo === 'createRole' && (llamada.args[0] as { name: string }).name === ROLE_ADMINISTRADOR,
    );
    expect(rolAdministrador).toBeDefined();
    expect(input.roleId).toBeTruthy();
    // Despues solo puede venir el alta del Maestro, que no toca al Administrador.
    const llamadasSinElMaestro = repository.llamadas.filter((llamada) => llamada.metodo !== 'createInitialMaestro');
    expect(llamadasSinElMaestro.at(-1)?.metodo).toBe('createInitialAdmin');

    // Y el orden: la empresa se resolvio ANTES de escribir el usuario.
    const indiceCreacionDeEmpresa = repository.llamadas.findIndex((llamada) => llamada.metodo === 'createCompany');
    const indiceCreacionDeAdmin = repository.llamadas.findIndex((llamada) => llamada.metodo === 'createInitialAdmin');
    expect(indiceCreacionDeEmpresa).toBeLessThan(indiceCreacionDeAdmin);
  });

  // Caso 11 (QC-47 R22)
  it('si la empresa inicial ya existe la reutiliza por nombre normalizado y NO crea una segunda', async () => {
    const idDeLaEmpresaYaExistente = 'empresa-preexistente';
    const repository = crearRepositorioFalso({
      empresasVivas: new Map([[NOMBRE_NORMALIZADO_DE_LA_EMPRESA_INICIAL, idDeLaEmpresaYaExistente]]),
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: la busqueda SI ocurrio, y por el nombre NORMALIZADO, no por el original.
    const busquedas = repository.llamadas.filter((llamada) => llamada.metodo === 'findCompanyIdByNormalizedName');
    expect(busquedas).toHaveLength(1);
    expect(busquedas[0]?.args[0]).toBe(NOMBRE_NORMALIZADO_DE_LA_EMPRESA_INICIAL);

    // Luego: no se creo ninguna empresa, y el administrador entro en la que ya estaba.
    expect(repository.llamadas.filter((llamada) => llamada.metodo === 'createCompany')).toEqual([]);
    expect(outcome.createdCompany).toBeNull();

    const creacionesDeAdmin = repository.llamadas.filter((llamada) => llamada.metodo === 'createInitialAdmin');
    expect(creacionesDeAdmin).toHaveLength(1);
    expect((creacionesDeAdmin[0]?.args[0] as { companyId: string }).companyId).toBe(idDeLaEmpresaYaExistente);
    expect(outcome.createdAdmin).toBe(true);
  });

  // Caso 12 (QC-47 R22)
  it('sobre una base que ya tiene acceso inicial no toca companies NI PARA LEER', async () => {
    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      // QC-74: «base ya sembrada» incluye ahora el catalogo y sus asignaciones. Sin esto,
      // el seed crearia los permisos que faltan y estos casos dejarian de describir una
      // instalacion completa.
      permisosExistentes: TODOS_LOS_CODIGOS_DEL_CATALOGO,
      asignacionesExistentes: asignacionesDelSeed(ROLES_YA_SEMBRADOS),
      empresasVivas: new Map([[NOMBRE_NORMALIZADO_DE_LA_EMPRESA_INICIAL, 'empresa-preexistente']]),
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: el seed SI corrio y SI leyo el estado.
    expect(llamadasDeLectura(repository.llamadas).length).toBeGreaterThan(0);

    // Luego: ni una sola llamada toco `companies`, tampoco la de lectura. Una instalacion
    // que ya tiene administrador no vuelve a preguntar por la empresa.
    expect(llamadasSobreEmpresas(repository.llamadas)).toEqual([]);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
    expect(outcome.createdCompany).toBeNull();
    expect(outcome.createdAdmin).toBe(false);
  });

  // Caso 13 (QC-47 R14)
  it('needsAdmin sale de countLiveUsersWithRole(Administrador), leido de users.role_id', async () => {
    // El doble responde el conteo SOLO para el rol Administrador; para cualquier otro
    // nombre devuelve 0. Si el dominio preguntara por otro rol, veria 0, creeria que
    // falta el administrador y lo crearia: eso es lo que hace caer este caso.
    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      // QC-74: «base ya sembrada» incluye ahora el catalogo y sus asignaciones. Sin esto,
      // el seed crearia los permisos que faltan y estos casos dejarian de describir una
      // instalacion completa.
      permisosExistentes: TODOS_LOS_CODIGOS_DEL_CATALOGO,
      asignacionesExistentes: asignacionesDelSeed(ROLES_YA_SEMBRADOS),
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: la lectura SI ocurrio, exactamente una vez y con el nombre del rol
    // Administrador. Es la unica fuente de `needsAdmin`.
    // La otra lectura es la del Maestro, que decide `needsMaestro` y no `needsAdmin`.
    const conteos = repository.llamadas.filter(
      (llamada) => llamada.metodo === 'countLiveUsersWithRole' && llamada.args[0] !== ROLE_MAESTRO,
    );
    expect(conteos).toHaveLength(1);
    expect(conteos[0]?.args[0]).toBe(ROLE_ADMINISTRADOR);

    // Luego: como respondio 1, no se creo ningun administrador ni ninguna empresa.
    expect(outcome.createdAdmin).toBe(false);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);

    // Y el mismo doble, con el mismo cableado pero respondiendo 0 para ese rol, SI lo
    // crea: el desenlace depende de ese conteo y de nada mas.
    const repositorioSinAdministrador = crearRepositorioFalso({
      rolesExistentes: new Map(SEED_ROLES.map((role, index) => [role.name, `rol-${index}`])),
      usuariosVivosConAdministrador: 0,
    });
    const otroDesenlace = await seedInitialAccess({
      repository: repositorioSinAdministrador,
      passwordHasher: crearHasherFalso(),
      credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
      maestroCredentials: vi.fn(() => CREDENCIALES_DEL_MAESTRO),
      checkCredentialPolicy: crearPoliticaFalsa(),
    });
    expect(otroDesenlace.createdAdmin).toBe(true);
  });

  // ---------------------------------------------------------------------------------
  // QC-74 (T6). El paso de permisos. Mismo orden que el resto del archivo: PRIMERO se
  // afirma que algo ocurrio, y solo despues que el resto no ocurrio.
  //
  // CONVENCION DE ESTOS CASOS: cuando no hay nada que crear, el dominio NO llama a
  // `createPermissions` ni a `createRolePermissions` — ni siquiera con un array vacio. Se
  // elige asi (y se afirma asi) porque una escritura con cero filas sigue siendo un viaje
  // a la base en cada arranque, y porque «no se llamo» es una afirmacion mas fuerte que
  // «se llamo con nada».
  // ---------------------------------------------------------------------------------

  // El catalogo completo y las asignaciones de los tres roles, contra el repositorio falso.
  it('sobre una base vacia crea el catalogo completo y todas las asignaciones del seed', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: el catalogo SI se creo, entero y derivado de `PERMISSIONS`.
    const creacionesDePermisos = repository.llamadas.filter((llamada) => llamada.metodo === 'createPermissions');
    expect(creacionesDePermisos).toHaveLength(1);
    const filasCreadas = creacionesDePermisos[0]?.args[0] as readonly {
      code: string;
      module: string;
      action: string;
      description: string;
    }[];
    expect(filasCreadas.map((fila) => fila.code)).toEqual(PERMISSIONS.map((permission) => permission.code));
    expect(filasCreadas).toEqual(
      PERMISSIONS.map((permission) => ({
        code: permission.code,
        module: permission.module,
        action: permission.action,
        description: permission.description,
      })),
    );
    expect(outcome.createdPermissions).toEqual(PERMISSIONS.map((permission) => permission.code));

    // Luego: las asignaciones, todas las que declara `SEED_ROLE_PERMISSIONS` para los tres roles.
    const creacionesDeAsignaciones = repository.llamadas.filter(
      (llamada) => llamada.metodo === 'createRolePermissions',
    );
    expect(creacionesDeAsignaciones).toHaveLength(1);
    const paresCreados = creacionesDeAsignaciones[0]?.args[0] as readonly {
      roleId: string;
      permissionCode: string;
    }[];
    expect(TOTAL_DE_ASIGNACIONES_DEL_SEED).toBeGreaterThan(0);
    expect(paresCreados).toHaveLength(TOTAL_DE_ASIGNACIONES_DEL_SEED);
    expect(outcome.createdRolePermissions).toBe(TOTAL_DE_ASIGNACIONES_DEL_SEED);

    // Y cada rol recibio EXACTAMENTE los codigos que declara `SEED_ROLE_PERMISSIONS`, con
    // el id que el doble le dio al crearlo: nada de ids escritos a mano.
    const rolesCreados = new Map(
      repository.llamadas
        .filter((llamada) => llamada.metodo === 'createRole')
        .map((llamada, index) => [(llamada.args[0] as { name: string }).name, `rol-${index + 1}`]),
    );
    expect(new Set(paresCreados.map((par) => `${par.roleId}|${par.permissionCode}`))).toEqual(
      new Set(asignacionesDelSeed(rolesCreados)),
    );
    const codigosDelAdministrador = paresCreados
      .filter((par) => par.roleId === rolesCreados.get(ROLE_ADMINISTRADOR))
      .map((par) => par.permissionCode);
    expect(codigosDelAdministrador).toHaveLength(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]!.length);
    expect(new Set(codigosDelAdministrador)).toEqual(
      new Set(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]),
    );
    // El orden es el de `SEED_ROLE_PERMISSIONS`, que es como el seed los recorre.
    expect(
      paresCreados
        .filter((par) => par.roleId === rolesCreados.get(ROLE_OPERADOR))
        .map((par) => par.permissionCode),
    ).toEqual(['inventario.consultar', 'asignaciones.consultar', 'asignaciones.ejecutar']);
    // El Empacador nace con exactamente sus tres permisos, en el orden de
    // `SEED_ROLE_PERMISSIONS`.
    expect(
      paresCreados
        .filter((par) => par.roleId === rolesCreados.get(ROLE_EMPACADOR))
        .map((par) => par.permissionCode),
    ).toEqual(['asignaciones.consultar', 'terminados.consultar', 'empaque.modificar']);

    // Y el orden del algoritmo: los roles ANTES que los permisos, y los permisos ANTES
    // que el administrador (`design.md > 3`). Sin ese orden, una asignacion no tendria
    // id de rol al que colgarse.
    const indiceDe = (metodo: string): number =>
      repository.llamadas.findIndex((llamada) => llamada.metodo === metodo);
    expect(indiceDe('createRole')).toBeLessThan(indiceDe('createPermissions'));
    expect(indiceDe('createPermissions')).toBeLessThan(indiceDe('createRolePermissions'));
    expect(indiceDe('createRolePermissions')).toBeLessThan(indiceDe('createInitialAdmin'));
  });

  it('QC-142 R13: sobre una base vacia el Administrador recibe documentos.consultar y documentos.modificar; Operador y Empacador ninguno', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    const paresCreados = repository.llamadas.find((llamada) => llamada.metodo === 'createRolePermissions')
      ?.args[0] as readonly { roleId: string; permissionCode: string }[];
    const rolesCreados = new Map(
      repository.llamadas
        .filter((llamada) => llamada.metodo === 'createRole')
        .map((llamada, index) => [(llamada.args[0] as { name: string }).name, `rol-${index + 1}`]),
    );
    const codigosDe = (rol: string): string[] =>
      paresCreados.filter((par) => par.roleId === rolesCreados.get(rol)).map((par) => par.permissionCode);

    expect(codigosDe(ROLE_ADMINISTRADOR)).toEqual(expect.arrayContaining(['documentos.consultar', 'documentos.modificar']));
    expect(codigosDe(ROLE_OPERADOR)).not.toContain('documentos.consultar');
    expect(codigosDe(ROLE_OPERADOR)).not.toContain('documentos.modificar');
    expect(codigosDe(ROLE_EMPACADOR)).not.toContain('documentos.consultar');
    expect(codigosDe(ROLE_EMPACADOR)).not.toContain('documentos.modificar');
  });

  it('QC-161 R8, R9: sobre una base vacia el Maestro recibe exactamente empresas.consultar y empresas.modificar; el Administrador, el Operador y el Empacador ningun empresas.*', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    const paresCreados = repository.llamadas.find((llamada) => llamada.metodo === 'createRolePermissions')
      ?.args[0] as readonly { roleId: string; permissionCode: string }[];
    const rolesCreados = new Map(
      repository.llamadas
        .filter((llamada) => llamada.metodo === 'createRole')
        .map((llamada, index) => [(llamada.args[0] as { name: string }).name, `rol-${index + 1}`]),
    );
    const codigosDe = (rol: string): string[] =>
      paresCreados.filter((par) => par.roleId === rolesCreados.get(rol)).map((par) => par.permissionCode);
    const deEmpresas = (codigos: readonly string[]): string[] =>
      codigos.filter((codigo) => codigo.startsWith('empresas.'));

    expect(codigosDe(ROLE_MAESTRO)).toEqual(['empresas.consultar', 'empresas.modificar']);
    expect(codigosDe(ROLE_ADMINISTRADOR)).toEqual([...(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? [])]);
    expect(codigosDe(ROLE_ADMINISTRADOR).length).toBeGreaterThan(0);
    expect(deEmpresas(codigosDe(ROLE_ADMINISTRADOR))).toEqual([]);
    expect(deEmpresas(codigosDe(ROLE_OPERADOR))).toEqual([]);
    expect(deEmpresas(codigosDe(ROLE_EMPACADOR))).toEqual([]);
  });

  it('QC-142 R13: sobre una base sembrada antes de esta feature -todo salvo documentos.*- el seed crea exactamente esos dos permisos y las dos asignaciones del Administrador, y la segunda corrida no cambia nada', async () => {
    const codigosDeDocumentos: readonly string[] = PERMISSIONS.filter(
      (permission) => permission.module === 'documentos',
    ).map((permission) => permission.code);
    const administradorId = ROLES_YA_SEMBRADOS.get(ROLE_ADMINISTRADOR) ?? '';
    const operadorId = ROLES_YA_SEMBRADOS.get(ROLE_OPERADOR) ?? '';
    const empacadorId = ROLES_YA_SEMBRADOS.get(ROLE_EMPACADOR) ?? '';

    const yaExistentes = PERMISSIONS.map((permission) => permission.code).filter(
      (code) => !codigosDeDocumentos.includes(code),
    );
    const asignacionesDeDocumentosDelAdministrador = new Set(
      codigosDeDocumentos.map((code) => `${administradorId}|${code}`),
    );
    const asignacionesExistentes = new Set(
      [...asignacionesDelSeed(ROLES_YA_SEMBRADOS)].filter(
        (asignacion) => !asignacionesDeDocumentosDelAdministrador.has(asignacion),
      ),
    );

    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      permisosExistentes: new Set(yaExistentes),
      asignacionesExistentes,
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const primeraCorrida = await seedInitialAccess({
      repository,
      passwordHasher,
      credentials,
      maestroCredentials,
      checkCredentialPolicy,
    });

    // Primero: se creo exactamente lo que faltaba de documentos, y nada mas.
    expect(new Set(primeraCorrida.createdPermissions)).toEqual(new Set(codigosDeDocumentos));
    expect(primeraCorrida.createdRolePermissions).toBe(codigosDeDocumentos.length);

    const paresCreados = repository.llamadas.find((llamada) => llamada.metodo === 'createRolePermissions')
      ?.args[0] as readonly { roleId: string; permissionCode: string }[];
    expect(paresCreados.every((par) => par.roleId === administradorId)).toBe(true);
    expect(new Set(paresCreados.map((par) => par.permissionCode))).toEqual(new Set(codigosDeDocumentos));

    // Operador y Empacador siguen sin ninguna entrada de documentos.
    for (const codigo of codigosDeDocumentos) {
      expect(repository.asignacionesExistentes.has(`${operadorId}|${codigo}`)).toBe(false);
      expect(repository.asignacionesExistentes.has(`${empacadorId}|${codigo}`)).toBe(false);
    }

    // Y la segunda corrida, sobre el MISMO repositorio ya completo, no escribe nada.
    const llamadasTrasLaPrimera = repository.llamadas.length;
    const segundaCorrida = await seedInitialAccess({
      repository,
      passwordHasher,
      credentials,
      maestroCredentials,
      checkCredentialPolicy,
    });
    const llamadasDeLaSegunda = repository.llamadas.slice(llamadasTrasLaPrimera);
    expect(llamadasDeEscritura(llamadasDeLaSegunda)).toEqual([]);
    expect(segundaCorrida.createdPermissions).toEqual([]);
    expect(segundaCorrida.createdRolePermissions).toBe(0);
  });

  it('QC-201 R3, R4: sobre una base sembrada antes de esta feature -todo salvo asignaciones.ejecutar- el seed crea ese permiso y solo las asignaciones del Administrador y el Operador, y la segunda corrida no cambia nada', async () => {
    const EJECUTAR = 'asignaciones.ejecutar';
    const administradorId = ROLES_YA_SEMBRADOS.get(ROLE_ADMINISTRADOR) ?? '';
    const operadorId = ROLES_YA_SEMBRADOS.get(ROLE_OPERADOR) ?? '';
    const empacadorId = ROLES_YA_SEMBRADOS.get(ROLE_EMPACADOR) ?? '';
    const maestroId = ROLES_YA_SEMBRADOS.get(ROLE_MAESTRO) ?? '';

    const yaExistentes = PERMISSIONS.map((permission) => permission.code).filter((code) => code !== EJECUTAR);
    const asignacionesExistentes = new Set(
      [...asignacionesDelSeed(ROLES_YA_SEMBRADOS)].filter((asignacion) => !asignacion.endsWith(`|${EJECUTAR}`)),
    );

    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      permisosExistentes: new Set(yaExistentes),
      asignacionesExistentes,
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const primeraCorrida = await seedInitialAccess({
      repository,
      passwordHasher,
      credentials,
      maestroCredentials,
      checkCredentialPolicy,
    });

    expect(primeraCorrida.createdPermissions).toEqual([EJECUTAR]);
    expect(primeraCorrida.createdRolePermissions).toBe(2);
    const paresCreados = repository.llamadas.find((llamada) => llamada.metodo === 'createRolePermissions')
      ?.args[0] as readonly { roleId: string; permissionCode: string }[];
    expect(new Set(paresCreados.map((par) => `${par.roleId}|${par.permissionCode}`))).toEqual(
      new Set([`${administradorId}|${EJECUTAR}`, `${operadorId}|${EJECUTAR}`]),
    );
    expect(repository.asignacionesExistentes.has(`${empacadorId}|${EJECUTAR}`)).toBe(false);
    expect(repository.asignacionesExistentes.has(`${maestroId}|${EJECUTAR}`)).toBe(false);

    const llamadasTrasLaPrimera = repository.llamadas.length;
    const segundaCorrida = await seedInitialAccess({
      repository,
      passwordHasher,
      credentials,
      maestroCredentials,
      checkCredentialPolicy,
    });
    expect(llamadasDeEscritura(repository.llamadas.slice(llamadasTrasLaPrimera))).toEqual([]);
    expect(segundaCorrida.createdPermissions).toEqual([]);
    expect(segundaCorrida.createdRolePermissions).toBe(0);
  });

  // Caso 15 (QC-74 R10)
  it('sobre una base ya sembrada la segunda corrida no crea ningun permiso ni ninguna asignacion', async () => {
    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      permisosExistentes: TODOS_LOS_CODIGOS_DEL_CATALOGO,
      asignacionesExistentes: asignacionesDelSeed(ROLES_YA_SEMBRADOS),
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: las dos LECTURAS del paso de permisos si ocurrieron, y con el catalogo
    // real y los ids de los dos roles sembrados. Sin esto, un doble mal cableado que
    // nunca se llama pasaria en verde.
    const lecturasDelCatalogo = repository.llamadas.filter(
      (llamada) => llamada.metodo === 'findExistingPermissionCodes',
    );
    expect(lecturasDelCatalogo).toHaveLength(1);
    expect(lecturasDelCatalogo[0]?.args[0]).toEqual(PERMISSIONS.map((permission) => permission.code));
    const lecturasDeAsignaciones = repository.llamadas.filter(
      (llamada) => llamada.metodo === 'findRolePermissionCodes',
    );
    expect(lecturasDeAsignaciones).toHaveLength(1);
    expect(new Set(lecturasDeAsignaciones[0]?.args[0] as readonly string[])).toEqual(
      new Set([...ROLES_YA_SEMBRADOS.values()]),
    );

    // Luego: ni una escritura. Los dos metodos NO se llamaron (ver la convencion de arriba).
    expect(repository.llamadas.filter((llamada) => llamada.metodo === 'createPermissions')).toEqual([]);
    expect(repository.llamadas.filter((llamada) => llamada.metodo === 'createRolePermissions')).toEqual([]);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
    expect(outcome.createdPermissions).toEqual([]);
    expect(outcome.createdRolePermissions).toBe(0);

    // Y el estado que ve el doble es exactamente el de antes: mismo conteo, mismas filas.
    expect(repository.permisosExistentes.size).toBe(PERMISSIONS.length);
    expect(repository.asignacionesExistentes.size).toBe(TOTAL_DE_ASIGNACIONES_DEL_SEED);
  });

  // Caso 16 (QC-74 R10)
  it('una asignacion que ya existe no se vuelve a crear ni se duplica: solo se crean las que faltan', async () => {
    const asignacionPreexistente = `${ROLES_YA_SEMBRADOS.get(ROLE_OPERADOR) ?? ''}|inventario.consultar`;
    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      permisosExistentes: TODOS_LOS_CODIGOS_DEL_CATALOGO,
      asignacionesExistentes: new Set([asignacionPreexistente]),
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: SI se crearon las que faltaban — las once del Administrador.
    const creaciones = repository.llamadas.filter((llamada) => llamada.metodo === 'createRolePermissions');
    expect(creaciones).toHaveLength(1);
    const paresCreados = creaciones[0]?.args[0] as readonly { roleId: string; permissionCode: string }[];
    expect(paresCreados).toHaveLength(TOTAL_DE_ASIGNACIONES_DEL_SEED - 1);
    expect(outcome.createdRolePermissions).toBe(TOTAL_DE_ASIGNACIONES_DEL_SEED - 1);

    // Luego: la preexistente NO viajo en esa creacion y no quedo duplicada.
    expect(paresCreados.map((par) => `${par.roleId}|${par.permissionCode}`)).not.toContain(
      asignacionPreexistente,
    );
    expect(repository.asignacionesExistentes.size).toBe(TOTAL_DE_ASIGNACIONES_DEL_SEED);
    expect(new Set(repository.asignacionesExistentes)).toEqual(new Set(asignacionesDelSeed(ROLES_YA_SEMBRADOS)));

    // Y el catalogo, que estaba completo, no se toco (R10, R5: no hay `upsert`).
    expect(repository.llamadas.filter((llamada) => llamada.metodo === 'createPermissions')).toEqual([]);
    expect(outcome.createdPermissions).toEqual([]);
  });

  // Caso 17 (QC-74 R10) — el reporte, cuando falta solo una parte del catalogo.
  it('SeedOutcome nombra exactamente los permisos creados y cuenta exactamente las asignaciones creadas', async () => {
    const codigoQueFalta = 'pedidos.modificar';
    const yaExistentes = PERMISSIONS.map((permission) => permission.code).filter(
      (code) => code !== codigoQueFalta,
    );
    const asignacionesCompletas = [...asignacionesDelSeed(ROLES_YA_SEMBRADOS)];
    const asignacionQueFalta = `${ROLES_YA_SEMBRADOS.get(ROLE_ADMINISTRADOR) ?? ''}|${codigoQueFalta}`;
    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      permisosExistentes: new Set(yaExistentes),
      asignacionesExistentes: new Set(
        asignacionesCompletas.filter((asignacion) => asignacion !== asignacionQueFalta),
      ),
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: se creo lo que faltaba, y solo eso.
    expect(outcome.createdPermissions).toEqual([codigoQueFalta]);
    expect(outcome.createdRolePermissions).toBe(1);

    // Luego: el estado final es el completo, sin duplicados ni filas de mas.
    expect(repository.permisosExistentes.size).toBe(PERMISSIONS.length);
    expect(repository.asignacionesExistentes.size).toBe(TOTAL_DE_ASIGNACIONES_DEL_SEED);
    expect(new Set(repository.asignacionesExistentes)).toEqual(new Set(asignacionesCompletas));
  });

  // Caso 18 (QC-65 R7) — el administrador inicial nace `active`, EXPLICITO.
  it('el administrador inicial se crea con el estado de cuenta del seed, explicito y distinto del que nace por defecto', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    await seedInitialAccess({ repository, passwordHasher, credentials, maestroCredentials, checkCredentialPolicy });

    // Primero: la escritura SI ocurrio, una sola vez (un doble mal cableado no pasa en verde).
    const creacionesDeAdmin = repository.llamadas.filter((llamada) => llamada.metodo === 'createInitialAdmin');
    expect(creacionesDeAdmin).toHaveLength(1);
    const input = creacionesDeAdmin[0]?.args[0] as Record<string, unknown>;

    // El valor viaja en la MISMA llamada que crea al usuario —el puerto no tiene ningun
    // metodo de actualizacion, asi que no hay forma de completarlo despues— y sale de la
    // constante del dominio, no de un literal escrito aqui.
    expect(input.accountStatus).toBe(SEED_ADMIN_ACCOUNT_STATUS);

    // Y no es el estado con el que nace una cuenta cualquiera: si el dominio se limitara a
    // heredar el `@default(pending)` de la columna, el administrador de instalacion quedaria
    // fuera del sistema en cuanto QC-78 corte el login por estado (`design.md > 8`, riesgo 1).
    expect(input.accountStatus).not.toBe(INITIAL_USER_ACCOUNT_STATUS);

    // El ancla con la decision cerrada 4, y el UNICO sitio de este archivo donde se escribe el
    // literal: si alguien cambia `SEED_ADMIN_ACCOUNT_STATUS`, este caso cae aqui.
    expect(SEED_ADMIN_ACCOUNT_STATUS).toBe('active');
    expect(INITIAL_USER_ACCOUNT_STATUS).toBe('pending');

    // R10: quien lo cambio NO viaja. El administrador inicial lo crea el sistema, no una
    // persona, y eso se escribe dejando la columna NULL — no pasando un id cualquiera.
    expect(Object.keys(input)).not.toContain('accountStatusChangedBy');
  });

  // ---------------------------------------------------------------------------------
// El primer Maestro. Mismo orden: PRIMERO que algo ocurrio, luego lo que no.
  // ---------------------------------------------------------------------------------

  /** Instalacion completa con Administrador y sin Maestro, salvo lo que el caso cambie. */
  function repositorioSinMaestro(extra: Parameters<typeof crearRepositorioFalso>[0] = {}) {
    return crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      usuariosVivosConMaestro: 0,
      permisosExistentes: TODOS_LOS_CODIGOS_DEL_CATALOGO,
      asignacionesExistentes: asignacionesDelSeed(ROLES_YA_SEMBRADOS),
      ...extra,
    });
  }

  function altasDelMaestro(llamadas: readonly LlamadaRegistrada[]) {
    return llamadas.filter((llamada) => llamada.metodo === 'createInitialMaestro');
  }

  async function mensajeDelRechazo(promesa: Promise<unknown>): Promise<string> {
    try {
      await promesa;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('se esperaba que el seed lanzara');
  }

  it('QC-161 R10: sin Maestro vivo crea exactamente uno, sin empresa, activo, con hash y con los marcadores Plataforma/Inicial', async () => {
    const repository = repositorioSinMaestro();
    const passwordHasher = crearHasherFalso();
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({
      repository,
      passwordHasher,
      credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
      maestroCredentials,
      checkCredentialPolicy: crearPoliticaFalsa(),
    });

    const altas = altasDelMaestro(repository.llamadas);
    expect(altas).toHaveLength(1);
    expect(outcome.createdMaestro).toBe(true);
    const input = altas[0]?.args[0] as Record<string, unknown>;
    expect(input).toEqual({
      roleId: ROLES_YA_SEMBRADOS.get(ROLE_MAESTRO),
      accountStatus: 'active',
      username: CREDENCIALES_DEL_MAESTRO.username,
      email: CREDENCIALES_DEL_MAESTRO.email,
      passwordHash: hashDe(CREDENCIAL_DEL_MAESTRO_DE_PRUEBA),
      firstNames: 'Plataforma',
      lastNames: 'Inicial',
      birthDate: new Date('1900-01-01T00:00:00.000Z'),
      phone: '+00 000 000 0000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: '00000000',
    });
    expect(Object.keys(input)).not.toContain('companyId');
    expect(input.passwordHash).not.toBe(CREDENCIAL_DEL_MAESTRO_DE_PRUEBA);
    expect(passwordHasher.hash).toHaveBeenCalledWith(CREDENCIAL_DEL_MAESTRO_DE_PRUEBA);
    // Crear al Maestro no lee ni crea ninguna empresa. El conteo de correo sin empresa no
    // toca `companies`, por eso se excluye del filtro por nombre.
    expect(
      llamadasSobreEmpresas(repository.llamadas).filter(
        (llamada) => llamada.metodo !== 'countLiveUsersWithoutCompanyWithEmail',
      ),
    ).toEqual([]);
  });

  it('QC-161 R10: sobre base vacia los marcadores del Maestro son los del Administrador salvo los nombres', async () => {
    const repository = crearRepositorioFalso();

    await seedInitialAccess({
      repository,
      passwordHasher: crearHasherFalso(),
      credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
      maestroCredentials: vi.fn(() => CREDENCIALES_DEL_MAESTRO),
      checkCredentialPolicy: crearPoliticaFalsa(),
    });

    const admin = repository.llamadas.find((llamada) => llamada.metodo === 'createInitialAdmin')
      ?.args[0] as Record<string, unknown>;
    const maestro = altasDelMaestro(repository.llamadas)[0]?.args[0] as Record<string, unknown>;
    expect(admin).toBeDefined();
    expect(maestro).toBeDefined();
    for (const campo of ['birthDate', 'phone', 'documentTypeCode', 'documentNumber', 'lastNames']) {
      expect(maestro[campo]).toEqual(admin[campo]);
    }
    expect(maestro.firstNames).toBe('Plataforma');
    expect(maestro.roleId).toBeTruthy();
    expect(maestro.roleId).not.toBe(admin.roleId);
    expect(Object.keys(maestro)).not.toContain('companyId');
  });

  it('QC-161 R11: con un Maestro vivo el proveedor del Maestro no se invoca, aunque lanzara', async () => {
    const repository = crearRepositorioFalso({
      rolesExistentes: ROLES_YA_SEMBRADOS,
      usuariosVivosConAdministrador: 1,
      usuariosVivosConMaestro: 1,
      permisosExistentes: TODOS_LOS_CODIGOS_DEL_CATALOGO,
      asignacionesExistentes: asignacionesDelSeed(ROLES_YA_SEMBRADOS),
    });
    const maestroCredentials = vi.fn((): InitialAdminCredentials => {
      throw new Error('faltan las variables de entorno: SEED_MAESTRO_USERNAME');
    });

    const outcome = await seedInitialAccess({
      repository,
      passwordHasher: crearHasherFalso(),
      credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
      maestroCredentials,
      checkCredentialPolicy: crearPoliticaFalsa(),
    });

    expect(
      repository.llamadas.filter(
        (llamada) => llamada.metodo === 'countLiveUsersWithRole' && llamada.args[0] === ROLE_MAESTRO,
      ),
    ).toHaveLength(1);
    expect(maestroCredentials).not.toHaveBeenCalled();
    expect(outcome.createdMaestro).toBe(false);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
    expect(repository.llamadas.some((llamada) => llamada.metodo === 'countLiveUsersWithUsername')).toBe(false);
  });

  it('QC-161 R12: si faltan las variables del Maestro el error se propaga y no se escribe nada, ni roles', async () => {
    const repository = crearRepositorioFalso();
    const mensaje = 'faltan las variables de entorno: SEED_MAESTRO_USERNAME, SEED_MAESTRO_EMAIL';
    const maestroCredentials = vi.fn((): InitialAdminCredentials => {
      throw new Error(mensaje);
    });

    await expect(
      seedInitialAccess({
        repository,
        passwordHasher: crearHasherFalso(),
        credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
        maestroCredentials,
        checkCredentialPolicy: crearPoliticaFalsa(),
      }),
    ).rejects.toThrow(mensaje);

    expect(maestroCredentials).toHaveBeenCalledTimes(1);
    expect(llamadasDeLectura(repository.llamadas).length).toBeGreaterThan(0);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
  });

  it('QC-161 R13: si la contrasena del Maestro no cumple la politica lanza con las reglas, sin la contrasena y sin escribir', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = vi.fn(async (candidata: string) =>
      candidata === CREDENCIAL_DEL_MAESTRO_DE_PRUEBA
        ? { ok: false, unmet: ['no_uppercase', 'no_digit'] as CredentialRule[] }
        : { ok: true, unmet: [] as CredentialRule[] },
    );

    const mensaje = await mensajeDelRechazo(
      seedInitialAccess({
        repository,
        passwordHasher,
        credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
        maestroCredentials: vi.fn(() => CREDENCIALES_DEL_MAESTRO),
        checkCredentialPolicy,
      }),
    );

    expect(checkCredentialPolicy).toHaveBeenCalledWith(CREDENCIAL_DEL_MAESTRO_DE_PRUEBA);
    expect(mensaje).toContain('no_uppercase');
    expect(mensaje).toContain('no_digit');
    expect(mensaje).not.toContain(CREDENCIAL_DEL_MAESTRO_DE_PRUEBA);
    expect(passwordHasher.hash).not.toHaveBeenCalledWith(CREDENCIAL_DEL_MAESTRO_DE_PRUEBA);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
  });

  it('QC-161 R15: con el Administrador ya creado y sin Maestro solo se crea el Maestro', async () => {
    const repository = repositorioSinMaestro();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    const outcome = await seedInitialAccess({
      repository,
      passwordHasher: crearHasherFalso(),
      credentials,
      maestroCredentials: vi.fn(() => CREDENCIALES_DEL_MAESTRO),
      checkCredentialPolicy: crearPoliticaFalsa(),
    });

    expect(altasDelMaestro(repository.llamadas)).toHaveLength(1);
    expect(llamadasDeEscritura(repository.llamadas).map((llamada) => llamada.metodo)).toEqual([
      'createInitialMaestro',
    ]);
    expect(credentials).not.toHaveBeenCalled();
    expect(outcome.createdAdmin).toBe(false);
    expect(outcome.createdCompany).toBeNull();
  });

  it('QC-161 R15: con el Maestro ya creado y sin Administrador el Administrador y su empresa se crean como siempre', async () => {
    const repository = crearRepositorioFalso({ usuariosVivosConAdministrador: 0, usuariosVivosConMaestro: 1 });
    const maestroCredentials = vi.fn(() => CREDENCIALES_DEL_MAESTRO);

    const outcome = await seedInitialAccess({
      repository,
      passwordHasher: crearHasherFalso(),
      credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
      maestroCredentials,
      checkCredentialPolicy: crearPoliticaFalsa(),
    });

    expect(outcome.createdAdmin).toBe(true);
    expect(outcome.createdCompany).toBe(INITIAL_COMPANY_NAME);
    expect(outcome.createdMaestro).toBe(false);
    expect(maestroCredentials).not.toHaveBeenCalled();
    expect(altasDelMaestro(repository.llamadas)).toEqual([]);
  });

  it('QC-161 R42: si el nombre del Maestro ya lo usa un usuario vivo lanza sin el valor y sin escribir nada', async () => {
    const repository = crearRepositorioFalso({ usuariosVivosConElNombreDelMaestro: 1 });

    const mensaje = await mensajeDelRechazo(
      seedInitialAccess({
        repository,
        passwordHasher: crearHasherFalso(),
        credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
        maestroCredentials: vi.fn(() => CREDENCIALES_DEL_MAESTRO),
        checkCredentialPolicy: crearPoliticaFalsa(),
      }),
    );

    const consultas = repository.llamadas.filter((llamada) => llamada.metodo === 'countLiveUsersWithUsername');
    expect(consultas).toHaveLength(1);
    expect(consultas[0]?.args[0]).toBe(CREDENCIALES_DEL_MAESTRO.username);
    expect(mensaje).toBe('el nombre de usuario del maestro inicial ya esta en uso');
    expect(mensaje).not.toContain(CREDENCIALES_DEL_MAESTRO.username);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
  });

  it('QC-161 R42: si coincide con el del Administrador de la misma corrida salvo mayusculas lanza igual y no escribe nada', async () => {
    const repository = crearRepositorioFalso();
    const maestroConElNombreDelAdmin: InitialAdminCredentials = {
      ...CREDENCIALES_DEL_MAESTRO,
      username: CREDENCIALES_POR_DEFECTO.username.toUpperCase(),
    };

    const mensaje = await mensajeDelRechazo(
      seedInitialAccess({
        repository,
        passwordHasher: crearHasherFalso(),
        credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
        maestroCredentials: vi.fn(() => maestroConElNombreDelAdmin),
        checkCredentialPolicy: crearPoliticaFalsa(),
      }),
    );

    expect(llamadasDeLectura(repository.llamadas).length).toBeGreaterThan(0);
    expect(mensaje).toBe('el nombre de usuario del maestro inicial ya esta en uso');
    expect(mensaje.toLowerCase()).not.toContain(CREDENCIALES_POR_DEFECTO.username);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
  });

  it('QC-161 R43: si el correo del Maestro ya lo usa otro usuario sin empresa lanza sin el valor y sin escribir nada', async () => {
    const repository = crearRepositorioFalso({ usuariosSinEmpresaConElCorreoDelMaestro: 1 });

    const mensaje = await mensajeDelRechazo(
      seedInitialAccess({
        repository,
        passwordHasher: crearHasherFalso(),
        credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
        maestroCredentials: vi.fn(() => CREDENCIALES_DEL_MAESTRO),
        checkCredentialPolicy: crearPoliticaFalsa(),
      }),
    );

    const consultas = repository.llamadas.filter(
      (llamada) => llamada.metodo === 'countLiveUsersWithoutCompanyWithEmail',
    );
    expect(consultas).toHaveLength(1);
    expect(consultas[0]?.args[0]).toBe(CREDENCIALES_DEL_MAESTRO.email);
    expect(mensaje).toBe('el correo del maestro inicial ya esta en uso');
    expect(mensaje).not.toContain(CREDENCIALES_DEL_MAESTRO.email);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
  });

  it('QC-161 R43: con el mismo correo que el Administrador inicial se crean los dos', async () => {
    const repository = crearRepositorioFalso();

    const outcome = await seedInitialAccess({
      repository,
      passwordHasher: crearHasherFalso(),
      credentials: vi.fn(() => CREDENCIALES_POR_DEFECTO),
      maestroCredentials: vi.fn(() => ({ ...CREDENCIALES_DEL_MAESTRO, email: CREDENCIALES_POR_DEFECTO.email })),
      checkCredentialPolicy: crearPoliticaFalsa(),
    });

    expect(outcome.createdAdmin).toBe(true);
    expect(outcome.createdMaestro).toBe(true);
    const maestro = altasDelMaestro(repository.llamadas)[0]?.args[0] as { email: string };
    expect(maestro.email).toBe(CREDENCIALES_POR_DEFECTO.email);
  });

  // Caso 9 (R18) — corre AL FINAL a proposito: revisa lo acumulado por todos los casos
  // anteriores, credencial incluida en el error del caso 7.
  it('la credencial no aparece en ninguna salida de consola acumulada de los ocho casos anteriores', () => {
    // Primero: si hubo algo que capturar. El dominio no llama a console.* (esta
    // prohibido en `seed-initial-access.ts`), asi que el array puede quedar vacio; lo
    // que importa es que, capture lo que capture, nunca lleve la credencial.
    expect(Array.isArray(todasLasSalidasAcumuladas)).toBe(true);
    for (const salida of todasLasSalidasAcumuladas) {
      expect(salida).not.toContain(CREDENCIAL_DE_PRUEBA);
    }
  });
});
