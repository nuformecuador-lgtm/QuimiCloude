# requirements.md — Feature 5: hash-y-verificacion-de-contrasena

> Zona: `backend` · Complexity: `low` · Branch: `feature/5-hash-y-verificacion-de-contrasena` · `depends_on: 4`
>
> **Reescrito el 2026-08-06 por decision del humano:** «no hacia falta algo tan complejo, solo
> haz bcrypt de la password y guardala encriptada, genera un util para la comparacion y la
> encriptacion y ya, remueve lo demas». Esta version sustituye entera a la anterior (scrypt con
> formato PHC, parametros configurables y medicion de coste). Lo que salio, salio: no son
> preguntas abiertas, ya no son parte de la feature.

## Alcance

Un modulo util con **dos funciones**:

1. **Transformar** una contrasena en un valor almacenable no reversible (bcrypt).
2. **Comparar** una contrasena escrita contra el valor guardado.

**Fuera de alcance:** el seed (feature 3), el login (feature 4), la sesion y la cookie, el alta
de usuarios y cualquier UI. Esta feature no expone rutas, ni Server Actions, ni servicios, ni
toca la base de datos.

**Una excepcion, decidida por el humano el 2026-08-06:** el esquema de validacion del login que
dejo la feature 7 (`lib/types/auth.ts`) gana un **maximo de 64 caracteres** en la contrasena.
Es la respuesta al limite de 72 bytes de bcrypt: sin tope, bcrypt truncaria en silencio y la
garantia de este modulo seria falsa (**R10**, `design.md > 5`).

**Precondicion heredada de la feature 1** (ya en `dev`): `users.password_hash` existe como
`text NOT NULL`, sin longitud declarada. **No hay cambio de esquema en esta feature.**

Notacion: EARS (`docs/specs.md`).

---

## Requisitos

**R1.** El sistema DEBE transformar una contrasena en un valor de texto almacenable, y ese valor
NO DEBE contener la contrasena en claro.

**R2.** CUANDO se transforma dos veces la misma contrasena, el sistema DEBE producir dos valores
almacenados distintos, y ambos DEBEN verificar correctamente contra esa contrasena.

**R3.** CUANDO se verifica una contrasena que corresponde al valor guardado, el sistema DEBE
responder que coincide.

**R4.** CUANDO se verifica una contrasena que no corresponde al valor guardado, el sistema DEBE
responder que no coincide.

**R5.** SI el valor guardado esta vacio, no tiene el formato de un hash bcrypt o esta corrupto,
ENTONCES el sistema DEBE responder que no coincide, nunca que coincide, y NO DEBE lanzar.

**R6.** El sistema DEBE usar bcrypt con un coste de 10 rondas, y ese coste DEBE quedar declarado
dentro del propio valor guardado.

**R7.** El sistema DEBE producir un valor guardado que quepa en la columna `password_hash`
existente sin ningun cambio de esquema.

**R8.** El sistema NO DEBE escribir por ningun canal de salida la contrasena recibida ni el
valor guardado.

### Limite de longitud

**R9.** SI la contrasena que recibe la funcion de transformacion ocupa mas de **72 bytes
codificada en UTF-8**, ENTONCES el sistema DEBE rechazar la operacion lanzando un error y NO
DEBE producir ningun valor guardado.

**R10.** SI la validacion del formulario de login recibe una contrasena de mas de **64
caracteres**, ENTONCES DEBE rechazarla con un mensaje de error en el campo de contrasena y NO
DEBE intentar autenticar.

---

## Preguntas abiertas

Ninguna bloquea la implementacion.

1. **Politica de contrasena** (longitud minima, complejidad, contrasena vacia): no esta definida
   en ningun sitio y esta feature **no la impone** — transforma lo que reciba. Si existe, es
   validacion de borde (zod) en el alta de usuarios o en el login, no aqui.
