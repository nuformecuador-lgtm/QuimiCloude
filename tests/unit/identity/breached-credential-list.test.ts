// T6 — El adaptador driven de la lista de credenciales filtradas, contra la lista REAL
// (`design.md > 10`, nivel 2). Cubre **R7**.
//
// Aqui no hay doble: el resto de la tanda prueba el dominio con un doble del puerto, y
// eso deja sin verificar lo unico que la libreria aporta —que la lista contenga de verdad
// lo que decimos que contiene—. Sin red: el diccionario viaja dentro del paquete.
//
// Las cadenas 'password' y '123456' aparecen como ENTRADAS DE LA LISTA DE FILTRADAS que
// el adaptador rechaza. Ese es su unico uso legitimo en este repo: no son la credencial
// de nadie, son justo lo que la politica prohibe.

import { isBreachedCredential } from '@/lib/modules/identity/adapters/driven/security/breached-credential-list';

/**
 * Cadena que no puede estar en ninguna lista de filtradas: no es una palabra, no es un
 * patron de teclado y no la escribiria una persona. Es literal y no aleatoria a
 * proposito: un test que se genera su entrada con `Math.random` no es reproducible.
 */
const CADENA_SIN_SENTIDO = 'zx9q-vk3m-tt7w-qb2r-hh5n-jd8l';

describe('adaptador de la lista de credenciales filtradas', () => {
  // R7 — el caso de la tabla de trazabilidad.
  it('la lista real contiene password y 123456 y no una cadena aleatoria', async () => {
    // Primero: la lista SI trae las dos notorias. Si el diccionario no cargara, esto es
    // lo que se pone rojo, en vez de pasar en verde por un `Set` vacio.
    expect(await isBreachedCredential('password')).toBe(true);
    expect(await isBreachedCredential('123456')).toBe(true);

    // Luego: y no marca cualquier cosa como filtrada.
    expect(await isBreachedCredential(CADENA_SIN_SENTIDO)).toBe(false);
  });

  it('la comparacion del adaptador no distingue mayusculas', async () => {
    expect(await isBreachedCredential('PASSWORD')).toBe(true);
    expect(await isBreachedCredential('PassWord')).toBe(true);
    expect(await isBreachedCredential(CADENA_SIN_SENTIDO.toUpperCase())).toBe(false);
  });

  it('la cadena vacia no figura en la lista', async () => {
    expect(await isBreachedCredential('')).toBe(false);
  });
});
