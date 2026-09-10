# QC-70 — errores-centralizados · design.md

> Requisitos en `requirements.md`. Aquí solo el **cómo**, contado contra el árbol real del
> worktree (`feature/QC-70-errores-centralizados`, desde `origin/dev` `d26d09e`), leído el
> 2026-09-08.

> ## ⚠ Antes de escribir una línea: el choque con QC-39
>
> QC-70 **renombra dos códigos de `unidades`** que la pantalla de QC-39 —hoy `in_progress`, en
> otro worktree— ya consume:
>
> | Valor viejo | Valor nuevo |
> |---|---|
> | `duplicate_name` | `unit_duplicate_name` |
> | `not_found` | `unit_not_found` |
>
> Los archivos de QC-39 que los comparan **todavía no existen en `dev`**
> (`app/(private)/configuracion/unidades/**`, `tests/unit/configuracion-ui/**`), así que ningún
> `git merge` va a avisar: se mergea limpio y la pantalla queda comparando contra un código que
> ya no existe. **Quien mergee segundo actualiza esos dos literales.** Además las dos features
> tocan `lib/modules/unidades/index.ts`. Detalle en § 8.

## 0. La ficha NO se parte en `backend` + `frontend`

`AGENTS.md > Particion de fullstack` pediría partirla. **Decisión humana del 2026-09-08: no se
parte**, y el motivo queda escrito aquí:

- La decisión central —abrir los códigos por caso concreto— obliga a cambiar **a la vez** el
  catálogo y los archivos de UI que hoy comparan contra el código genérico.
- Una mitad `backend` sola dejaría la aplicación mostrando mensajes equivocados (una pantalla
  comparando `'not_found'` contra un `code` que ya vale `'supplier_not_found'` cae al mensaje por
  defecto) hasta que llegara la otra mitad.
- Una mitad `frontend` sola no se podría verificar: no existiría el código nuevo contra el que
  comparar.

Mismo razonamiento aplicado a QC-75, con precedente en QC-36, QC-63 y QC-70..QC-73.

## 1. Estado de partida, contado

| Módulo | Clase base | Clases | Códigos declarados |
|---|---|---|---|
| `inventario` | `InventarioError` | 5 | `unauthorized`, `not_found`, `duplicate_name`, `presentation_in_use`, `invalid_input` |
| `pedidos` | `PedidosError` | 8 | `unauthorized`, `not_found`, `recipe_not_found`, `invalid_transition`, `not_cancellable`, `not_deletable`, `duplicate_number`, `invalid_input` |
| `proveedores` | `ProveedoresError` | 5 | `unauthorized`, `not_found`, `duplicate_name`, `duplicate_catalog_line`, `invalid_input` |
| `recetas` | `RecetasError` | 4 | `unauthorized`, `not_found`, `duplicate_name`, `invalid_input` |
| `unidades` | `UnidadesError` | 9 | `unauthorized`, `invalid_input`, `incompatible_units`, `not_found`, `system_unit`, `duplicate_name`, `duplicate_symbol`, `invalid_derivation`, `unit_in_use` |

31 clases, **16 valores de código distintos**. Las siete copias de `toErrorState` son idénticas:

```ts
function toErrorState(error: unknown): { status: 'error'; code: string; message: string } {
  if (error instanceof <ModuloError>) {
    return { status: 'error', code: error.code, message: error.message };
  }
  throw error;              // <- hoy RELANZA. R12 lo cambia a estado generico (confirmado 2026-09-08)
}
```

Los cinco `index.ts` de módulo reexportan clases de error, así que la migración toca los cinco
barrels además de los cinco `domain/errors.ts` y los siete adaptadores driving.

## 2. Dónde vive el catálogo

### 2.1 Módulo nuevo `lib/modules/errores/`

```
lib/modules/errores/
  index.ts                      # contrato: solo reexporta de ./domain
  domain/
    error-codes.ts              # ERROR_CODES (tupla) + type ErrorCode + UNEXPECTED_ERROR_CODE
    error-catalog.ts            # ErrorCode -> MessageKey  y  MessageKey -> texto (es)
    error-message.ts            # errorMessage(code): string
    error-state.ts              # type ErrorState + createErrorStateTranslator(...)
```

Por qué un módulo y no `lib/shared/`: el `domain/` de los cinco módulos tiene que leer el
mensaje al construir el error (R7), y `domain/**` **no puede** importar `lib/shared/**`
(`docs/architecture.md > La regla de dependencias`). Sí puede importar el **barrel de otro
módulo**, `@/lib/modules/errores`, y lo mismo vale para `driven` y `driving`
(`guard-arquitectura-modulos.test.ts`, BLOQUE 13: «el barrel del propio o de otro modulo» está
entre lo permitido) y para la UI (R13 de QC-15, `app/**` y `components/**` consumen el barrel).
Es el mismo patrón por el que QC-54 publica `ROLE_ADMINISTRADOR`.

Un módulo con solo `index.ts` + `domain/` es legal: `findModuleShapeFindings` exige `index.ts` y
que las carpetas sean `domain`/`ports`/`adapters`, no que existan las tres. No aporta ningún
modelo a `db/schema.prisma`, y no hace falta: no hay tabla de errores.

### 2.2 Contrato público

```ts
// lib/modules/errores/index.ts
export { ERROR_CODES, UNEXPECTED_ERROR_CODE } from './domain/error-codes';
export type { ErrorCode } from './domain/error-codes';
export { errorMessage } from './domain/error-message';
export { ERROR_MESSAGE_KEY, ERROR_MESSAGES_ES } from './domain/error-catalog';
export type { ErrorMessageKey } from './domain/error-catalog';
export { createErrorStateTranslator } from './domain/error-state';
export type { ErrorState } from './domain/error-state';
```

### 2.3 Alternativas descartadas

1. **`lib/shared/errors/`.** Es donde «naturalmente» iría una utilidad transversal, y donde
   viven `routes.ts` y `ui/`. **Descartada:** `domain/**` no puede importar `lib/shared/**`, así
   que el mensaje no podría salir del catálogo en el sitio donde se construye el error, y R7
   quedaría sin sitio donde cumplirse. La alternativa de segundo orden —catálogo en `lib/shared`
   y traducción solo en el adaptador driving— deja el mensaje por defecto de cada clase vivo en
   `domain/errors.ts`: seguiría habiendo dos sitios con la frase, que es justo lo que la ficha
   quita.
2. **Colgar el catálogo de un módulo existente** (`inventario`, por ser el más antiguo, o
   `identity`, por ser transversal). **Descartada:** haría que los otros cuatro módulos
   dependieran del barrel de un módulo de negocio ajeno para algo que no es su negocio, y
   `identity` además está explícitamente fuera del alcance de esta ficha.
3. **Un tipo de error compartido del que hereden los cinco.** **Descartada y ya cerrada** en la
   tabla de decisiones (heredado de QC-54): una clase no puede heredar de cinco bases, y caería
   fuera de los siete `catch` que hoy funcionan.
4. **Códigos numéricos** (`code: 30`). **Descartada y ya cerrada**: obligaría a tocar las once
   comparaciones de UI y a mantener una tabla aparte para leer un log.
5. **Una librería de i18n** (`i18next`, `next-intl`) para el mapa clave → texto. **Descartada
   por decisión cerrada**: no entra ninguna dependencia nueva; la internacionalización de la
   aplicación es QC-72. **QC-70 no propone ninguna librería**, así que los cuatro checks de
   `docs/architecture.md > Dependencias de terceros` no aplican y `package.json` no cambia.

## 3. El catálogo: 25 entradas

Regla mecánica que decide la apertura (R4): **dos casos con textos distintos son códigos
distintos; dos casos con el mismo texto son el mismo código.** Aplicada a los mensajes que hoy
existen, sale esto. La ficha estimaba «~20 entradas»; son **25**.

| # | Código | Clave | Texto (es) | Lo emite |
|---|---|---|---|---|
| 1 | `unauthorized` | `errors.unauthorized` | El actor no tiene permiso para realizar esta operacion. | los 5 |
| 2 | `invalid_input` | `errors.invalid_input` | La entrada recibida no es valida. | los 5 |
| 3 | `unexpected` | `errors.unexpected` | Ocurrio un error inesperado. Intentalo de nuevo. | traductor (R12) |
| 4 | `product_not_found` | `errors.product_not_found` | El producto solicitado no existe. | inventario |
| 5 | `presentation_not_found` | `errors.presentation_not_found` | La presentacion solicitada no existe. | inventario |
| 6 | `presentation_duplicate_name` | `errors.presentation_duplicate_name` | Ya existe una presentacion con un nombre equivalente. | inventario |
| 7 | `presentation_in_use` | `errors.presentation_in_use` | La presentacion tiene productos asignados y no se puede borrar. | inventario |
| 8 | `order_not_found` | `errors.order_not_found` | El pedido solicitado no existe. | pedidos |
| 9 | `recipe_not_found` | `errors.recipe_not_found` | La receta indicada no existe o esta dada de baja. | pedidos y recetas |
| 10 | `invalid_transition` | `errors.invalid_transition` | El pedido no admite ese cambio de estado. | pedidos |
| 11 | `not_cancellable` | `errors.not_cancellable` | El pedido no se puede cancelar en su estado actual. | pedidos |
| 12 | `not_deletable` | `errors.not_deletable` | El pedido no se puede borrar en su estado actual. | pedidos |
| 13 | `duplicate_number` | `errors.duplicate_number` | Ya existe un pedido con ese numero correlativo. | pedidos |
| 14 | `supplier_not_found` | `errors.supplier_not_found` | El proveedor solicitado no existe. | proveedores |
| 15 | `catalog_line_not_found` | `errors.catalog_line_not_found` | La linea de catalogo solicitada no existe. | proveedores |
| 16 | `supplier_duplicate_name` | `errors.supplier_duplicate_name` | Ya existe un proveedor con un nombre equivalente. | proveedores |
| 17 | `duplicate_catalog_line` | `errors.duplicate_catalog_line` | Ese proveedor ya tiene una linea con ese nombre y esa presentacion. | proveedores |
| 18 | `recipe_duplicate_name` | `errors.recipe_duplicate_name` | Ya existe una receta con un nombre equivalente. | recetas |
| 19 | `unit_not_found` | `errors.unit_not_found` | La unidad no existe. | unidades |
| 20 | `unit_duplicate_name` | `errors.unit_duplicate_name` | Ya existe una unidad con ese nombre. | unidades |
| 21 | `duplicate_symbol` | `errors.duplicate_symbol` | Ya existe una unidad con ese simbolo. | unidades |
| 22 | `system_unit` | `errors.system_unit` | Las unidades de sistema no se pueden editar ni borrar. | unidades |
| 23 | `invalid_derivation` | `errors.invalid_derivation` | La unidad base declarada no es valida. | unidades |
| 24 | `unit_in_use` | `errors.unit_in_use` | La unidad esta en uso y no se puede borrar. | unidades |
| 25 | `incompatible_units` | `errors.incompatible_units` | Las dos unidades no comparten unidad base: no son convertibles. | unidades |

Notas que no son cosméticas:

- **`recipe_not_found` es UNA entrada compartida por `pedidos` y `recetas`.** Los dos casos dicen
  lo mismo al usuario («esa receta no se puede usar: no existe o está de baja»), y el texto de
  pedidos ya cubre el de recetas. Partirlos obligaría a renombrar el código que `order-form.tsx`
  ya consume en su `CODE_TO_FIELD`, y el Alcance prohíbe renombrar por gusto. Que un código lo
  emitan dos módulos es lo mismo que ya pasa con `unauthorized` e `invalid_input`.
- **`unauthorized` e `invalid_input` NO se abren:** su texto es literalmente idéntico en los
  cinco módulos hoy. Abrirlos sería inventar cinco frases que nadie ha pedido y romper once
  comparaciones sin ganar nada.
- **`duplicate_symbol`, `system_unit`, `unit_in_use`, `invalid_derivation` y `presentation_in_use`
  no llevan prefijo de módulo** aunque sus vecinos sí: ya son inequívocos y R19 los congela.
  La consistencia estética no vale una migración de UI extra.

## 4. Cambios en cada módulo

### 4.1 Clases (`lib/modules/<m>/domain/errors.ts`)

La base pasa a declarar `abstract readonly code: ErrorCode`, a resolver el mensaje sola y a
aceptar un **diagnóstico** que nunca es el mensaje (R28):

```ts
import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

export abstract class InventarioError extends Error {
  abstract readonly code: ErrorCode;

  /** Dato variable para el LOG. Nunca se muestra y nunca se serializa (R29). */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code));           // R7: el mensaje NO se pasa desde fuera
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

`Object.setPrototypeOf` se conserva tal cual: sin él `instanceof` deja de funcionar y los siete
`catch` dejarían de reconocer sus propios errores.

Renombrados y particiones, con sus sitios de lanzamiento:

| Módulo | Antes | Después | Sitios |
|---|---|---|---|
| inventario | `NotFoundError` | `ProductNotFoundError` (`product_not_found`) | `domain/get-product.ts`, `domain/update-product.ts`, `domain/delete-product.ts`, `adapters/driven/persistence/product-prisma.ts` |
| inventario | `NotFoundError` | `PresentationNotFoundError` (`presentation_not_found`) | `domain/update-presentation.ts`, `domain/delete-presentation.ts` |
| inventario | `DuplicateNameError` | `PresentationDuplicateNameError` (`presentation_duplicate_name`) | `domain/create-presentation.ts`, `domain/update-presentation.ts` |
| pedidos | `NotFoundError` | `OrderNotFoundError` (`order_not_found`) | `domain/get-order.ts`, `domain/update-order.ts`, `domain/cancel-order.ts`, `domain/delete-order.ts` |
| pedidos | `RecipeNotFoundError` | igual (`recipe_not_found`) | `domain/create-order.ts`, `domain/update-order.ts` |
| proveedores | `NotFoundError` | `SupplierNotFoundError` (`supplier_not_found`) | `domain/get-supplier.ts`, `domain/update-supplier.ts`, `domain/delete-supplier.ts`, `domain/create-catalog-line.ts`, `domain/list-catalog-lines.ts` |
| proveedores | `NotFoundError` | `CatalogLineNotFoundError` (`catalog_line_not_found`) | `domain/update-catalog-line.ts`, `domain/delete-catalog-line.ts` |
| proveedores | `DuplicateNameError` | `SupplierDuplicateNameError` (`supplier_duplicate_name`) | `domain/create-supplier.ts`, `domain/update-supplier.ts` |
| recetas | `NotFoundError` | `RecipeNotFoundError` (`recipe_not_found`) | `domain/get-recipe.ts`, `domain/update-recipe.ts`, `domain/delete-recipe.ts` |
| recetas | `DuplicateNameError` | `RecipeDuplicateNameError` (`recipe_duplicate_name`) | `domain/create-recipe.ts`, `domain/update-recipe.ts` |
| unidades | `NotFoundError` | `UnitNotFoundError` (`unit_not_found`) | `domain/update-unit.ts`, `domain/delete-unit.ts` |
| unidades | `DuplicateNameError` | `UnitDuplicateNameError` (`unit_duplicate_name`) | `domain/create-unit.ts`, `domain/update-unit.ts` |

Las clases no listadas conservan nombre y código. Los cinco `index.ts` de módulo se actualizan
para reexportar los nombres nuevos.

**Los cuatro sitios con texto a medida no pierden el dato: lo mueven al diagnóstico** (decisión
cerrada del 2026-09-08, R28). `pedidos/domain/order-transitions.ts:46` y
`unidades/domain/convert-quantity.ts` (65, 98, 107, 192) pasan de componer el mensaje a pasar el
dato como segundo argumento:

```ts
// antes
throw new InvalidTransitionError(`Un pedido en estado ${from} no puede pasar a ${to}.`);
// después
throw new InvalidTransitionError(`de ${from} a ${to}`);   // -> diagnostic, solo al log
```

Lo que ve cada lado, que es **una sola regla** para el error genérico y para el de dominio con
dato variable:

```
NAVEGADOR:  "Las dos unidades no comparten unidad base: no son convertibles."
LOG:        incompatible_units
            no se puede convertir litro a gramo
```

### 4.2 El traductor único, y la regla única del diagnóstico

**Una sola regla, no dos:** al navegador va `status` + `code` + `message` (+ `reference` cuando
llegue QC-71). Todo lo demás —el diagnóstico del error de dominio, el error original del ajeno—
va **al log del servidor y solo ahí**. Antes del 2026-09-08 esto solo estaba escrito para el
error genérico; ahora cubre los dos casos con la misma frase.

```ts
// lib/modules/errores/domain/error-state.ts

/**
 * LO ÚNICO que cruza al navegador. La lista de campos es CERRADA: si crece, la guardia
 * (§5, caso 8) se pone roja, porque crecer es exactamente el fallo del que protege (R30).
 */
export type ErrorState = {
  status: 'error';
  code: ErrorCode;
  message: string;
  /** Hueco de QC-71. QC-70 NUNCA lo rellena (R15). */
  reference?: string;
};

type DomainError = { code: ErrorCode; diagnostic?: string };
type DomainErrorClass = abstract new (...args: never[]) => DomainError;

/** Lo que se escribe en el registro. NO es `ErrorState` y nunca se devuelve. */
export type ErrorLogEntry = { code: ErrorCode; diagnostic?: string; cause?: unknown };

export function createErrorStateTranslator(
  base: DomainErrorClass,
  log: (entry: ErrorLogEntry) => void = (entry) => { console.error(entry); },
) {
  return (error: unknown): ErrorState => {
    if (error instanceof base) {
      if (error.diagnostic !== undefined) log({ code: error.code, diagnostic: error.diagnostic });
      // Construcción por campos EXPLÍCITOS: nunca `...error`, que arrastraría el diagnóstico.
      return { status: 'error', code: error.code, message: errorMessage(error.code) };  // R29
    }
    log({ code: UNEXPECTED_ERROR_CODE, cause: error });                                 // R14
    return {
      status: 'error',
      code: UNEXPECTED_ERROR_CODE,
      message: errorMessage(UNEXPECTED_ERROR_CODE),                                     // R12, R13
    };
  };
}
```

Tres cosas hacen que el diagnóstico **no pueda** cruzar, y ninguna de las tres es «acordarse»:

1. **El tipo `ErrorState` no lo declara**, y los siete adaptadores devuelven `ErrorState`: añadir
   el campo obliga a tocar el tipo, y eso es lo que la guardia vigila.
2. **El objeto se construye campo a campo**, nunca con `...error` ni `Object.assign`.
3. **La guardia** (§5, casos 8 y 9) se pone roja si `ErrorState` gana un campo fuera de la lista
   o si alguien lee `.diagnostic` desde `app/**`, `components/**` o un adaptador driving.

Es una **fábrica parametrizada por la clase base**, exactamente el patrón con el que QC-54
parametriza `requireAdmin` por el `UnauthorizedError` de cada módulo: una sola implementación sin
que el código compartido tenga que conocer los cinco módulos (y sin poder conocerlos, porque
importar cinco barrels desde `errores` crearía dependencias que la tabla no contempla).

Cada uno de los siete adaptadores driving sustituye su copia por:

```ts
const toErrorState = createErrorStateTranslator(PedidosError);
```

y su tipo de estado pasa de `code: string` a `code: ErrorCode`.

`log` es un parámetro con valor por defecto **para que el test pueda espiarlo sin tocar
`console`**; QC-71 lo sustituirá por lo que decida esa ficha (el identificador de petición y el
formato del registro son suyos, no de esta).

### 4.3 Los once archivos de UI que deciden por código

| # | Archivo | Hoy | Después |
|---|---|---|---|
| 1 | `app/(private)/proveedores/[id]/page.tsx:80` | `=== 'not_found'` | `=== 'supplier_not_found'` |
| 2 | `app/(private)/proveedores/components/supplier-form.tsx:82-84,211,234` | `duplicate_name`, `not_found`, `invalid_input` | `supplier_duplicate_name`, `supplier_not_found`, `invalid_input` |
| 3 | `app/(private)/proveedores/[id]/components/catalog-line-form.tsx:104-106,283,308` | `duplicate_catalog_line`, `not_found`, `invalid_input` | igual, `catalog_line_not_found` **y** `supplier_not_found` (ver nota), `invalid_input` |
| 4 | `app/(private)/produccion/formulas/[id]/page.tsx:59` | `=== 'not_found'` | `=== 'recipe_not_found'` |
| 5 | `app/(private)/produccion/formulas/components/recipe-form.tsx:179,192,216` | `invalid_input`, `duplicate_name`, `not_found` | `invalid_input`, `recipe_duplicate_name`, `recipe_not_found` |
| 6 | `app/(private)/configuracion/presentaciones/components/presentation-form.tsx:109-113` | `duplicate_name` en `CODE_TO_FIELD`, `invalid_input` | `presentation_duplicate_name`, `invalid_input` |
| 7 | `components/shared/presentation-select.tsx:259` | `=== 'duplicate_name'` | `=== 'presentation_duplicate_name'` |
| 8 | `app/(private)/configuracion/presentaciones/components/delete-presentation-dialog.tsx:61` | `presentation_in_use` | sin cambio de valor; el literal pasa a venir del catálogo |
| 9 | `app/(private)/pedidos/components/order-form.tsx:163-170` | `recipe_not_found`, `invalid_transition`, `invalid_input` | sin cambio de valor; tipado con `ErrorCode` |
| 10 | `app/(private)/pedidos/components/cancel-order-dialog.tsx:82,118` | fabrica `invalid_input` | sin cambio de valor; el literal pasa a venir del catálogo (R21) |
| 11 | `app/(private)/inventario/components/product-form.tsx:97,196` | fabrica `invalid_input` | ídem |

**Nota sobre el 3.** `catalog-line-form.tsx` recibe hoy un único `not_found` que puede significar
dos cosas: la línea no existe (`update`/`delete`) o el proveedor no existe (`create`, que traduce
`'supplier_not_found'` del repositorio). Al abrirlo, el formulario debe tratar **los dos**
códigos, y ese es el ejemplo más limpio de por qué la apertura era necesaria: hoy la pantalla
muestra la misma frase para dos situaciones distintas.

Los archivos que solo **pintan** el código (`data-code={error.code}` en
`delete-order-dialog.tsx` y `delete-presentation-dialog.tsx`, `{state.code}` en los formularios)
no comparan y solo cambian de tipo.

## 5. La guardia: `tests/guards/guard-catalogo-de-errores.test.ts`

Misma forma que `guard-arquitectura-modulos.test.ts`: **funciones puras exportadas** que reciben
el contenido leído del disco y devuelven hallazgos, más un caso que las alimenta con el
repositorio real. Así se puede probar que **muerde** sin ensuciar el árbol.

Qué comprueba (y por tanto qué la pone roja):

1. **Código fuera del catálogo (R22).** Extrae de cada `lib/modules/*/domain/errors.ts` los
   `readonly code = '<x>'` y verifica `<x> ∈ ERROR_CODES`.
2. **Traductor duplicado (R23).** Ningún archivo fuera de
   `lib/modules/errores/domain/error-state.ts` define una función que devuelva
   `{ status: 'error', … }` a partir de un `instanceof`; en particular, `toErrorState` no vuelve
   a declararse como `function` en ningún adaptador driving.
3. **Mensaje sobreescribible (R24).** Ningún constructor de clase de error declara un parámetro
   `message`.
4. **Familia (R6).** Toda clase de `errors.ts` extiende la base del módulo, y la base extiende
   `Error`.
5. **Entradas huérfanas (R9).** Todo código del catálogo lo declara alguna clase, salvo
   `unexpected`.
6. **Texto duplicado (R4).** No hay dos claves con el mismo texto.
7. **Genéricos prohibidos (R16, R20).** `not_found` y `duplicate_name` no aparecen ni en el
   catálogo ni como literal comparado en `app/**` ni en `components/**`.
8. **Forma cerrada de `ErrorState` (R30).** Los campos declarados en el tipo son exactamente
   `status`, `code`, `message` y `reference`. Un campo de más —empezando por `diagnostic`— es
   hallazgo. Se lee el tipo del archivo, no una instancia: así muerde el día que alguien lo
   **declare**, sin necesidad de que llegue a ejecutarse.
9. **Diagnóstico fuera de la serialización (R29, R30).** Ni `app/**`, ni `components/**`, ni
   ningún `adapters/driving/**` leen `.diagnostic`; y el traductor no usa `...error` ni
   `Object.assign` para construir el estado.

Por qué **guardia y no solo test**: un test comprueba que **hoy** el objeto no lleva el campo; la
guardia comprueba que **nadie puede añadirlo** sin ponerse roja, que es lo que pidió el humano el
2026-09-08. Van las dos: el test unitario del traductor fija el comportamiento (§ T2), la guardia
fija la forma.

Cómo se prueba que muerde: cada función pura recibe una entrada sintética que viola la regla y se
comprueba que devuelve el hallazgo con el archivo y el código nombrados; y una entrada correcta,
que devuelve lista vacía. El caso que lee el repositorio real debe salir vacío.

## 6. Dependencias

**Ninguna nueva.** El catálogo es un objeto literal y dos mapas; la «preparación para traducir»
es la indirección código → clave → texto, no una librería. `package.json` no cambia, así que
`guard-dependencias-aprobadas.test.ts` sigue verde sin tocar `docs/dependencias.md`.

Antes de escribirlo a mano se consideró `i18next` / `next-intl` (`docs/architecture.md >
Dependencias de terceros` obliga a mirar primero): **descartadas por decisión cerrada** del
2026-09-07 —la internacionalización de la aplicación es QC-72 y hoy no está decidida en ningún
sitio—, no por criterio propio. Por eso no se corren los cuatro checks: no se propone ninguna.

## 6 bis. La validación del front no se toca

Decisión cerrada del 2026-09-08. Frontera, en dos frases:

- **Lo que el front valida por su cuenta se queda igual**: campo requerido, formato, el
  `FORM_ERROR_MESSAGE` («Revisa los campos marcados.»), el `REASON_REQUIRED` del diálogo de
  cancelación. Esos textos son del formulario, no del catálogo, y esta ficha no los migra.
- **Lo que el back emite manda**: cuando una acción devuelve `{ status: 'error', code, message }`,
  la pantalla pinta **ese** `message`. Ninguna pantalla puede sustituirlo por un texto propio para
  ese mismo código (R32). Hoy hay dos sitios que lo hacen y se corrigen en el bloque C:
  `supplier-form.tsx:211` (`DUPLICATE_NAME_MESSAGE` propio) y
  `components/shared/presentation-select.tsx:259` (`DUPLICATE_NAME_MESSAGE` propio). El resto ya
  usa `result.message`.

Lo único que cambia en los `INVALID_INPUT_CODE` locales es de dónde sale **el código** (del
catálogo, R21), no el mensaje que el front pone junto a él.

## 6 ter. El E2E, y por qué solo uno

Decisión cerrada del 2026-09-08: **sí hace falta**, porque el error ajeno pasa de reventar la
pantalla a pintarse dentro de ella, y eso no lo ve ningún unitario.

- **`e2e/errores.spec.ts`** (nuevo), un solo caso: se provoca desde el navegador una acción de
  servidor que falla con un error **que no es de dominio**, y se comprueba que (a) la pantalla
  sigue en pie, (b) muestra el mensaje neutro de `unexpected`, (c) el HTML **no** contiene
  `Prisma`, `relation`, ningún nombre de tabla ni la palabra del diagnóstico (R33, R13).
- **Cómo se provoca sin código de producción para tests:** navegando a una ficha con un
  identificador con forma válida de texto pero que la base rechaza (p. ej.
  `/produccion/formulas/<id-que-no-es-uuid>`), de modo que el error nace en Prisma y no en el
  dominio. **El implementer debe confirmarlo antes de escribir el caso**: si ese id se valida
  antes y sale un error de dominio, el camino no sirve y hay que buscar otro que sí llegue a
  Prisma. Si no existe ninguno alcanzable desde el navegador, **se para y se dice**: no se
  inventa un `throw` de mentira en producción para que el E2E pase.
- **Por qué no más de uno:** el resto del cambio —valores de código y textos— ya lo cubren los
  unitarios de los cinco módulos y de los once archivos de UI, y ahí el motivo heredado de QC-54
  sigue siendo bueno. Un E2E por pantalla sería pagar minutos de Playwright por lo que un
  `render` ya prueba.

## 7. Lo que NO se toca

- `db/`: ni esquema, ni migración, ni `down.sql`, ni seed.
- `lib/modules/identity/**` y sus tests: sin familia que migrar y con un mensaje de login
  deliberadamente genérico (QC-7).
- `lib/composition/index.ts`: el traductor no es un puerto ni se cablea; se construye en cada
  adaptador driving a partir de su propia clase base.
- El identificador de petición y el formato del log: QC-71.

## 8. Riesgo de conflicto con las features en curso

Medido contra los `tasks.md` de los worktrees hermanos el 2026-09-08.

| Feature | Zona | Solape de archivos | Veredicto |
|---|---|---|---|
| **QC-83** `modelo-de-grupos-de-trabajo` | backend | Ninguno. Toca `lib/modules/identity/domain/**`, `lib/modules/identity/index.ts`, `db/schema.prisma`, `tests/unit/identity/**`, `tests/integration/identity/**`, `tests/guards/guard-rls-force.test.ts`. QC-70 excluye `identity` y `db/` por decisión cerrada. | **Sin conflicto.** |
| **QC-39** `pantalla-de-unidades` | frontend | **`lib/modules/unidades/index.ts`** lo tocan las dos: QC-39 para exportar `unit-view`, QC-70 para reexportar `UnitNotFoundError` / `UnitDuplicateNameError`. Conflicto textual de una sola zona del archivo. | **Conflicto real, acotado.** |

Además de ese archivo, QC-39 tiene un **conflicto semántico** que no se ve comparando rutas: su
pantalla decide por los códigos de `unidades` —su `tasks.md` los nombra: `duplicate_name`,
`duplicate_symbol`, `invalid_derivation`, `unit_in_use`, `system_unit`, `unauthorized`— en
archivos que **todavía no existen** en `dev` (`app/(private)/configuracion/unidades/**`,
`tests/unit/configuracion-ui/**`). QC-70 renombra dos de esos códigos:
`duplicate_name → unit_duplicate_name` y `not_found → unit_not_found`. Quien mergee **segundo**
tiene que actualizar esos dos literales; no hay forma de evitarlo sin dejar `duplicate_name`
significando cuatro cosas, que es justo lo que la ficha quita. Está escrito aquí para que el
leader lo decida antes y no lo descubra en el merge.

`tests/guards/guard-dependencias-aprobadas.test.ts` lo *ejecutan* las tres features, pero
ninguna lo edita.

## 9. Trazabilidad prevista

El mapa definitivo `R<n> -> test` lo escribe el implementer en
`progress/impl_QC-70-errores-centralizados.md`. La distribución prevista:

- R1-R5, R16-R19 → `tests/unit/errores/catalogo.test.ts` (+ un caso de tipos con
  `@ts-expect-error` para R2).
- R6-R9, R22-R24 → `tests/guards/guard-catalogo-de-errores.test.ts`.
- R10-R15 → `tests/unit/errores/to-error-state.test.ts` y las siete suites de acciones.
- R20, R21 → las suites de UI de los once archivos de §4.3.
- R25 → un caso del guard (ningún código de `identity` en el catálogo) más `git diff` vacío en
  `db/` verificado por el reviewer.
- R26 → `tests/guards/guard-autorizacion-por-permiso.test.ts` y las suites de `actor.ts`.
- R27 → la suite completa (`./init.sh`) verde.
- R28, R29 → `tests/unit/errores/to-error-state.test.ts` (el espía de `log` recibe el
  diagnóstico; `JSON.stringify(state)` no lo contiene) y las suites de `order-transitions` y
  `convert-quantity`.
- R30 → `tests/guards/guard-catalogo-de-errores.test.ts`, casos 8 y 9.
- R31, R32 → las suites de UI del bloque C (los textos propios del formulario siguen; el mensaje
  del back se pinta tal cual).
- R33 → `e2e/errores.spec.ts`.
