/**
 * El Route Handler del proceso diario. La logica vive en el adaptador driving; aqui solo se
 * enchufa y se declara la configuracion de segmento.
 *
 * **LAS DOS CONSTANTES SE DECLARAN AQUI Y CON UN LITERAL. No es estilo, es lo unico que Next
 * acepta** (`tests/unit/documentos/route-segment-config.test.ts` lo descubrio sobre otra ruta y
 * lo vigila aqui igual):
 *
 * 1. NO se pueden REEXPORTAR. `export { runtime } from '...'` hace fallar el build entero con
 *    «can't recognize the exported `runtime` field in route. It mustn't be reexported».
 * 2. NO pueden salir de una expresion. Next extrae estos campos analizando el archivo
 *    ESTATICAMENTE, asi que `process.env` no vale: quedaria una variable que aparenta configurar
 *    algo y no configura nada, corriendo en realidad con el defecto de la plataforma.
 */
export { GET } from '@/lib/modules/pedidos/adapters/driving/order-expiry-cron-route';

/** `timingSafeEqual` de `node:crypto` exige este runtime; el edge no lo carga. */
export const runtime = 'nodejs';

/**
 * Cuanto puede correr el proceso antes de que la plataforma lo mate, en segundos. El
 * presupuesto interno del caso de uso es de 240 s (`expire-stale-orders.ts`); este numero deja
 * margen para el resto del recorrido -verificar el secreto y responder- sin acercarse al techo
 * de 300 s de Vercel Hobby.
 */
export const maxDuration = 300;
