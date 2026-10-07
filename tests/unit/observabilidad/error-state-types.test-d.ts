// QC-71 T6 (R16) — LAS DOS FORMAS PROHIBIDAS DEL ESTADO DE ERROR, ESCRITAS PARA QUE NO COMPILEN.
//
// **Este archivo NO lo ejecuta vitest, y es a proposito.** `vitest.config.mts` incluye
// `tests/**/*.test.ts` y `tests/**/*.test.tsx`; un `*.test-d.ts` no entra en ningun proyecto. Su
// valor entero viene de `tsc`: `tsconfig.json` incluye `**/*.ts`, asi que `pnpm run typecheck` lo
// compila con el resto del repo.
//
// Como muerde, que es lo unico que importa (`docs/gate.md > Probar que muerde`): cada
// construccion ilegal lleva encima un `@ts-expect-error`. Si alguien vuelve a abrir el tipo —por
// ejemplo devolviendo `reference?: string` a un objeto plano—, esas dos lineas dejarian de dar
// error, el `@ts-expect-error` pasaria a estar de mas y **`tsc` se pone rojo por ellas**
// («Unused '@ts-expect-error' directive»). Es el mismo mecanismo al reves: el fallo que esta
// ficha viene a cerrar se convierte en un typecheck rojo.
//
// Que estas dos construcciones sigan aqui, y sigan marcadas, lo vigila ademas
// `tests/unit/observabilidad/error-state-types.test.ts`, que si lo corre vitest: sin el, borrar
// este archivo entero saldria en verde.

import { expectTypeOf } from 'vitest'

import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores'

// ---------------------------------------------------------------------------------------
// PROHIBIDA 1 — el error inesperado SIN identificador.
// Es el olvido que QC-70 no podia cazar: la pantalla se queda sin nada que citar al reportar
// el fallo, y con `reference?: string` esto compilaba en verde.
// ---------------------------------------------------------------------------------------
// @ts-expect-error el error inesperado EXIGE `reference` (R16): falta la propiedad.
export const inesperadoSinReferencia: ErrorState = {
  status: 'error',
  code: UNEXPECTED_ERROR_CODE,
  message: 'Ocurrio un error inesperado. Intentalo de nuevo.',
}

// ---------------------------------------------------------------------------------------
// PROHIBIDA 2 — un error CATALOGADO con identificador.
// Es la fuga del otro lado (R15): un dato interno viajando al navegador en respuestas que no
// lo necesitan. Con un campo opcional en un solo objeto tambien compilaba.
// ---------------------------------------------------------------------------------------
// El `@ts-expect-error` va sobre la PROPIEDAD y no sobre la declaracion porque ahi es donde
// `tsc` situa el exceso: puesto arriba, la directiva quedaria sin usar y el typecheck se
// pondria rojo por la directiva en vez de por lo que se quiere demostrar.
export const catalogadoConReferencia: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: 'El actor no tiene permiso para realizar esta operacion.',
  // @ts-expect-error un codigo del catalogo NO admite `reference` (R16): propiedad de mas.
  reference: '3f1c2b7a-9d2e-4f5a-8c1b-0a9e7d6c5b4a',
}

// ---------------------------------------------------------------------------------------
// LAS DOS FORMAS LEGALES, sin `@ts-expect-error`: si alguna dejara de compilar, el tipo se
// habria cerrado de mas y el typecheck lo diria igual.
// ---------------------------------------------------------------------------------------
export const inesperadoConReferencia: ErrorState = {
  status: 'error',
  code: UNEXPECTED_ERROR_CODE,
  message: 'Ocurrio un error inesperado. Intentalo de nuevo.',
  reference: '3f1c2b7a-9d2e-4f5a-8c1b-0a9e7d6c5b4a',
}

export const catalogadoSinReferencia: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: 'El actor no tiene permiso para realizar esta operacion.',
}

// ---------------------------------------------------------------------------------------
// La forma POSITIVA, afirmada sobre el tipo y no sobre un valor: tras estrechar por el codigo
// generico, `reference` existe y es `string` —no `string | undefined`—; en la rama catalogada
// no existe. Es lo que hace que R17/R18 los vigile el compilador en las siete pantallas.
// ---------------------------------------------------------------------------------------
type RamaInesperada = Extract<ErrorState, { code: typeof UNEXPECTED_ERROR_CODE }>
type RamaCatalogada = Exclude<ErrorState, { code: typeof UNEXPECTED_ERROR_CODE }>

expectTypeOf<RamaInesperada>().toHaveProperty('reference')
expectTypeOf<RamaInesperada>().toExtend<{ reference: string }>()
expectTypeOf<RamaInesperada['reference']>().toEqualTypeOf<string>()
expectTypeOf<RamaCatalogada>().not.toHaveProperty('reference')
expectTypeOf<RamaCatalogada['code']>().not.toEqualTypeOf<typeof UNEXPECTED_ERROR_CODE>()
