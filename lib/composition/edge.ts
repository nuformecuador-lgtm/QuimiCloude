// lib/composition/edge.ts — CABLEADO QUE PUEDE CORRER EN EL BORDE (`design.md > 5`).
//
// Sigue habiendo **un solo punto de composicion**: este archivo no es un segundo sitio donde se
// eligen implementaciones, es la mitad de `lib/composition` que el runtime del borde puede
// cargar. `guard-arquitectura-modulos` autoriza el import de adaptadores driven a toda la
// carpeta `lib/composition/**` por PREFIJO —no por archivo—, asi que la frontera no se ensancha
// ni hay regla que tocar (R21).
//
// Por que no vale `lib/composition/index.ts`: ese archivo cablea los adaptadores Prisma, y basta
// importarlo desde `middleware.ts` para arrastrar `@prisma/client` al bundle del borde, donde no
// carga (R4, R15). La separacion es por lo que cada archivo ARRASTRA, no por gusto.
//
// Aqui solo puede entrar lo que no toque `next/headers`, `node:crypto`, Prisma ni el cliente
// compartido de base. `tests/guards/guard-middleware-edge.test.ts` lo hace cumplir recorriendo el
// cierre de imports desde `middleware.ts`, asi que un import prohibido no se queda en la revision:
// pone el gate en rojo.
import {
  SESSION_COOKIE_NAME,
  readSessionSecret,
  verifySessionValue,
} from '@/lib/modules/identity/adapters/driven/session/session-token';
import type { SessionTokenVerifier } from '@/lib/modules/identity/ports/session-token-verifier';
import { REQUEST_ID_HEADER, newRequestId } from '@/lib/modules/observabilidad';

/**
 * El verificador de la cookie tal y como lo ve el borde. `readSessionSecret()` se llama DENTRO de
 * `verify` y no al cablear: leerlo al cargar el modulo romperia el build (no hay entorno de
 * ejecucion) y dejaria el fallo cerrado de R18 sin forma de probarse. Que lance cuando el secreto
 * falta es parte del contrato: quien lo captura y traduce a «sin sesion» es el adaptador driving.
 */
const sessionTokenVerifier: SessionTokenVerifier = {
  cookieName: SESSION_COOKIE_NAME,
  verify: (raw) => verifySessionValue(raw, readSessionSecret()),
};

/** Fachada edge-safe del modulo `identity`. Hoy la consume solo el middleware. */
export const identityEdge = { sessionTokenVerifier } as const;

/**
 * Fachada edge-safe del modulo `observabilidad` (QC-71 T3). La consume el mismo adaptador
 * driving que ya ocupa el middleware: el borde no conoce `lib/modules/observabilidad/domain/**`,
 * conoce esta fachada.
 *
 * No arrastra nada: `newRequestId` usa el global `crypto.randomUUID()` y su archivo no declara
 * ningun `import` (R2, R3). Por eso ampliar este archivo no acerca ni un paquete prohibido al
 * cierre del borde, y `guard-middleware-edge` lo sigue demostrando sin que haya que tocarla.
 */
export const observabilidadEdge = {
  newRequestId,
  requestIdHeader: REQUEST_ID_HEADER,
} as const;
