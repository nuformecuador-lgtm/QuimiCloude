# QC-234 — cifrado-de-secretos-de-integraciones · requirements.md

> Zona: backend · Complejidad: low · Épica: QC-220 «Integraciones» · depends_on: — · Bloquea a:
> QC-237 «Conexión de WhatsApp por empresa» · Rama: feature/QC-234-cifrado-de-secretos-de-integraciones
>
> **Alcance.** El módulo `integraciones` gana la capacidad de guardar secretos de terceros cifrados
> en la base de datos y leerlos en claro solo cuando los necesita. Es la base de la conexión de
> WhatsApp (token de acceso y app secret de Meta) y de cualquier integración futura por empresa.
>
> - Puerto `SecretCipher` en `lib/modules/integraciones/ports/` con dos operaciones: cifrar y
>   descifrar. Recibe el texto y un contexto (empresa, registro y campo) que liga el resultado a su
>   fila: un secreto copiado a otra fila o a otro campo no se descifra.
> - Adapter AES-256-GCM con `node:crypto`, sin dependencias nuevas. IV aleatorio de 12 bytes por
>   cada cifrado. Formato guardado autodescriptivo: `v<n>:<iv>:<tag>:<ciphertext>` en base64.
> - Clave maestra en variables de entorno, con versiones para rotar: `INTEGRATIONS_ENCRYPTION_KEYS`
>   (lista `v1:<base64 de 32 bytes>,v2:…`) e `INTEGRATIONS_ENCRYPTION_ACTIVE` (versión con la que
>   se cifra). Se descifra con la versión que indica el propio valor guardado. Se leen al llamar,
>   no al importar. Si falta una variable, el error nombra la variable, nunca su valor.
> - Helper de hash SHA-256 para los secretos que solo se comparan (verify token), con comparación
>   en tiempo constante.
> - Cableado en `lib/composition/index.ts`.
>
> **Lo que NO entra.** Ninguna tabla ni migración (las crea la ficha de conexión de WhatsApp,
> QC-237). UI. Comando de re-cifrado masivo para rotar la clave: se anota como deuda. KMS externo o
> Supabase Vault.
>
> Este archivo **no venía sembrado** por `/afinar-feature`. El Alcance y la tabla de «Decisiones
> cerradas» son la ficha de Jira QC-234, aprobada por el humano el 2026-10-09, copiada tal cual.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Entre corchetes, la fila de «Decisiones cerradas» de la que sale
> cada requisito (**D1**–**D5**) o **[A]** si sale del bloque de Alcance.
>
> Vocabulario fijo de este documento (el cómo está en `design.md`):
>
> - «el cifrador» = la implementación del puerto `SecretCipher` que expone la composición.
> - «el resumidor» = la implementación del puerto `SecretDigest` (el helper de hash) que expone la
>   composición.
> - «el contexto» = la terna (empresa, registro, campo) que acompaña a cada cifrado y descifrado.
> - «el valor guardado» = la cadena que devuelve el cifrador y que se persiste en la base.
> - «las variables» = `INTEGRATIONS_ENCRYPTION_KEYS` («la lista de claves») e
>   `INTEGRATIONS_ENCRYPTION_ACTIVE` («la versión activa»).
> - «error de secreto ilegible» = el error de dominio del módulo con código
>   `integration_secret_unreadable` (`design.md > 4`).

### Cifrar y descifrar

**R1.** CUANDO se cifra un texto con un contexto y después se descifra el valor guardado con el
mismo contexto, el cifrador DEBE devolver exactamente el texto original. Vale para texto ASCII, para
texto con caracteres no ASCII (tildes, `ñ`, emoji) y para textos de 1 y de 4096 caracteres. [A, D1]

**R2.** CUANDO se cifra dos veces el mismo texto con el mismo contexto y la misma versión activa,
el cifrador DEBE devolver dos valores guardados distintos, con IV distintos, y los dos DEBEN
descifrarse al texto original. [A, D1]

**R3.** El valor guardado DEBE tener la forma `v<n>:<iv>:<tag>:<ciphertext>`:

- `v<n>` es la versión activa en el momento de cifrar;
- `<iv>`, `<tag>` y `<ciphertext>` van en base64 estándar;
- `<iv>` decodifica a 12 bytes y `<tag>` a 16 bytes.

El valor guardado NO DEBE contener el texto en claro ni su codificación en base64. [A, D1, D2]

**R4.** SI se altera un solo carácter del IV, del tag o del ciphertext de un valor guardado,
ENTONCES descifrarlo DEBE fallar con el error de secreto ilegible. NO DEBE devolver ningún texto y
NO DEBE dejar escapar la excepción de `node:crypto`. [D1]

**R5.** SI se descifra un valor guardado con un contexto que difiere del usado al cifrar en la
empresa, en el registro o en el campo, ENTONCES el cifrador DEBE fallar con el error de secreto
ilegible. [D3]

**R6.** El cifrador DEBE ligar el valor guardado al contexto sin ambigüedad: dos contextos distintos
cuyos componentes, unidos con `:`, dan la misma cadena (por ejemplo `('a:b', 'c', 'd')` y
`('a', 'b:c', 'd')`) NO DEBEN poder descifrar el uno el valor guardado del otro. [D3]

**R7.** SI el valor guardado no tiene la forma de R3, ENTONCES descifrarlo DEBE fallar con el error
de secreto ilegible. Cuenta como forma inválida cualquiera de estos casos:

- un número de partes separadas por `:` distinto de cuatro;
- una versión que no es `v` seguida de un entero positivo sin ceros a la izquierda;
- una parte vacía o que no es base64 estándar;
- un IV que no decodifica a 12 bytes o un tag que no decodifica a 16. [A]

**R8.** SI el valor guardado indica una versión que no está en la lista de claves, ENTONCES
descifrarlo DEBE fallar con el error de secreto ilegible. Su diagnóstico DEBE nombrar esa versión y
NO DEBE contener ninguna clave. [D2]

### Versiones de la clave

**R9.** CUANDO se cifra, el cifrador DEBE usar la clave de la versión activa. CUANDO se descifra,
DEBE usar la clave de la versión que indica el valor guardado, sea cual sea la versión activa. En
particular, un valor cifrado con `v1` DEBE descifrarse después de activar `v2`, mientras `v1` siga
en la lista de claves. [D2]

**R10.** El sistema DEBE leer las variables en cada llamada al cifrador, nunca al importar un
archivo:

- importar el módulo y la composición sin ninguna de las dos variables definida NO DEBE fallar;
- un cambio en las variables entre dos llamadas DEBE reflejarse en la segunda. [A, D2]

**R11.** SI la lista de claves falta o está vacía (o solo tiene espacios), ENTONCES cifrar y
descifrar DEBEN fallar con un error cuyo mensaje nombra `INTEGRATIONS_ENCRYPTION_KEYS`. El mismo
error DEBE darse en cada uno de estos casos:

- una entrada de la lista no tiene la forma `v<n>:<base64>`;
- una clave no decodifica a exactamente 32 bytes;
- una versión aparece dos veces.

Cuando la entrada culpable tiene una versión bien formada, el mensaje DEBE nombrarla; si no, DEBE
dar su posición en la lista. Ni el mensaje ni ninguna otra propiedad del error DEBEN contener
ningún fragmento del valor de la variable que no sea esa versión. [A, D2]

**R12.** SI la versión activa falta, está vacía, no tiene la forma `v<n>` o nombra una versión que
no está en la lista de claves, ENTONCES cifrar DEBE fallar con un error cuyo mensaje nombra
`INTEGRATIONS_ENCRYPTION_ACTIVE`. El error NO DEBE contener el valor de ninguna de las dos
variables. Descifrar NO DEBE depender de la versión activa: DEBE funcionar aunque esa variable
falte. [A, D2]

### Entradas y fugas

**R13.** SI se pide cifrar un texto vacío, o cifrar o descifrar con un contexto en el que la
empresa, el registro o el campo están vacíos, ENTONCES el cifrador DEBE fallar con el error de
dominio de entrada inválida (código `invalid_input`) del módulo, sin producir ningún valor guardado.
[A, D6]

**R14.** Ningún error que lancen el cifrador o el resumidor DEBE contener en su mensaje ni en su
diagnóstico el texto en claro, ninguna clave ni el valor guardado. Ninguna operación del cifrador
ni del resumidor, tampoco al fallar, DEBE escribir en la consola. [A, D1]

### El resumen de los secretos que solo se comparan

**R15.** El resumidor DEBE devolver el resumen de un secreto como el SHA-256 de su texto en UTF-8,
en hexadecimal en minúsculas de 64 caracteres. El resumen DEBE ser determinista: el mismo secreto
da siempre el mismo resumen. Para `abc` DEBE ser
`ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`. [A, D4]

**R16.** CUANDO se compara un secreto con un resumen guardado, el resumidor DEBE devolver
verdadero si y solo si el resumen del secreto es ese resumen guardado. Un secreto distinto DEBE
dar falso. SI el resumen guardado no son 64 caracteres hexadecimales, ENTONCES DEBE devolver falso
sin lanzar. [A, D4]

**R17.** La comparación de R16 DEBE hacerse con la comparación en tiempo constante de
`node:crypto` (`timingSafeEqual`) sobre dos secuencias de 32 bytes, y nunca con una igualdad de
cadenas. Se demuestra observando que cada comparación con un resumen bien formado pasa por
`timingSafeEqual`. [A, D4]

### Arquitectura y cableado

**R18.** Solo los archivos de `lib/modules/integraciones/adapters/driven/` DEBEN importar
`node:crypto` (o `crypto`) dentro del módulo. Ningún archivo de `domain/` ni de `ports/` DEBE
hacerlo. `guard-arquitectura-modulos` DEBE seguir en verde y DEBE dar un hallazgo con un archivo
sintético `lib/modules/integraciones/domain/x.ts` que importa `node:crypto`. [D5]

**R19.** `lib/composition/index.ts` DEBE exportar un objeto `integraciones` con exactamente dos
miembros:

- `secretCipher`, tipado con el puerto `SecretCipher`, que es el cifrador;
- `secretDigest`, tipado con el puerto `SecretDigest`, que es el resumidor.

`lib/composition/index.ts` DEBE ser el único archivo de producción fuera del módulo que importa
algo del módulo. [A]

**R20.** El contrato del módulo (`lib/modules/integraciones/index.ts`) DEBE reexportar desde
`./domain` exactamente estos símbolos:

- las clases de error del módulo: la base `IntegracionesError`, `SecretUnreadableError` y
  `ValidationError`;
- el tipo `SecretContext`.

NO DEBE reexportar nada de `ports/` ni de `adapters/`. [A, D5]

**R21.** El catálogo único de errores DEBE ganar exactamente un código, `integration_secret_unreadable`,
con su clave y el texto «No se pudo leer una credencial guardada de la integración. Vuelve a
escribirla.». Ese texto NO DEBE repetir el de otra clave. `guard-catalogo-de-errores` DEBE seguir en
verde, con el archivo de errores del módulo dentro de su barrido. [D1, D3, D7]

### Alcance y verificación

**R22.** Esta feature NO DEBE tocar ninguna de estas cosas:

- `db/` (ni modelo, ni migración, ni seed);
- `package.json`, `pnpm-lock.yaml` ni `docs/dependencias.md`;
- `app/`, `components/`, `hooks/` ni `middleware.ts`.

`.env.example` DEBE declarar las dos variables **vacías**, cada una con un comentario. [A, D1, D2]

**R23.** El sistema DEBE probar R1–R22 con tests unitarios y guardias, sin base de datos y sin
red. `./init.sh` y el check `gate-completo` DEBEN quedar en verde, incluida
`guard-arquitectura-modulos`. [A]

### Cobertura de la tabla de decisiones

| Decisión | Requisitos |
|---|---|
| D1 AES-256-GCM con `node:crypto` | R1, R2, R3, R4, R14, R21, R22 |
| D2 La clave vive en env, con versión | R3, R8, R9, R10, R11, R12, R22 |
| D3 El contexto de la fila va como AAD | R5, R6, R21 |
| D4 El verify token se guarda como hash | R15, R16, R17 |
| D5 `node:crypto` solo en el adapter | R18, R20 |
| D6 Texto o contexto vacío se rechaza | R13 |
| D7 Código `integration_secret_unreadable` | R4, R5, R7, R8, R21 |
| D8 Errores de configuración como `Error` llano | R11, R12 |
| Alcance [A] | R1–R3, R7, R10–R17, R19, R20, R22, R23 |

## Preguntas abiertas

1. **Enmienda a QC-221 (aviso, no bloquea).** `tests/unit/integraciones/module-shape.test.ts` fija
   que el módulo está vacío y que `lib/composition` no lo nombra (R11 y R12 de QC-221). Esta ficha
   los relaja (R19, R20) y actualiza esos casos (`design.md > 8`). Es la consecuencia prevista del
   armazón, no un cambio de criterio.

## Decisiones cerradas (no reabrir)

| # | Decisión | Por qué |
|---|---|---|
| D1 | AES-256-GCM con `node:crypto` | Cifra y autentica a la vez. Ya viene en Node, así que no hace falta pedir una dependencia nueva. |
| D2 | La clave vive en env, con versión | Rotar sin bajar el servicio. La clave nunca está en la misma DB que los datos. |
| D3 | El contexto de la fila va como dato autenticado (AAD) | Impide mover un ciphertext a otra empresa, fila o campo. |
| D4 | El verify token se guarda como hash, no cifrado | Solo se compara; no hace falta recuperarlo. |
| D5 | `node:crypto` solo en el adapter | Lo exige la regla del repo: `domain/` y `ports/` no importan crypto. |
| D6 | Cifrar un texto vacío, o cifrar o descifrar con un contexto con algún campo vacío, se rechaza con `ValidationError` (`invalid_input`) (decisión del humano, 2026-10-09) | Un secreto vacío nunca es una credencial válida (en QC-237 «campo vacío» significa «conservar el actual» y se decide antes de llamar al cifrador), y un contexto con un hueco ligaría el secreto a menos de lo que dice D3. |
| D7 | Código nuevo del catálogo `integration_secret_unreadable`, con el texto «No se pudo leer una credencial guardada de la integración. Vuelve a escribirla.» (decisión del humano, 2026-10-09) | El descifrado fallido es un error de dominio, y todo error de dominio del repo lleva un código del catálogo único. |
| D8 | Los errores de configuración de las variables son un `Error` llano cuyo mensaje nombra la variable, como en `processing-config-env.ts` (decisión del humano, 2026-10-09) | Es una mala configuración del despliegue, no una condición del negocio. El traductor único lo muestra como `unexpected` y el detalle queda en el log del servidor. |
