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
 * Etiqueta de cada item del menu de fila: solo el verbo, sin el nombre del usuario (decision humana
 * puntual, 2026-10-04). El contexto de la fila lo da el nombre accesible del disparador del menu.
 */
export const EDIT_USER_ACTION_LABEL = 'Editar';

export const DELETE_USER_ACTION_LABEL = 'Eliminar';

/**
 * La UNICA accion del estado de cuenta (R32): «cambiar estado», no un verbo por transicion. La
 * pantalla no traduce estados a verbos ni decide que transiciones son posibles, porque eso seria
 * regla de negocio escrita en la interfaz.
 */
export const CHANGE_USER_STATUS_ACTION_LABEL = 'Cambiar estado';

/**
 * Los textos del cierre de todas las sesiones de OTRA persona (QC-101 R7, R9, R13, R19;
 * `design.md > 2`). Viven aqui y no en el dialogo porque dos de ellos los consume tambien el panel
 * (el nombre accesible del disparador) y porque los tests los toman de estas funciones, nunca de un
 * literal copiado.
 *
 * **Todos NOMBRAN a la persona**: la accion expulsa a alguien que puede estar trabajando, y el nombre
 * dentro es lo que convierte un «¿seguro?» en una comprobacion real (decision cerrada 4).
 *
 * **Ninguno promete numero** (R19), y por eso ninguna funcion recibe mas que el nombre: el caso de
 * uso devuelve `void` (`end-all-sessions.ts:64`) y el sistema **no sabe cuantas sesiones cerro**. El
 * mensaje de exito es verdad tanto con cinco sesiones como con ninguna.
 */

/** Nombre accesible del disparador en el panel de detalle (R7). */
export function endUserSessionsLabel(displayName: string): string {
  return `Cerrar todas las sesiones de ${displayName}`;
}

/** Titulo del dialogo de confirmacion, en forma de pregunta y con el nombre dentro (R9). */
export function endUserSessionsTitle(displayName: string): string {
  return `¿Cerrar todas las sesiones de ${displayName}?`;
}

/** Descripcion del dialogo: nombra a la persona y advierte que tendra que volver a entrar (R9). */
export function endUserSessionsMessage(displayName: string): string {
  return `Se cerrarán todas las sesiones de ${displayName}. Tendrá que volver a entrar.`;
}

/** Aviso de exito por el `<Toaster />` del layout privado: confirma sin prometer numero (R13, R19). */
export function endUserSessionsSuccess(displayName: string): string {
  return `Se cerraron las sesiones de ${displayName}.`;
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
