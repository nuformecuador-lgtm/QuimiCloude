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
};
