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

_Pendiente: los escribe spec_author (F1.2)._

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
