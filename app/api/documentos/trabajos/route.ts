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
 * ===========================================================================================
 * AQUI SE AJUSTA EL PLAZO DEL TRABAJO. Es el unico sitio: se cambia el numero de la linea de
 * abajo y se vuelve a desplegar.
 * ===========================================================================================
 *
 * Cuanto puede correr el trabajo antes de que la plataforma lo mate, en segundos. Cubre el
 * recorrido ENTERO de una entrega: reclamar la fila, bajar el PDF, convertirlo y llamar a la IA.
 *
 * QUE VALORES VALEN
 *
 * - 300 es el valor actual, y tambien el DEFECTO de Vercel: tal cual esta, esto no cambia el
 *   comportamiento. Lo hace explicito y deja un solo sitio donde subirlo.
 * - 800 es el TECHO en Pro y Enterprise. Se declara en `MAX_JOB_MAX_DURATION_SECONDS`, y la
 *   guardia falla si este numero lo pasa.
 * - En Hobby el maximo ES 300: ahi subirlo no hace nada.
 *
 * TRES COSAS QUE HAY QUE SABER ANTES DE TOCARLO
 *
 * 1. **Tiene que ser un LITERAL.** No se puede leer de `.env` ni calcular. Next extrae este campo
 *    analizando el archivo estaticamente y, si no puede, ROMPE EL BUILD con «Invalid segment
 *    configuration export detected». Comprobado el 2026-09-21: con el literal, `next build` sale
 *    con exit 0 y emite `.next/server/functions-config-manifest.json` con el valor; con
 *    `process.env`, exit 1 y ningun manifiesto.
 * 2. **Hay que volver a DESPLEGAR.** Vercel toma el plazo del output de compilacion, no de una
 *    variable en ejecucion. Para variar el plazo POR ENTORNO la via es `vercel.json > functions`
 *    o el ajuste del proyecto, nunca este archivo.
 * 3. **Subir el techo no acota el trabajo.** Lo caro es rasterizar hasta `MAX_PDF_PAGES` paginas
 *    a `PAGE_RENDER_DPI`, y eso no tiene plazo propio -el de 60s de la IA empieza despues-. Si el
 *    trabajo se pasa de este numero, la fila se queda en `processing` y los reintentos de la cola
 *    NO la reclaman, porque `claim` exige `status = 'queued'`; solo la cierra `expireStale` al
 *    cabo de `DOCUMENT_PROCESSING_TIMEOUT_SECONDS`. Subir el plazo compra tiempo; no arregla eso.
 */
export const maxDuration = 300;
