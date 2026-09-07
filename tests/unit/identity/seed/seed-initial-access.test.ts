// T9 — El caso de uso del seed, entero y con puertos falsos (`design.md > 5.2` y `> 11`).
// Cubre R2, R3, R4, R7, R8, R9, R12, R13, R15, R17, R18. Sin base de datos y sin bcrypt
// real: lo que se prueba aqui es la DECISION del dominio (que crea, que no toca, cuando
// lee el entorno). El adaptador Prisma real tiene su propia tanda de integracion.
//
// Cada caso afirma PRIMERO que ocurrio algo (numero de llamadas esperado > 0) antes de
// afirmar que el resto no ocurrio: un doble mal cableado que no recibe nada no debe
// pasar en verde (`design.md > 11`, «la trampa que este repo ya piso dos veces»).

import { INITIAL_COMPANY_NAME } from '@/lib/modules/identity/domain/companies';
import { normalizeCompanyName } from '@/lib/modules/identity/domain/company-name';
import { DOCUMENT_TYPE_CC } from '@/lib/modules/identity/domain/document-type';
import { ROLE_ADMINISTRADOR, ROLE_OPERADOR, SEED_ROLES } from '@/lib/modules/identity/domain/roles';
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
} = {}): InitialAccessRepository & {
  readonly llamadas: LlamadaRegistrada[];
  /** Estado de `companies` tal como lo ve el doble, para poder afirmar QUE id se reutilizo. */
  readonly empresasVivas: ReadonlyMap<string, string>;
} {
  const llamadas: LlamadaRegistrada[] = [];
  const rolesExistentes = new Map(options.rolesExistentes ?? []);
  const usuariosVivosConAdministrador = options.usuariosVivosConAdministrador ?? 0;
  const empresasVivas = new Map(options.empresasVivas ?? []);
  let siguienteIdDeRol = rolesExistentes.size + 1;
  let siguienteIdDeEmpresa = empresasVivas.size + 1;

  return {
    llamadas,
    empresasVivas,
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
      return roleName === ROLE_ADMINISTRADOR ? usuariosVivosConAdministrador : 0;
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
    async createInitialAdmin(input) {
      llamadas.push({ metodo: 'createInitialAdmin', args: [input] });
      return { id: 'usuario-inicial-1' };
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
      llamada.metodo === 'createInitialAdmin',
  );
}

/** Llamadas de LECTURA (las dos del paso 1 del algoritmo). */
function llamadasDeLectura(llamadas: readonly LlamadaRegistrada[]): readonly LlamadaRegistrada[] {
  return llamadas.filter(
    (llamada) => llamada.metodo === 'findRoleIdsByName' || llamada.metodo === 'countLiveUsersWithRole',
  );
}

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
    }
  });

  // Caso 1 (R2, R4)
  it('sobre una base vacia crea los dos roles y el usuario inicial con rol Administrador', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

    expect(repository.llamadas.length).toBeGreaterThan(0);
    expect(outcome.createdRoles.slice().sort()).toEqual([ROLE_ADMINISTRADOR, ROLE_OPERADOR].sort());
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

    await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

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

    await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

    expect(passwordHasher.hash).toHaveBeenCalledTimes(1);
    expect(passwordHasher.hash).toHaveBeenCalledWith(CREDENCIAL_DE_PRUEBA);

    const creacionDeAdmin = repository.llamadas.find((llamada) => llamada.metodo === 'createInitialAdmin');
    expect(creacionDeAdmin).toBeDefined();
    const input = creacionDeAdmin?.args[0] as { passwordHash: string };
    expect(input.passwordHash).toBe(hashDe(CREDENCIAL_DE_PRUEBA));
    expect(input.passwordHash).not.toBe(CREDENCIAL_DE_PRUEBA);
  });

  // Caso 4 (R2)
  it('si el rol Operador falta y el Administrador ya existe, crea solo Operador', async () => {
    const repository = crearRepositorioFalso({
      rolesExistentes: new Map([[ROLE_ADMINISTRADOR, 'rol-admin-existente']]),
      usuariosVivosConAdministrador: 1,
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

    const creacionesDeRol = repository.llamadas.filter((llamada) => llamada.metodo === 'createRole');
    expect(creacionesDeRol.length).toBeGreaterThan(0);
    expect(outcome.createdRoles).toEqual([ROLE_OPERADOR]);
    expect(creacionesDeRol).toHaveLength(1);
    expect((creacionesDeRol[0]?.args[0] as { name: string }).name).toBe(ROLE_OPERADOR);
  });

  // Caso 5 (R12)
  it('si ya existe un administrador vivo, el proveedor de credenciales no se invoca ni una vez', async () => {
    const repository = crearRepositorioFalso({
      rolesExistentes: new Map(SEED_ROLES.map((role, index) => [role.name, `rol-${index}`])),
      usuariosVivosConAdministrador: 1,
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

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
      rolesExistentes: new Map(SEED_ROLES.map((role, index) => [role.name, `rol-${index}`])),
      usuariosVivosConAdministrador: 1,
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

    expect(llamadasDeLectura(repository.llamadas).length).toBeGreaterThan(0);
    expect(llamadasDeEscritura(repository.llamadas)).toEqual([]);
    // El puerto no tiene ningun metodo de actualizacion que pudiera haberse llamado.
    expect(
      repository.llamadas.every(
        (llamada) => llamada.metodo === 'findRoleIdsByName' || llamada.metodo === 'countLiveUsersWithRole',
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

    await expect(seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy })).rejects.toThrow(
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
      await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });
    } catch (error) {
      errorCapturado = error as Error;
    }
    expect(errorCapturado).not.toBeNull();
    expect(errorCapturado?.message ?? '').not.toContain(CREDENCIAL_DE_PRUEBA);
    expect(errorCapturado?.stack ?? '').not.toContain(CREDENCIAL_DE_PRUEBA);
  });

  // Caso 7b (R13) — por que los pasos 4 y 5 tienen que ir en una transaccion.
  it('si createInitialAdmin lanza DESPUES de crear los roles, los dos roles ya quedaron creados y el error se propaga', async () => {
    const repository = crearRepositorioFalso();
    const mensajeDeError = 'fallo simulado del alta del usuario inicial';
    repository.createInitialAdmin = async () => {
      throw new Error(mensajeDeError);
    };
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    let errorCapturado: Error | null = null;
    try {
      await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });
    } catch (error) {
      errorCapturado = error as Error;
    }

    // Primero: que los roles SI se crearon (los dos, exactamente). Ocurrio ANTES de
    // afirmar cualquier otra cosa, siguiendo el orden de `design.md > 11`.
    const creacionesDeRol = repository.llamadas.filter((llamada) => llamada.metodo === 'createRole');
    expect(creacionesDeRol).toHaveLength(2);

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

    await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

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

    let errorCapturado: Error | null = null;
    try {
      await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });
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

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

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
    expect(repository.llamadas.at(-1)?.metodo).toBe('createInitialAdmin');

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

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

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
      rolesExistentes: new Map(SEED_ROLES.map((role, index) => [role.name, `rol-${index}`])),
      usuariosVivosConAdministrador: 1,
      empresasVivas: new Map([[NOMBRE_NORMALIZADO_DE_LA_EMPRESA_INICIAL, 'empresa-preexistente']]),
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

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
      rolesExistentes: new Map(SEED_ROLES.map((role, index) => [role.name, `rol-${index}`])),
      usuariosVivosConAdministrador: 1,
    });
    const passwordHasher = crearHasherFalso();
    const checkCredentialPolicy = crearPoliticaFalsa();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials, checkCredentialPolicy });

    // Primero: la lectura SI ocurrio, exactamente una vez y con el nombre del rol
    // Administrador. Es la unica fuente de `needsAdmin`.
    const conteos = repository.llamadas.filter((llamada) => llamada.metodo === 'countLiveUsersWithRole');
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
      checkCredentialPolicy: crearPoliticaFalsa(),
    });
    expect(otroDesenlace.createdAdmin).toBe(true);
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
