/**
 * Contrato del usuario de sesion para la zona privada (`design.md > 4.1`).
 * CONGELADO en la feature 8: la feature 10 conecta la sesion real sin cambiar este tipo.
 *
 * `displayName` y `roleName` llegan **ya resueltos** como texto mostrable desde quien
 * provee la sesion (D8): la UI no compone nombre y apellidos ni traduce el rol, porque
 * eso es logica de dominio y no vive en un componente.
 *
 * `roleName: null` significa que **no se pinta la linea de rol** (R14), no que el rol
 * este vacio: es comportamiento definido, no un hueco.
 *
 * No hay ningun campo de credencial (password, hash, token) ni `avatarUrl`: la
 * representacion grafica son las iniciales derivadas de `displayName` (D3, R15).
 */
export type SessionUser = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly roleName: string | null;
  /**
   * QC-74 (T8, R7, R11): los codigos de permiso vigentes del rol, resueltos en la MISMA lectura
   * de sesion. Es el dato con el que se autoriza; `roleName` se queda al lado pero es DISPLAY
   * —lo pinta `nav-user.tsx`— y no autoriza nada (R18).
   *
   * Un rol sin ninguna asignacion da `[]`, no `null`: «no tiene permisos» es una lista vacia,
   * no un hueco, y asi quien compara nunca tiene que distinguir dos formas de lo mismo (R14).
   */
  readonly permissions: readonly string[];
};
