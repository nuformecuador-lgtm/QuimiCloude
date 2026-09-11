import { USER_ACCOUNT_STATUSES, type UserAccountStatus } from '@/lib/modules/identity';

/**
 * Textos y conversiones de la pantalla de usuarios que **no necesitan JSX** (R20, R26;
 * `design.md > 7` y `> 8`).
 *
 * **Las claves salen del contrato; los textos son de esta capa.** El conjunto cerrado de estados
 * lo declara `identity` (`USER_ACCOUNT_STATUSES`); aqui solo se decide como se lee cada uno. Por
 * eso las opciones del filtro se construyen **recorriendo ese conjunto** y no una segunda lista
 * escrita a mano: dos listas es como se acaba con un filtro que ofrece un estado que ya no existe.
 *
 * **El mapa es exhaustivo POR TIPO** (`Record<UserAccountStatus, string>`): si manana el dominio
 * publica un quinto estado, este archivo deja de compilar en vez de pintar un hueco o el valor
 * crudo del enum. Esa es la razon de que sea un mapa y no una funcion con `switch` y `default`,
 * que taparia el caso nuevo en silencio (riesgo declarado en `design.md > 13`).
 *
 * **Ningun test afirma sobre estos textos** (R41): los controles se localizan por rol ARIA o por
 * `data-testid`, y cuando un test necesita el texto lo toma **de estas constantes exportadas**,
 * nunca de un literal copiado.
 */

/** `data-testid` del titulo de la pantalla. Constante para que ni `page.tsx` ni sus tests lo escriban a mano (R41). */
export const USERS_TITLE_TESTID = 'usuarios-title';

/**
 * Como se lee cada estado de cuenta almacenado (R20). Exhaustivo por tipo: falta una clave y no
 * compila.
 *
 * Se pinta **el estado almacenado tal cual lo devuelve la consulta**: aqui no hay estado efectivo,
 * ni `lockedUntil`, ni nada derivado de contadores de intentos. El desfase conocido —una cuenta
 * `blocked` con el plazo vencido se sigue leyendo `blocked`— es la direccion segura y esta escrito
 * con nombre en `design.md > 9`.
 */
export const USER_ACCOUNT_STATUS_LABELS: Readonly<Record<UserAccountStatus, string>> = {
  active: 'Activo',
  pending: 'Pendiente',
  inactive: 'Inactivo',
  blocked: 'Bloqueado',
};

/**
 * Opciones del UNICO filtro de la pantalla (R13), **derivadas del conjunto cerrado del contrato**.
 * Se exportan ya construidas para que la declaracion de columnas no vuelva a recorrer los valores
 * ni a decidir como se leen.
 */
export const USER_STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] =
  USER_ACCOUNT_STATUSES.map((value) => ({ value, label: USER_ACCOUNT_STATUS_LABELS[value] }));

/**
 * Nombre accesible de cada accion de fila, **compuesto con el nombre del usuario**. Con diez o
 * veinticinco filas en pantalla, «Editar» a secas no dice cual.
 *
 * Se exportan como funciones para que los tests localicen los botones por rol y nombre sin copiar
 * el copy (R41): quien decide el texto es este archivo, y sigue habiendo un solo sitio donde
 * cambiarlo.
 */
export function editUserLabel(displayName: string): string {
  return `Editar al usuario ${displayName}`;
}

export function deleteUserLabel(displayName: string): string {
  return `Eliminar al usuario ${displayName}`;
}

/**
 * La UNICA accion del estado de cuenta (R32): «cambiar estado», no un verbo por transicion. La
 * pantalla no traduce estados a verbos ni decide que transiciones son posibles, porque eso seria
 * regla de negocio escrita en la interfaz.
 */
export function changeUserStatusLabel(displayName: string): string {
  return `Cambiar el estado de la cuenta de ${displayName}`;
}

/**
 * Un `Date` a `YYYY-MM-DD`, que es lo que `<input type="date">` emite y lo que `z.iso.date()`
 * espera (R26).
 *
 * **En UTC, y eso es el requisito.** `UserDetail.birthDate` viene de una columna `@db.Date`, o
 * sea medianoche UTC; formatearla con el huso local restaria un dia entero en cualquier huso
 * negativo —America entera— y el formulario de edicion precargaria una fecha de nacimiento
 * equivocada. `toISOString()` es siempre UTC, asi que el recorte de los diez primeros caracteres
 * no depende del entorno: mismo patron que `order-columns.tsx`, `recipe-columns.ts` y
 * `supplier-columns.ts`, y misma razon por la que no se usa `toLocaleDateString` (que ademas
 * produciria discrepancias de hidratacion entre servidor y navegador).
 */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}
