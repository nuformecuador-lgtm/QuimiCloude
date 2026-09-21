/**
 * El Route Handler del webhook de la cola. La logica vive en el adaptador driving; aqui solo se
 * enchufa y se declara la configuracion de segmento.
 *
 * **LAS DOS CONSTANTES SE DECLARAN AQUI Y CON UN LITERAL. No es estilo, es lo unico que Next
 * acepta**, y las dos mitades de esa frase se comprobaron compilando el 2026-09-21:
 *
 * 1. NO se pueden REEXPORTAR. `export { runtime } from '...'` hacia fallar el build entero con
 *    «can't recognize the exported `runtime` field in route. It mustn't be reexported».
 * 2. NO pueden salir de una expresion. Next extrae estos campos analizando el archivo
 *    ESTATICAMENTE, asi que `process.env` no vale: quedaria una variable que aparenta configurar
 *    algo y no configura nada, corriendo en realidad con el defecto de la plataforma.
 *
 * Para variar el plazo por entorno la via es `vercel.json > functions` o el ajuste del proyecto,
 * NO una variable de `.env`.
 *
 * `tests/unit/documentos/route-segment-config.test.ts` lo hace cumplir.
 */
export { POST } from '@/lib/modules/documentos/adapters/driving/document-job-route';

/** El procesamiento usa un binario nativo para convertir el PDF, y el runtime edge no lo carga. */
export const runtime = 'nodejs';

/**
 * Cuanto puede correr el trabajo antes de que la plataforma lo mate, en segundos.
 *
 * 300 es tambien el defecto de Vercel, asi que esto no cambia el comportamiento: lo hace
 * EXPLICITO y da un solo sitio donde subirlo. El techo es 800 en Pro y Enterprise
 * (`MAX_JOB_MAX_DURATION_SECONDS`); en Hobby el maximo ES 300.
 */
export const maxDuration = 300;
