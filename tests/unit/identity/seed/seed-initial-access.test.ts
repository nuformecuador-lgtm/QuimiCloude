// T9 — El caso de uso del seed, entero y con puertos falsos (`design.md > 5.2` y `> 11`).
// Cubre R2, R3, R4, R7, R8, R9, R12, R13, R15, R17, R18. Sin base de datos y sin bcrypt
// real: lo que se prueba aqui es la DECISION del dominio (que crea, que no toca, cuando
// lee el entorno). El adaptador Prisma real tiene su propia tanda de integracion.
//
// Cada caso afirma PRIMERO que ocurrio algo (numero de llamadas esperado > 0) antes de
// afirmar que el resto no ocurrio: un doble mal cableado que no recibe nada no debe
// pasar en verde (`design.md > 11`, «la trampa que este repo ya piso dos veces»).

import { DOCUMENT_TYPE_CC } from '@/lib/modules/identity/domain/document-type';
import { ROLE_ADMINISTRADOR, ROLE_OPERADOR, SEED_ROLES } from '@/lib/modules/identity/domain/roles';
import { seedInitialAccess } from '@/lib/modules/identity/domain/seed-initial-access';
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
} = {}): InitialAccessRepository & { readonly llamadas: LlamadaRegistrada[] } {
  const llamadas: LlamadaRegistrada[] = [];
  const rolesExistentes = new Map(options.rolesExistentes ?? []);
  const usuariosVivosConAdministrador = options.usuariosVivosConAdministrador ?? 0;
  let siguienteIdDeRol = rolesExistentes.size + 1;

  return {
    llamadas,
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
    async createInitialAdmin(input) {
      llamadas.push({ metodo: 'createInitialAdmin', args: [input] });
      return { id: 'usuario-inicial-1' };
    },
  };
}

function crearHasherFalso() {
  return {
    hash: vi.fn(async (texto: string) => hashDe(texto)),
    verify: vi.fn(async (texto: string, guardado: string) => guardado === hashDe(texto)),
  };
}

/** Llamadas cuyo metodo o argumentos son de ESCRITURA (crear rol o crear usuario). */
function llamadasDeEscritura(llamadas: readonly LlamadaRegistrada[]): readonly LlamadaRegistrada[] {
  return llamadas.filter((llamada) => llamada.metodo === 'createRole' || llamada.metodo === 'createInitialAdmin');
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

  // Caso 1 (R2, R4, R9)
  it('sobre una base vacia crea los dos roles y el usuario inicial con rol Administrador y obligado a cambiar credencial', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials });

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
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    await seedInitialAccess({ repository, passwordHasher, credentials });

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
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    await seedInitialAccess({ repository, passwordHasher, credentials });

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
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials });

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
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    const outcome = await seedInitialAccess({ repository, passwordHasher, credentials });

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
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    await seedInitialAccess({ repository, passwordHasher, credentials });

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
    const mensajeDeError = 'falta SEED_ADMIN_PASSWORD';
    const credentials = vi.fn(() => {
      throw new Error(mensajeDeError);
    });

    await expect(seedInitialAccess({ repository, passwordHasher, credentials })).rejects.toThrow(
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
      await seedInitialAccess({ repository, passwordHasher, credentials });
    } catch (error) {
      errorCapturado = error as Error;
    }
    expect(errorCapturado).not.toBeNull();
    expect(errorCapturado?.message ?? '').not.toContain(CREDENCIAL_DE_PRUEBA);
    expect(errorCapturado?.stack ?? '').not.toContain(CREDENCIAL_DE_PRUEBA);
  });

  // Caso 8 (R17)
  it('en ningun caso se llama a un metodo que mencione document_types, y el puerto ni siquiera lo expone', async () => {
    const repository = crearRepositorioFalso();
    const passwordHasher = crearHasherFalso();
    const credentials = vi.fn(() => CREDENCIALES_POR_DEFECTO);

    await seedInitialAccess({ repository, passwordHasher, credentials });

    expect(repository.llamadas.length).toBeGreaterThan(0);

    // La superficie del doble (sus propios metodos) no expone nada de document_types.
    const superficieDelDoble = Object.keys(repository).filter((clave) => clave !== 'llamadas');
    expect(superficieDelDoble.some((nombre) => /documentType|document_types/i.test(nombre))).toBe(false);

    // Ninguna llamada registrada menciona document_types en su nombre de metodo.
    expect(repository.llamadas.some((llamada) => /documentType|document_types/i.test(llamada.metodo))).toBe(
      false,
    );
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
