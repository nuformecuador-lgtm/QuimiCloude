// lib/modules/identity/domain/birth-date.ts
/**
 * La fecha de nacimiento es una fecha CIVIL, no un instante: `createUserSchema` la valida como
 * `YYYY-MM-DD` (lo que emite un `<input type="date">` y lo que llega por `FormData`) y el puerto
 * pide un `Date` porque la columna es `@db.Date`. La conversion es de ESTE lado (el comentario de
 * `user-input.ts` lo deja escrito: el borde valida la FORMA, no elige la representacion).
 *
 * **Se ancla en UTC a proposito.** `new Date('1990-05-04')` ya interpreta el formato corto como UTC,
 * pero `new Date(1990, 4, 4)` -o cualquier variante con hora local- daria el dia ANTERIOR en una
 * maquina al oeste de Greenwich al serializarse, y este repo corre en local, en CI y en Vercel con
 * tres zonas distintas. Con la hora explicita en `Z` el resultado **no depende de la zona del
 * proceso**: el mismo texto da siempre el mismo dia. **Ese `T00:00:00.000Z` no se toca.**
 *
 * Vive en su PROPIO archivo -y no dentro de un caso de uso- porque la usan dos: el alta
 * (`create-user.ts`) y la edicion (`update-user.ts`). La conversion tiene que ser UNA, porque dos
 * copias es exactamente como el alta y la edicion acaban guardando dias distintos para el mismo
 * texto. Un caso de uso no es el hogar de una utilidad que otro caso de uso importa.
 *
 * No se reexporta desde el contrato del modulo (`index.ts`) a proposito: nadie de fuera la necesita
 * -el borde manda el texto `YYYY-MM-DD` y la conversion pasa aqui dentro-.
 */
export function toBirthDate(civilDate: string): Date {
  return new Date(`${civilDate}T00:00:00.000Z`);
}
