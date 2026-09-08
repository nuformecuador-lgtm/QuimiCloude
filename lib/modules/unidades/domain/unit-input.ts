import { z } from 'zod'

import { normalizeUnitName } from './unit-name'

/**
 * Nombre (R8, R9): `trim()` ANTES de `min(1)` -mismo orden que `presentationNameSchema` de
 * `inventario`- para que el valor que sale del `parse` ya venga recortado (R8: "no guardar los
 * espacios de los extremos"). `max(60)` es R9, y vive SOLO aqui: `units.name` sigue siendo
 * `TEXT` sin restriccion (`design.md > 3`).
 *
 * El `refine` cierra el mismo hueco que `presentationNameSchema`: un nombre que normaliza a la
 * cadena vacia -`'---'`, por ejemplo- pasaria `min(1)` (tiene un caracter) y llegaria al indice
 * unico con `nameNormalized: ''`; una segunda unidad de solo signos se anunciaria entonces como
 * "ya existe" en vez de como nombre invalido. Se rechaza aqui, antes de tocar el repositorio.
 */
const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((name) => normalizeUnitName(name) !== '', {
    message: 'El nombre de la unidad no contiene ningun caracter valido.',
  })

/**
 * Simbolo (R10, R36 -decision cerrada 24-): OPCIONAL -la clave puede no venir, y `undefined`
 * es legal-, pero si viene DEBE tener contenido.
 *
 * CRITICO, y es el unico punto de toda la ficha donde es facil equivocarse: este esquema NO
 * recorta el simbolo a `null` ni lo convierte en "sin simbolo" cuando llega vacio o en blanco.
 * Se RECHAZA con un error de validacion. El motivo es `units_company_symbol_unique` (y su
 * pareja de sistema): son indices UNICOS PARCIALES sobre `symbol IS NOT NULL`, asi que una
 * cadena vacia SI es un valor que el indice compara -no lo excluye como haria un `NULL`-. Si
 * este esquema tradujera `''`/`'   '` a `null` (o los dejara pasar tal cual), dos unidades
 * distintas con simbolo vacio chocarian contra ese indice y el sistema respondería
 * `DuplicateSymbolError` -"ya existe"-, que es una mentira: lo que en realidad pasa es que
 * ninguna de las dos declaro un simbolo real.
 *
 * `undefined` (clave ausente) sigue siendo legal y no pasa por este esquema en absoluto: es el
 * `.optional()` del objeto de mas abajo el que lo permite, symbolSchema solo se evalua cuando
 * la clave SI esta presente.
 */
const symbolSchema = z
  .string()
  .trim()
  .min(1, 'El simbolo, si se declara, no puede estar vacio ni ser solo espacios.')
  .max(10)

/**
 * Factor, como CADENA (`design.md > 3.1`), nunca como `number`: `units.factor` es
 * `DECIMAL(14,4)` y este modulo no introduce coma flotante en ningun punto (QC-76 R3). El
 * patron exige entre 1 y 10 digitos enteros y, si hay parte decimal, entre 1 y 4 -asi que un
 * quinto decimal se rechaza de entrada, en vez de truncarse en silencio al guardar-, y el
 * `refine` adicional exige un valor mayor que cero SIN convertir a `number`: comparar el signo
 * y "es cero" se puede hacer sobre la representacion en texto sin perder la garantia de R3.
 */
const FACTOR_PATTERN = /^\d{1,10}(\.\d{1,4})?$/

const factorSchema = z
  .string()
  .regex(FACTOR_PATTERN, 'El factor debe ser un numero decimal con hasta 4 decimales.')
  .refine((factor) => !/^0+(\.0+)?$/.test(factor), {
    message: 'El factor debe ser mayor que cero.',
  })

/**
 * Esquema UNICO de alta y edicion (R17, R18): la edicion es un REEMPLAZO COMPLETO de los
 * cuatro campos, nunca un PATCH, asi que no hay `.partial()` ni ningun campo opcional que
 * signifique "no lo toques". `baseUnitId`/`factor` ausentes SI son legales -"unidad base", R13-
 * pero eso es una entrada valida con un significado propio, no "deja como esta".
 */
export const unitInputSchema = z
  .object({
    name: nameSchema,
    symbol: symbolSchema.optional(),
    baseUnitId: z.string().uuid().optional(),
    factor: factorSchema.optional(),
  })
  .superRefine((input, ctx) => {
    // R13: la unidad de la que se deriva y el factor van JUNTOS o NINGUNO de los dos. No
    // declarar ninguno es legal y significa "unidad base".
    const tieneBase = input.baseUnitId !== undefined
    const tieneFactor = input.factor !== undefined
    if (tieneBase === tieneFactor) return

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: tieneBase ? ['factor'] : ['baseUnitId'],
      message:
        'baseUnitId y factor van juntos: declarar solo uno de los dos deja la equivalencia a medias.',
    })
  })

/** Alta y edicion comparten literalmente el mismo esquema (R18): no hay un segundo juego de
 *  reglas para editar. Se exponen los dos nombres porque `createUnit`/`updateUnit` (T7) hablan
 *  cada uno de "su" esquema, aunque sean el mismo objeto en memoria. */
export const createUnitSchema = unitInputSchema
export const updateUnitSchema = unitInputSchema

export type UnitInput = z.infer<typeof unitInputSchema>
export type CreateUnitInput = z.infer<typeof createUnitSchema>
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>
