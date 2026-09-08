// QC-75 (R6, R10) — el corte por permiso de una PANTALLA de la zona privada.
//
// Es un ADAPTADOR DRIVING, no dominio: importa `next/navigation` y `@/lib/composition`, que es
// exactamente lo que la tabla de dependencias de `docs/architecture.md` permite a
// `adapters/driving/**` y prohibe a `domain/**`. Y `app/**` puede importar
// `adapters/driving/**`, asi que cada `page.tsx` lo alcanza sin ruta profunda al dominio.
//
// NO entra en el cierre de imports del middleware (R18): `middleware.ts` importa
// `route-guard-middleware.ts`, y ese archivo NO importa este. Vivir en la misma carpeta no mete
// nada en el bundle del borde — `tests/guards/guard-middleware-edge.test.ts` recorre imports, no
// carpetas. Si algun dia el middleware importara este archivo, la guardia se pondria roja, que es
// lo que se quiere.
import { notFound, redirect } from 'next/navigation';

import { identity } from '@/lib/composition';
import { assertPermission, type PermissionCode } from '@/lib/modules/identity';
import { LOGIN_ROUTE } from '@/lib/shared/routes';

/**
 * Exige `permission` para servir la pantalla actual: sin sesion redirige al login, y con sesion
 * pero sin el permiso responde 404 (`design.md > 2.1`).
 *
 * **`PermissionCode` y no `string` (R10):** el parametro es la union de literales del catalogo de
 * QC-74, asi que pedir `'inventaro.consultar'` NO COMPILA. Media clase de errores se convierte en
 * rojo de `typecheck` en vez de en un 404 silencioso en produccion.
 *
 * **`assertPermission` con `onDenied: () => notFound()` (R10):** `notFound()` esta tipada
 * `(): never` y **lanza** el error de control de Next antes de devolver nada, asi que la excepcion
 * sale de `assertPermission` sin que este llegue a conocer a Next.
 *
 * NO SE SUSTITUYA por un `if` que compruebe a mano si el conjunto de permisos del usuario
 * contiene el codigo. Parece mas corto y es peor: QC-74 R12 dejo `assertPermission` como la **UNICA** implementacion de «el actor
 * tiene este permiso» —pertenencia exacta, sin implicacion entre permisos, fallando cerrado—, y
 * una segunda comparacion aqui seria una segunda definicion de autorizacion, libre de divergir de
 * la primera en silencio. El test de fuente de
 * `tests/unit/identity/require-page-permission.test.ts` afirma que este archivo no contiene
 * ninguna comparacion manual del conjunto de permisos.
 *
 * **`redirect` si no hay sesion:** el layout y la pagina se renderizan **en paralelo** en el App
 * Router, asi que la pagina no puede dar por hecho que el `redirect` del layout privado ya
 * ocurrio. Es la ultima linea de defensa que describe `docs/architecture.md`, no una duplicacion
 * por adorno.
 *
 * **Devuelve `void` a proposito:** ninguna pagina de hoy usa el `SessionUser` —cada caso de uso
 * resuelve su propio actor—. Devolverlo invitaria a pasarlo por props y a que una pagina lo
 * fetchease "ya que esta".
 */
export async function requirePagePermission(permission: PermissionCode): Promise<void> {
  const user = await identity.getSessionUser();
  if (user === null) redirect(LOGIN_ROUTE);
  assertPermission(user, permission, () => notFound());
}
