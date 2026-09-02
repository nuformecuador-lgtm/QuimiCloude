// T2 — Como se compone el nombre mostrable de la sesion (`design.md > 4.3`, R13). Dominio
// puro: no importa `lib/shared/**` aunque las iniciales se calculen ahi (`nav-user.tsx`); ese
// calculo es de presentacion, no de negocio, y `getInitials(buildDisplayName(...))` se
// comprueba componiendo las dos piezas desde el test, nunca desde aqui.

/** Primer token no vacio de un texto, tolerante a espacios multiples. */
function primerToken(texto: string): string {
  return texto.trim().split(/\s+/).filter(Boolean)[0] ?? '';
}

/**
 * Primer nombre + primer apellido (D: «Ana Maria» + «Perez Gomez» → «Ana Perez», R13). Si el
 * resultado quedara vacio —ambos campos vacios o solo espacios— cae al `username`: sin ese
 * corte la barra lateral quedaria con un hueco en vez de un nombre, que es comportamiento no
 * definido en vez de uno decidido.
 */
export function buildDisplayName(firstNames: string, lastNames: string, username: string): string {
  const partes = [primerToken(firstNames), primerToken(lastNames)].filter(Boolean);
  const compuesto = partes.join(' ');

  return compuesto.length > 0 ? compuesto : username;
}
