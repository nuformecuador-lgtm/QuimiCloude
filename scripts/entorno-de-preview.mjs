/**
 * Comprobacion previa del scope Preview de Vercel (QC-249, design.md > 4), pura: recibe el entorno
 * como dato y no lee `process.env` por su cuenta.
 *
 * Node puro y sin imports de `lib/`: lo importa `scripts/build.mjs`, que corre antes de que exista
 * nada generado, y tambien la guarda del seed de demostracion.
 *
 * La base de preview se reconoce por el Reference ID del proyecto de Supabase, no por el host: el
 * pooler comparte host entre proyectos. El ID vive solo en el scope Preview de Vercel, nunca en el
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
 * ¿Apuntan estas variables al proyecto de preview? Exige que `PREVIEW_SUPABASE_REF` tenga valor y
 * que cada variable nombrada lo contenga.
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {readonly string[]} nombres
 * @returns {{ ok: true } | { ok: false, variables: string[] }} nombres que no cumplen, nunca valores
 */
export function apuntanAPreview(env, nombres) {
  const ref = leer(env, VARIABLE_REF_DE_PREVIEW);
  if (ref === '') return { ok: false, variables: [VARIABLE_REF_DE_PREVIEW] };
  const variables = nombres.filter((nombre) => !(env[nombre] ?? '').includes(ref));
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
          ? `${nombre} debe tener el Reference ID del proyecto de Supabase de preview`
          : `${nombre} debe apuntar al proyecto de preview (no contiene ${VARIABLE_REF_DE_PREVIEW})`,
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
