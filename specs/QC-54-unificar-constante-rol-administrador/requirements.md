# QC-54 — unificar-constante-rol-administrador · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** ninguno ·
> **Rama** `feature/QC-54-unificar-constante-rol-administrador`
>
> ## Alcance
>
> Dejar **una sola definición de «es Administrador»** en el repo: la constante
> `ROLE_ADMINISTRADOR` de `identity/domain/roles.ts` y **una sola implementación de la regla**
> de autorización. Hoy el literal `'Administrador'` está declarado cuatro veces y la función
> `requireAdmin` está copiada cinco, con el mismo cuerpo. Se retiran las tres copias del
> literal —incluidos los `export` de los barriles de `inventario`, `recetas` y `unidades`—,
> los cinco `requireAdmin` pasan a delegar en una implementación única publicada por
> `identity`, y entra una guardia ejecutable que impide que el próximo módulo vuelva a
> declarar el suyo.
>
> El valor de la cadena **no cambia**: `'Administrador'` viaja firmado en la cookie de sesión
> (QC-8/QC-9) y está en `SEED_ROLES`, o sea en la base. Esta ficha mueve de dónde se lee el
> literal, nunca el literal.
>
> ## Lo que NO entra
>
> - **Nada de UI.** No se abre `app/` ni `components/`.
> - **Ningún cambio en `db/`**: ni migración, ni esquema, ni seed.
> - **El tipo `Actor`, que también está copiado en los cinco módulos**, se queda como está y
>   no se unifica: son dos campos y compartirlo acoplaría los tipos de dominio de cinco
>   módulos para ahorrar cuatro líneas. Anotado, sin ficha.
> - **La jerarquía de errores por módulo no se toca**: cada uno conserva su
>   `UnauthorizedError` extendiendo su clase base.
>
> _Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). «Código de producción» = `lib/**`, `app/**`, `components/**`,
> `hooks/**` y los `.ts`/`.tsx` de primer nivel de la raíz; `tests/`, `e2e/`, `scripts/` y `db/` no
> lo son. «Los cinco módulos» = `inventario`, `recetas`, `unidades`, `pedidos` y `proveedores`.

### El literal: una sola declaración

**R1.** El sistema DEBE tener **exactamente una** declaración del literal del rol Administrador en
todo el código de producción: `ROLE_ADMINISTRADOR`, en
`lib/modules/identity/domain/roles.ts`.

**R2.** Los contratos públicos de `inventario`, `recetas` y `unidades` NO DEBEN exportar ninguna
constante con el nombre del rol Administrador, y sus `domain/actor.ts` NO DEBEN declarar ninguna:
`ADMIN_ROLE_NAME` deja de existir como símbolo en el repositorio.

**R3.** SI un archivo de producción necesita nombrar el rol Administrador, ENTONCES DEBE obtenerlo
importando `ROLE_ADMINISTRADOR` del **barrel** `@/lib/modules/identity` —nunca por ruta profunda,
nunca desde el barrel de otro módulo, nunca reescribiendo la cadena.

**R4.** El valor de `ROLE_ADMINISTRADOR` DEBE seguir siendo exactamente `'Administrador'`, carácter
por carácter.

**R5.** El sistema NO DEBE cambiar nada bajo `db/`: ni el esquema, ni una migración nueva, ni el
seed. `SEED_ROLES` DEBE seguir derivando el nombre del rol de `ROLE_ADMINISTRADOR`.

### La regla: una sola implementación

**R6.** El sistema DEBE tener **una sola** implementación de la comprobación «el actor tiene el rol
Administrador», publicada por el contrato público de `identity`, y el `requireAdmin` de **cada uno
de los cinco módulos** DEBE delegar en ella sin volver a escribir la comparación.

**R7.** La implementación única DEBE recibir de quien la llama la **fábrica del error** que se lanza
cuando la comprobación falla, y NO DEBE declarar, construir ni exportar ninguna clase de error de
autorización propia.

**R8.** CUANDO se invoca el `requireAdmin` de un módulo con un actor ausente (`null` o `undefined`),
con `roleName` nulo, con `roleName` vacío, o con un `roleName` que no sea **exactamente igual** a
`ROLE_ADMINISTRADOR` —«Operador», «Supervisor» o «Administradores externos» incluidos—, el sistema
DEBE lanzar el `UnauthorizedError` **de ese módulo**, que sigue extendiendo la clase base de ese
módulo, y DEBE hacerlo **antes** de tocar ningún puerto.

**R9.** CUANDO se invoca el `requireAdmin` de un módulo con un actor cuyo `roleName` es exactamente
igual a `ROLE_ADMINISTRADOR`, el sistema DEBE dejar continuar el caso de uso, en los cinco módulos.

**R10.** Cada uno de los cinco módulos DEBE conservar su propio tipo `Actor` y su propia jerarquía
de errores sin cambios, y los **siete adaptadores driving** que serializan con
`error instanceof <Modulo>Error` DEBEN seguir produciendo el mismo estado serializable
(`{ status: 'error', code, message }`) que producen hoy, con el mismo `code`.

### La guardia contra la reincidencia

**R11.** MIENTRAS exista un archivo de código de producción distinto de
`lib/modules/identity/domain/roles.ts` que declare el nombre del rol Administrador como literal de
cadena, la verificación DEBE fallar.

**R12.** La guardia DEBE **derivar** el texto que busca del valor de `ROLE_ADMINISTRADOR` en vez de
reescribirlo, DEBE reconocer las tres formas de comilla (`'`, `"`, `` ` ``), DEBE descartar los
comentarios antes de juzgar el archivo —la prosa de un `actor.ts` que advierte sobre
«Administradores externos» no es una infracción— y DEBE demostrar con fuentes sintéticos que da rojo
ante una reincidencia y verde en el caso simétrico.

### El borde y el cableado de rutas

**R13.** `ROUTE_ROLE_RULES` DEBE seguir declarando las mismas tres filas
(`INVENTORY_ROUTE`, `FORMULAS_ROUTE`, `SUPPLIERS_ROUTE`) con el mismo rol, tomándolo de
`@/lib/modules/identity`.

**R14.** MIENTRAS `middleware.ts` alcance `lib/composition/route-role-rules.ts`, el cierre de
imports desde `middleware.ts` NO DEBE alcanzar `node:crypto`, `crypto`, `@prisma/client`,
`next/headers` ni el cliente Prisma compartido.

### Comportamiento invariante y documentación

**R15.** El sistema NO DEBE cambiar ningún comportamiento observable: los tests de autorización que
ya existen en los cinco módulos DEBEN seguir verdes **sin que cambie ninguna aserción, ningún dato
de prueba ni ninguna expectativa** —el único cambio admisible en ellos es cómo obtienen el nombre
del rol—, y NO DEBE añadirse ningún E2E nuevo por esta ficha.

**R16.** El centinela `tests/unit/inventario/schema/inventario-schema.test.ts` NO DEBE modificarse y
DEBE seguir verde.

**R17.** Ningún comentario ni cabecera de código de producción DEBE seguir afirmando que nombrar el
rol Administrador exige el barrel de `inventario` ni que `identity` no publica constantes de rol; en
particular, las cabeceras de `lib/composition/route-role-rules.ts`,
`lib/modules/identity/index.ts` y `lib/modules/identity/domain/route-role-rules.ts` DEBEN describir
el estado que deja esta ficha.

### Cobertura de las decisiones cerradas

| Decisión | Requisito(s) |
|---|---|
| 1 — el `export` desaparece de los tres barriles | R2, R3 |
| 2 — también se unifica la función | R6 |
| 3 — `requireAdmin` parametrizado por el error | R7, R8, R10 |
| 4 — guardia ejecutable contra la reincidencia | R11, R12 |
| 5 — sin E2E; valen los tests que ya existen | R15 |
| 6 — el literal no se renombra | R4, R5 |
| 7 — no se revierte nada del centinela de `inventario` | R16 |
| 8 — mover el import a `identity` no arriesga el borde | R13, R14 |
| 9 — el patrón destino sale de `pedidos` y `proveedores` | R6, R9 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-07 | ¿Qué pasa con el `export` de `ADMIN_ROLE_NAME` en los barriles de `inventario`, `recetas` y `unidades`? | **Desaparece de los tres.** Los ~20 consumidores pasan a `ROLE_ADMINISTRADOR` de `@/lib/modules/identity`. Se descartó dejarlo como re-export: mantendría dos nombres vivos para la misma cosa y nada obligaría a migrar, o sea la deuda cambiaría de forma en vez de cerrarse. El que se olvide de migrar rompe el typecheck, que es donde se quiere que rompa. |
| 2026-09-07 | ¿La ficha unifica solo el literal, o también los cinco `requireAdmin` idénticos? | **También la función.** Por eso la `complexity` subió de `medium` a `high` y la `description` del board se actualizó antes de sembrar. |
| 2026-09-07 | ¿Cómo se unifica `requireAdmin` sin romper los siete `catch` que hacen `instanceof <Modulo>Error`? | **`requireAdmin` parametrizado por el error.** `identity` publica una implementación genérica que recibe una fábrica de error (`onDenied`), y el `requireAdmin` de cada módulo la envuelve pasándole su propio `UnauthorizedError`. Es la única de las tres opciones que **no toca comportamiento**: cada error sigue extendiendo la base de su módulo, los siete adaptadores driving siguen serializando igual y ningún test de error cambia. Se descartó un `UnauthorizedError` compartido justamente por eso — no puede extender cinco clases base a la vez, y caería fuera de los siete `catch`. |
| 2026-09-07 | ¿Entra una guardia contra la reincidencia? | **Sí, guardia ejecutable en `tests/guards`**: barre `lib/modules` y da rojo si el literal `'Administrador'` aparece declarado fuera de `identity/domain/roles.ts`. Mismo patrón que QC-61 propone para la columna de empresa. Sin ella la ficha limpia el presente y no el futuro, que es el motivo por el que existe: cuatro módulos declararon el suyo teniendo uno bueno delante. |
| 2026-09-07 | ¿Hace falta E2E? | **No, y se difiere aquí con motivo.** Es un refactor sin cambio de comportamiento observable: la prueba de que nada se movió son los tests de autorización que ya existen en los cinco módulos, que deben seguir verdes **sin tocarlos salvo el `import`**. Un E2E nuevo no verificaría nada que esos no verifiquen ya. |
| 2026-09-07 | El literal viaja firmado en la cookie y está en `SEED_ROLES`. ¿Se puede renombrar? | **No.** Renombrar `'Administrador'` invalidaría todas las sesiones vivas y desalinearía el seed de la base. La ficha mueve el origen del literal, nunca su valor. |
| 2026-09-07 | ¿Se revierte la acotación del centinela de `inventario-schema.test.ts` que la ficha atribuye a este import? | **No hay nada que revertir: la premisa de la ficha era falsa y se midió.** `lib/composition/**` nunca estuvo vigilado (no está entre las `raicesVigiladas`, así que el barrido no llega a leer sus archivos y `route-role-rules.ts` quedó satisfecho por construcción, no por una exención). Y la acotación del 2026-09-03 fue por otra cosa: permitir que un formulario de cliente importe un esquema zod del contrato. Ese párrafo de la `description` se corrigió en el board antes de sembrar. |
| 2026-09-07 | ¿Mover el import de `route-role-rules.ts` a `identity` pone en riesgo el borde? | **No, medido.** `route-guard-middleware.ts`, que sí está en el cierre que vigila `guard-middleware-edge`, ya importa el barrel de `identity` **como valor** (`decideRouteAccess`, `isSessionExpired`). Leer de ahí `ROLE_ADMINISTRADOR` no añade un solo import nuevo al borde. |
| 2026-09-07 | ¿De dónde sale el patrón destino? | **Heredado de QC-43 (proveedores) y QC-34 (pedidos)**, que ya importan `ROLE_ADMINISTRADOR` de `@/lib/modules/identity` en su `domain/actor.ts`. No son trabajo pendiente: son la forma a la que se llevan los otros tres. (La `description` decía «solo proveedores»; son dos, corregido en el board.) |
