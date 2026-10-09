/**
 * Comprobacion previa del scope Preview de Vercel (QC-249, design.md > 4), pura: recibe el entorno
 * como dato y no lee `process.env` por su cuenta.
 *
 * Node puro y sin imports de `lib/`: lo importa `scripts/build.mjs`, que corre antes de que exista
 * nada generado, y tambien la guarda del seed de demostracion.
 *
 * La base de preview se reconoce por el Reference ID del proyecto de Supabase, no por el host: el
 * pooler comparte host entre proyectos. El ID tiene que tener su forma (20 letras minusculas) y
 * estar en su posicion dentro de cada URL (enmienda de R9, 2026-10-09). El ID vive solo en el scope Preview de Vercel, nunca en el
 * repo (es publico).
 *
 * Ningun mensaje lleva un valor: solo el nombre de la variable y la regla que no cumple.
 */

/** Nombre de la variable con el identificador del proyecto de Supabase de preview. */
export const VARIABLE_REF_DE_PREVIEW = 'PREVIEW_SUPABASE_REF';

/** Las URL que tienen que apuntar al proyecto de preview antes de migrar o sembrar. */
const URLS_DE_PREVIEW = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_STORAGE_URL'];

const TRANSPORTE_DE_CORREO = 'MAIL_TRANSPORT';
const TRANSPORTE_APAGADO = 'desactivado';

/**
 * Variables que tienen que tener valor en preview. La de los dobles de documentos se nombra como
 * elemento de arreglo y se lee por indice: este modulo nunca la pone.
 */
const CON_VALOR = ['DOCUMENTS_E2E_DOUBLES'];

/** Credenciales que tienen que estar vacias o ausentes en preview: sin ellas nada sale fuera. */
const SIN_VALOR = ['RESEND_API_KEY', 'SMTP_PASS', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'QSTASH_TOKEN'];

/**
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {string} nombre
 * @returns {string} el valor sin espacios a los lados, o '' si falta
 */
function leer(env, nombre) {
  return (env[nombre] ?? '').trim();
}

/**
 * Forma del Reference ID de un proyecto de Supabase: exactamente 20 letras minusculas. Un valor con
 * otra forma (`supabase`, `postgres`, un ID truncado) apareceria en cualquier URL de Supabase y
 * dejaria pasar las de produccion (enmienda de R9, 2026-10-09, m1 del review).
 */
const FORMA_DEL_REF = /^[a-z]{20}$/;

/**
 * @param {string} valor
 * @returns {URL | null} la URL, o null si no se puede leer
 */
function comoUrl(valor) {
  try {
    return new URL(valor);
  } catch {
    return null;
  }
}

/**
 * Base de datos: el ref va como usuario del pooler (`postgres.<ref>`, transaction 6543 o session
 * 5432) o en el host directo (`db.<ref>.supabase.co`). En cualquier otro sitio (nombre de la base,
 * parametros) no cuenta.
 * @param {string} valor
 * @param {string} ref
 * @returns {boolean}
 */
function baseDelProyecto(valor, ref) {
  const url = comoUrl(valor);
  if (url === null) return false;
  return url.username === `postgres.${ref}` || url.hostname.toLowerCase() === `db.${ref}.supabase.co`;
}

/**
 * Storage: el ref es el host (`https://<ref>.supabase.co`).
 * @param {string} valor
 * @param {string} ref
 * @returns {boolean}
 */
function storageDelProyecto(valor, ref) {
  const url = comoUrl(valor);
  return url !== null && url.hostname.toLowerCase() === `${ref}.supabase.co`;
}

/**
 * Donde tiene que estar el ref en cada variable. Una variable sin regla no cumple nunca: se falla
 * hacia el lado seguro.
 * @type {Readonly<Record<string, (valor: string, ref: string) => boolean>>}
 */
const POSICION_DEL_REF = {
  DATABASE_URL: baseDelProyecto,
  DIRECT_URL: baseDelProyecto,
  SUPABASE_STORAGE_URL: storageDelProyecto,
};

/**
 * ¿Apuntan estas variables al proyecto de preview? Exige que `PREVIEW_SUPABASE_REF` tenga la forma
 * de un Reference ID y que cada variable nombrada lo lleve en su posicion reconocida
 * (`POSICION_DEL_REF`), no como subcadena suelta.
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {readonly string[]} nombres
 * @returns {{ ok: true } | { ok: false, variables: string[] }} nombres que no cumplen, nunca valores
 */
export function apuntanAPreview(env, nombres) {
  const ref = leer(env, VARIABLE_REF_DE_PREVIEW);
  if (!FORMA_DEL_REF.test(ref)) return { ok: false, variables: [VARIABLE_REF_DE_PREVIEW] };
  const variables = nombres.filter((nombre) => {
    const enPosicion = Object.hasOwn(POSICION_DEL_REF, nombre) ? POSICION_DEL_REF[nombre] : null;
    return enPosicion === null || !enPosicion(leer(env, nombre), ref);
  });
  return variables.length === 0 ? { ok: true } : { ok: false, variables };
}

/**
 * Todo lo que tiene que cumplir el scope Preview antes de construir: base y storage de preview, y
 * ningun efecto fuera de la app (correo, IA, cola).
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {{ ok: true } | { ok: false, problemas: string[] }} una linea por variable, sin valores
 */
export function comprobarEntornoDePreview(env) {
  const problemas = [];

  const base = apuntanAPreview(env, URLS_DE_PREVIEW);
  if (!base.ok) {
    for (const nombre of base.variables) {
      problemas.push(
        nombre === VARIABLE_REF_DE_PREVIEW
          ? `${nombre} debe tener el Reference ID del proyecto de Supabase de preview (20 letras minusculas)`
          : `${nombre} debe apuntar al proyecto de preview (${VARIABLE_REF_DE_PREVIEW} no esta en su posicion: usuario del pooler, host directo o host de storage)`,
      );
    }
  }

  if (leer(env, TRANSPORTE_DE_CORREO) !== TRANSPORTE_APAGADO) {
    problemas.push(`${TRANSPORTE_DE_CORREO} debe ser "${TRANSPORTE_APAGADO}" en preview`);
  }
  for (const nombre of CON_VALOR) {
    if (leer(env, nombre) === '') problemas.push(`${nombre} debe tener valor en preview`);
  }
  for (const nombre of SIN_VALOR) {
    if (leer(env, nombre) !== '') problemas.push(`${nombre} debe estar vacia en preview`);
  }

  return problemas.length === 0 ? { ok: true } : { ok: false, problemas };
}
