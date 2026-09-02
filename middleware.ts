// QC-9 T14 — El archivo que Next exige en la raiz. Es un CASCARON (`design.md > 2`, R20).
//
// Aqui no vive la feature: vive en `lib/modules/identity`. Este archivo contiene exactamente dos
// cosas —el reexport del handler y el `matcher`— y ninguna decision propia. Si alguna vez aparece
// aqui un `if` sobre rutas, un destino de redireccion o una llamada a `crypto`, esta en el archivo
// equivocado; `tests/unit/middleware-root-contract.test.ts` lo afirma sobre el texto de este
// archivo, y las guardias lo barren con las mismas reglas que `app/**` (R19, R21).
export { middleware } from '@/lib/modules/identity/adapters/driving/route-guard-middleware';

/**
 * El `matcher` deja fuera los recursos estaticos (R22): el middleware no los redirige ni los
 * inspecciona, porque pagar un HMAC por cada icono no protege nada.
 *
 * **Es un literal y no una constante importada A PROPOSITO.** Next lo lee estaticamente al
 * construir el bundle y no puede resolver una constante: importarla desde `lib/shared/routes.ts`
 * dejaria el `matcher` vacio en produccion sin que ningun test se enterase. Es la unica
 * duplicacion que esta feature acepta, y por eso R22 le pone test.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
