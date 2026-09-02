import type {
  InitialAdminCredentials,
  InitialAdminCredentialsProvider,
} from '../../../ports/initial-access-credentials';

/**
 * Adaptador driven del puerto `InitialAdminCredentialsProvider` (`design.md > 5`, T10).
 * Lee las tres variables `SEED_ADMIN_*` del entorno **en el momento en que se invoca**,
 * nunca antes: el dominio solo llama a esto cuando ya decidio que hay que crear el
 * usuario inicial (R12).
 *
 * Los tres nombres de variable viven UNICAMENTE como elementos de este arreglo, cadenas
 * literales en posicion de valor (`design.md > 2`, consecuencia 2): ningun identificador
 * declarado en este archivo los repite, que es lo que mantiene verde
 * `tests/guards/guard-password-never-plaintext.test.ts`.
 */
const REQUIRED_ENV_VAR_NAMES = ['SEED_ADMIN_USERNAME', 'SEED_ADMIN_PASSWORD', 'SEED_ADMIN_EMAIL'] as const;

/**
 * Lee una variable de entorno por su nombre. Vacia o solo-espacios cuenta como ausente
 * (R13). Devuelve el valor SIN recortar: no es asunto de este adaptador normalizar lo
 * que alguien escribio, solo decidir si "hay algo" o no lo hay.
 */
function readRequiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${name}`);
  }
  return raw;
}

/**
 * Resuelve las tres variables por posicion (no por nombre de propiedad, para no volver a
 * escribir ninguno de los tres nombres como identificador). Si falta una o varias, el
 * error las nombra todas juntas y nunca incluye ningun valor (R18).
 */
export const readInitialAdminCredentialsFromEnv: InitialAdminCredentialsProvider =
  (): InitialAdminCredentials => {
    const missing: string[] = [];
    const resolved: string[] = [];

    for (const name of REQUIRED_ENV_VAR_NAMES) {
      try {
        resolved.push(readRequiredEnv(name));
      } catch {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      throw new Error(`faltan las variables de entorno: ${missing.join(', ')}`);
    }

    const [username, credential, email] = resolved as [string, string, string];
    return { username, credential, email };
  };
