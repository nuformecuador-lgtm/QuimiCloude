# QC-19 — politica-de-contrasenas · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-6`, `QC-7` ·
> **Rama** `feature/QC-19-politica-de-contrasenas` · **Épica** `QC-17 Identidad y acceso`
>
> **Alcance.** Definir qué hace aceptable una contraseña y hacerlo cumplir en todos los sitios
> donde alguien la fija o la cambia. Una contraseña vale si tiene **al menos 8 caracteres** e
> incluye **mayúscula, minúscula, número y símbolo**, y si no está en una lista de contraseñas
> filtradas conocidas. Cuando se rechaza, la regla devuelve **qué requisito falló**, no un
> «contraseña inválida» genérico.
>
> **Lo que NO entra.** La ayuda visual mientras se escribe —los requisitos marcándose a medida
> que se cumplen— es **QC-21**, creada el 2026-09-01 y bloqueada por esta. La caducidad de
> contraseñas y el historial de anteriores: se **descartaron** aquí, no se difirieron. Validar la
> contraseña que un usuario ya tiene guardada: quien no cumpla sigue entrando con normalidad. Y
> la marca de «debe cambiar la contraseña» en `users`, que ya la crea **QC-6**.
>
> Sembrado por `/afinar-feature` el 2026-09-01. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Qué cuenta como «símbolo».** Cualquier carácter que no sea letra ni dígito, o una lista
   cerrada. Afecta al texto del mensaje de error, no al diseño: se decide al escribir el
   requisito.
2. **De dónde sale la lista de contraseñas filtradas y cuánto pesa.** Depende de qué librería
   pase los cuatro checks de salud. Si ninguna convence, la decisión de «librería para la lista»
   se reabre — es el único punto de esta ficha que puede volver al humano.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-01 | ¿Qué hace aceptable una contraseña? | **Mínimo 8 caracteres, con mayúscula, minúscula, número y símbolo**, y que no esté entre las contraseñas filtradas conocidas. |
| 2026-09-01 | ¿Caduca con el tiempo? | **No.** Solo se fuerza el cambio cuando hay un motivo concreto: el primer ingreso del usuario sembrado (**QC-6**) o un reseteo. |
| 2026-09-01 | ¿Se puede repetir una contraseña anterior? | **Sí; no se guarda historial.** No hay tabla ni columna de contraseñas viejas. Descartado, no diferido. |
| 2026-09-01 | ¿Librería o reglas propias? | **Las dos cosas.** Largo y composición son comprobaciones propias: son tres líneas y no justifican una dependencia. La **lista de contraseñas filtradas sí viene de una librería**, que no tiene sentido mantener a mano. Esa dependencia entra por la regla 7 de `CLAUDE.md`: cuatro checks de salud, fila en `docs/dependencias.md` y **aprobación humana antes de instalarla**. |
| 2026-09-01 | ¿Y quien ya tiene una contraseña que no cumple? | **Sigue entrando.** La regla solo se aplica al fijar una nueva. Nadie queda fuera por una regla inventada después, y hoy no hay ningún usuario con contraseña elegida por él. |
| 2026-09-01 | ¿Entra la ayuda visual mientras se escribe? | **No**, va en **QC-21**. Por eso QC-19 es `backend` puro y **no se parte**. |
| 2026-09-01 | ¿La regla vive en el dominio o en el borde? | En el **dominio de `identity`**, no en un esquema `zod` de una pantalla: es la única forma de que el seed, el cambio de contraseña y cualquier alta futura compartan la misma regla en vez de tres copias que se desincronizan. |
| 2026-09-01 | Idioma y convenciones del esquema | Heredado de **QC-4**. Esta ficha **no añade columnas**: es regla, no persistencia. |
| 2026-09-01 | ¿Hace falta E2E (Playwright)? | **No, y se difiere con motivo.** La regla no tiene interfaz propia; el E2E que la ejercite nace con **QC-21**, que sí es pantalla. Aquí la verificación son tests unitarios del dominio: cada requisito rechazado por separado, y el mensaje que devuelve en cada caso. |
