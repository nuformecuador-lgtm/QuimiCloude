// tests/integration/asignaciones/prisma-tx-holder.ts
/**
 * QC-87 (T14) — El puente entre la transaccion del test y los adaptadores que hablan con el
 * cliente Prisma GLOBAL.
 *
 * EL PROBLEMA, con nombre y apellidos. Los tests de T14 ejercitan los CASOS DE USO COMPLETOS con
 * sus adaptadores Prisma REALES —que es lo unico que ningun doble puede demostrar—, y esos casos
 * de uso atan CUATRO adaptadores: el repositorio de `asignaciones` (que SI es una fabrica y se
 * construye sobre la `tx`, QC-77) y los TRES contratos publicos de T2 y T3
 * (`order-catalog-prisma`, `assignment-directory-prisma`, y a traves de este ultimo
 * `work-group-prisma`), que importan `prisma` de `@/lib/shared/db/prisma` y por tanto hablan por
 * el cliente global. Si se les deja hablar por el, corren en OTRA conexion del pool y no ven ni
 * una fila del fixture: el «aislamiento de mentira» que QC-77 describe. Esa es exactamente la
 * razon por la que `identity/assignment-directory.int.test.ts` (T3) esta censado como `commit`.
 *
 * LA SALIDA, y por que esta y no `commit`. En vez de renunciar a la transaccion —y dejar que
 * ocho archivos escriban de verdad en la base de la corrida y la limpien a mano—, se cambia el
 * HANDLE y no el CODIGO: `vi.mock('@/lib/shared/db/prisma')` devuelve un Proxy del cliente real
 * que, MIENTRAS hay una transaccion del test abierta, delega cada propiedad en el cliente
 * transaccional. El SQL que se ejecuta es el de los adaptadores de produccion, linea por linea;
 * lo unico que cambia es por que conexion viaja. Asi los ocho archivos de T14 se aislan de verdad
 * (`ROLLBACK`) y se censan como `transaccion`.
 *
 * LO QUE **NO** SE FALSEA, y hay que decirlo: no se sustituye ninguna consulta, ninguna tabla y
 * ningun resultado. Un `vi.mock` que devolviera respuestas inventadas convertiria estos tests en
 * unitarios disfrazados; este devuelve el MISMO `PrismaClient` real (`vi.importActual`) envuelto.
 * Si la transaccion no esta abierta —`setCurrentTx(null)`—, el proxy es transparente.
 *
 * `$transaction` SI se intercepta, pero solo en su forma interactiva (`$transaction(fn)`) y solo
 * mientras hay una transaccion de test en curso: el propio adaptador de produccion (`Comenzar`,
 * `order-prisma.ts`) abre su propia `prisma.$transaction` para el `SELECT ... FOR UPDATE` mas el
 * reconteo, y esa llamada no puede convertirse en un `BEGIN` real anidado -Postgres no lo permite
 * sobre la misma conexion, y una conexion nueva del pool no veria ninguna fila sin commit del
 * fixture-. En vez de abrir otra transaccion, se ejecuta el callback directamente sobre la `tx` del
 * test: el mismo efecto que Prisma le daria dentro de la MISMA transaccion, sin el `BEGIN`
 * redundante. El `$transaction` con el que el propio test abre SU transaccion no pasa por aqui:
 * se llama cuando `current` todavia es `null`, antes de que exista nada que interceptar.
 *
 * Este archivo NO termina en `.int.test.ts` a proposito: no es una suite, no lo recoge el
 * `include` de Vitest y no entra en `tests/integration/aislamiento.json` (la guardia filtra por
 * ese sufijo, no por `.test.ts`).
 */

/** El cliente transaccional del caso en curso, o `null` fuera de toda transaccion de test. */
let current: object | null = null;

export function setCurrentTx(tx: object | null): void {
  current = tx;
}

/**
 * El cliente real envuelto: cada acceso a una propiedad se resuelve PRIMERO en la transaccion en
 * curso —`prisma.user`, `prisma.workGroup`, `prisma.$queryRaw`…— y solo si alli no existe se cae
 * al cliente global. Los metodos que vienen del cliente real se atan a el (`bind`) para que sus
 * internos no vean el Proxy como `this`.
 */
export function txAwareProxy<T extends object>(real: T): T {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (current !== null && prop === '$transaction') {
        return (arg: unknown, ...rest: readonly unknown[]) => {
          if (typeof arg === 'function') return (arg as (tx: object) => unknown)(current as object);
          const real = Reflect.get(target, prop, receiver) as (...args: unknown[]) => unknown;
          return real.call(target, arg, ...rest);
        };
      }
      if (current !== null && typeof prop === 'string') {
        const fromTx = (current as Record<string, unknown>)[prop];
        if (fromTx !== undefined) return fromTx;
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}
