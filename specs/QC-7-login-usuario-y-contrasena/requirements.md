# QC-7 — login-usuario-y-contrasena · requirements

> Notacion EARS (`docs/specs.md`). Cada `R<n>` tiene su test en `tasks.md > Trazabilidad`.

## Alcance

Hacer real la verificacion de credenciales del modulo `identity` (hoy `verifyCredentials`
es un stub que devuelve siempre `{ ok: false }`) y **emitir** la cookie de sesion cuando la
autenticacion es correcta.

**Dentro de QC-7:** buscar al usuario por nombre de usuario, verificar la contrasena contra
el hash guardado, responder de forma uniforme ante cualquier fallo (contenido **y** tiempo),
**contar los fallos y bloquear temporalmente la cuenta con escalada**, construir el valor de
sesion y **escribir** la cookie.

> **Ampliacion de alcance del 2026-09-01.** El humano respondio la pregunta abierta 2 con una
> politica concreta de bloqueo de cuenta, y eso arrastra **persistencia y migracion** a una
> feature que no tenia ninguna. La complejidad de la ficha pasa de `medium` a **`high`**:
> ya no es "verificar y emitir cookie", es "verificar, contar, bloquear con escalada, migrar
> y emitir cookie". Ver `design.md > 11` para la valoracion de si esto deberia ser ficha
> propia del board (recomendacion: **no**, y el porque).

**Fuera de QC-7 — no se toca:**

- **QC-8 (sesion actual y logout):** *leer* la cookie en cada peticion, resolver el
  `SessionUser` a partir de ella y *invalidarla* al cerrar sesion. `session-stub.ts`
  (`getSessionUser` / `endSession`) se queda **exactamente como esta**.
- **QC-9 (proteccion de rutas):** `middleware.ts`, redirecciones de rutas privadas y del
  login para quien ya tiene sesion.
- **QC-10 (pantalla de login):** la UI. El contrato `LoginFormState` y la firma de
  `loginAction` estan **congelados**; esta feature es backend.
- **QC-6 (seed):** esta feature **no** crea usuarios ni depende del seed (ver R21).
- **Desbloqueo manual por un administrador:** no existe pantalla de administracion en el repo
  ni en el backlog. El bloqueo se levanta **solo por caducidad** (R26). No se crea aqui
  ninguna herramienta de desbloqueo.
- **Limite por IP:** descartado por el humano el 2026-09-01 (ver D11).

## Decisiones cerradas (no reabrir)

Vienen de la description del board y de `docs/architecture.md`. No se re-preguntan.

| # | Decision | Origen | Requisito que la cubre |
| --- | --- | --- | --- |
| D1 | Se entra con **nombre de usuario + contrasena** (no correo) | description QC-7 | R1 |
| D2 | El error **no revela** cual de los dos campos fallo | description QC-7 | R2, R3 |
| D3 | La sesion viaja en una **cookie `httpOnly`** | description QC-7 | R9 |
| D4 | La cookie **caduca** | description QC-7 | R11 |
| D5 | La logica de negocio vive en `domain/`; lo que necesita entra por **puertos** | `docs/architecture.md`, `CHECKPOINTS.md` | R17 |
| D6 | El cableado puerto -> adaptador vive **solo** en `lib/composition/index.ts` | `docs/architecture.md` | R17 |
| D7 | El contrato `index.ts` sigue importable desde cliente sin arrastrar servidor | `docs/architecture.md` | R18 |
| D8 | Prisma es el unico camino de datos; la autorizacion no se delega a RLS | `docs/architecture.md` | R1, R5 |
| D9 | La UI no cambia: `LoginFormState` y la firma de `loginAction` congelados | QC-10, `login-form-state.ts` | R16 |
| D10 | Sesion de **8 horas**, caducidad absoluta, **sin "recordarme"** ni renovacion deslizante | humano, 2026-09-01 | R11 |
| D11 | **5 fallos** bloquean la cuenta, con bloqueo **temporal creciente** (1, 5, 15, 60 min) y auto-desbloqueo. **Nunca permanente** (no hay pantalla de administracion). **Sin limite por IP** | humano, 2026-09-01 | R22, R23, R26 |
| D12 | Riesgo aceptado: bloquear **por cuenta** permite dejar fuera a un usuario conocido con 5 fallos. Se asume por ser ERP de un tenant, usuarios conocidos y sin registro publico | humano, 2026-09-01 | R25 (mitigacion parcial), `design.md > 6.5` |
| D13 | **`@playwright/test` aprobado** (cuatro checks en `design.md > 6.4`). Entra con su fila en `docs/dependencias.md` | humano, 2026-09-01 | tasks T11 |

## Requisitos (EARS)

### Verificacion de credenciales

- **R1.** CUANDO se solicita autenticar unas credenciales, el sistema DEBE aceptarlas si y
  solo si existe un usuario **no borrado** (`deleted_at IS NULL`) cuyo nombre de usuario
  coincide con el recibido y cuya contrasena corresponde al hash almacenado en
  `users.password_hash`.
- **R2.** SI el nombre de usuario recibido no corresponde a ningun usuario no borrado,
  ENTONCES el sistema DEBE rechazar la autenticacion devolviendo el resultado generico de
  credenciales no aceptadas, sin indicar que el usuario no existe.
- **R3.** SI la contrasena no corresponde al hash del usuario encontrado, ENTONCES el
  sistema DEBE rechazar la autenticacion con **el mismo resultado y el mismo mensaje** que
  R2, de forma indistinguible para quien lo consume.
- **R4.** El sistema DEBE comparar el nombre de usuario **sin distinguir
  mayusculas/minusculas** y sin espacios al inicio o al final, y la contrasena de forma
  **exacta** (sensible a mayusculas, sin recortar espacios).
- **R5.** MIENTRAS un usuario este marcado como borrado (`deleted_at` no nulo), el sistema
  DEBE rechazar sus credenciales aunque el nombre de usuario y la contrasena sean correctos,
  con el mismo resultado generico de R2.
- **R6.** CUANDO el nombre de usuario recibido no corresponde a ningun usuario no borrado,
  el sistema DEBE ejecutar igualmente **una** verificacion de contrasena contra un hash
  señuelo, de modo que el numero de verificaciones de hash realizadas sea el mismo que
  cuando el usuario si existe.
- **R7.** El hash señuelo de R6 DEBE producirse con el **mismo coste** que los hashes de
  produccion, de forma que su verificacion no sea sistematicamente mas rapida ni mas lenta
  que la de un hash real.
- **R8.** SI la entrada no cumple el esquema de credenciales ya congelado
  (`loginInputSchema`), ENTONCES el sistema DEBE rechazarla como entrada invalida **sin**
  consultar la base de datos, sin verificar ningun hash y sin emitir cookie.

### Cookie de sesion

- **R9.** CUANDO la autenticacion es correcta, el sistema DEBE emitir una cookie de sesion
  marcada `httpOnly`, de modo que no sea legible desde JavaScript del navegador.
- **R10.** La cookie de sesion DEBE emitirse con `SameSite=Lax`, `Path=/` y con el atributo
  `Secure` activo cuando el entorno de ejecucion es produccion.
- **R11.** La cookie de sesion DEBE caducar: se emite con un `Max-Age` igual a la duracion
  de sesion configurada, y su valor DEBE contener el instante de expiracion calculado por el
  dominio.
- **R12.** El valor de la cookie DEBE ir firmado con HMAC-SHA-256 usando un secreto que se
  resuelve por variable de entorno, y DEBE contener unicamente identificador de usuario,
  instante de emision e instante de expiracion: nunca la contrasena, el hash, el nombre de
  usuario ni ningun otro dato personal.
- **R13.** SI el secreto de sesion no esta configurado o no alcanza la longitud minima
  exigida, ENTONCES el sistema DEBE fallar la operacion sin emitir cookie y sin dar por
  autenticado al usuario.
- **R14.** SI la autenticacion no es correcta por cualquier motivo (R2, R3, R5, R8),
  ENTONCES el sistema NO DEBE emitir ninguna cookie de sesion.
- **R15.** El sistema NO DEBE escribir en ningun registro de salida (log, consola, mensaje
  de error) la contrasena recibida, el hash almacenado ni el valor de la cookie de sesion.

### Contrato, arquitectura y frontera

- **R16.** El sistema DEBE conservar sin cambios la firma de `loginAction` y la forma de
  `LoginFormState`: un fallo sigue devolviendo `status: 'error'` con
  `GENERIC_CREDENTIALS_ERROR`, y un exito sigue terminando en redireccion, no en un estado
  nuevo.
- **R17.** El sistema DEBE implementar la decision de autenticar en el **dominio** del modulo
  `identity`, obteniendo por **puertos** la lectura del usuario, el hashing y la emision de
  la sesion; ningun archivo fuera de `lib/composition/index.ts` DEBE elegir la
  implementacion concreta de esos puertos.
- **R18.** El contrato publico `lib/modules/identity/index.ts` DEBE seguir sin arrastrar
  `next/*`, `@prisma/client` ni `'use server'` en su cierre transitivo de imports.
- **R19.** CUANDO la autenticacion es correcta, el sistema DEBE llevar al usuario a la ruta
  de dashboard ya definida (`DASHBOARD_ROUTE`).
- **R20.** El sistema DEBE dejar sin cambios el comportamiento de **lectura** y **cierre** de
  sesion: `getSessionUser` y `endSession` siguen siendo el stub de QC-8, y `logoutAction`
  no adquiere aqui ninguna responsabilidad nueva sobre la cookie.
- **R21.** El sistema DEBE poder demostrarse en su camino feliz **sin depender del seed**
  (QC-6): los datos necesarios para un login correcto los crea y limpia la propia
  verificacion automatizada.

### Bloqueo temporal de cuenta (alcance añadido el 2026-09-01)

- **R22.** CUANDO un usuario no borrado acumula **5** verificaciones de contrasena fallidas
  consecutivas, el sistema DEBE bloquear su cuenta temporalmente y reiniciar el contador de
  fallos a cero.
- **R23.** CUANDO se bloquea una cuenta, el sistema DEBE aplicar la duracion que corresponde
  al **nivel de escalada** alcanzado —**1, 5, 15 y 60 minutos** para los niveles 1 a 4— y
  DEBE mantener 60 minutos como tope para todo bloqueo posterior. El bloqueo NUNCA DEBE ser
  permanente.
- **R24.** MIENTRAS una cuenta este bloqueada, el sistema DEBE rechazar todo intento de
  autenticacion **incluso si la contrasena es correcta**, sin emitir cookie de sesion y sin
  dar por autenticado al usuario.
- **R25.** MIENTRAS una cuenta este bloqueada, el sistema NO DEBE incrementar su contador de
  fallos, NO DEBE subir su nivel de escalada y NO DEBE alargar el fin del bloqueo vigente.
- **R26.** CUANDO el instante de fin de bloqueo ya ha pasado, el sistema DEBE volver a
  aceptar credenciales correctas sin ninguna intervencion manual.
- **R27.** CUANDO una autenticacion es correcta, el sistema DEBE dejar el contador de fallos
  en cero, el nivel de escalada en cero y la cuenta sin bloqueo.
- **R28.** SI un intento se rechaza porque la cuenta esta bloqueada, ENTONCES el sistema DEBE
  responder con **el mismo resultado y el mismo mensaje generico** que R2 y R3, sin indicar
  que la cuenta esta bloqueada ni cuanto falta para desbloquearse.
- **R29.** CUANDO un intento se rechaza porque la cuenta esta bloqueada, el sistema DEBE
  ejecutar igualmente **una** verificacion de contrasena, de forma que el numero de
  verificaciones de hash sea el mismo que en los caminos de R1, R2 y R3.
- **R30.** El sistema DEBE persistir el contador de fallos, el nivel de escalada y el
  instante de fin de bloqueo de cada usuario, mediante una migracion versionada que incluya
  su `down.sql` y que revierta exactamente lo que aplica.
- **R31.** SI el nombre de usuario recibido no corresponde a ningun usuario no borrado,
  ENTONCES el sistema NO DEBE crear ni actualizar ningun registro de intentos, de modo que la
  existencia de un usuario no pueda deducirse por sus efectos en la base.

## Preguntas abiertas

Sin respuesta en `docs/`, `specs/` ni el codigo. **No se rellenan con supuestos**
(regla 6 de `CLAUDE.md`). Ninguna bloquea la implementacion de los R1-R31; todas cambian
alcance si la respuesta es distinta a lo escrito en `design.md`.

1. **Registro de auditoria de accesos.** `docs/architecture.md > Dominio` dice que en un ERP
   toda operacion es auditable. ¿Un login (exitoso o fallido) debe dejar rastro en una tabla,
   con quien/cuando/desde donde? Aqui **no se crea ninguna tabla**: los contadores de bloqueo
   son columnas de `users` y se sobrescriben, no son historico. Si la respuesta es si, es una
   feature aparte.
2. **`next/headers` en un adaptador driven.** La tabla de dependencias de
   `docs/architecture.md > La regla de dependencias` no menciona `next/*` en la fila
   `adapters/driven/**` (ni para permitirlo ni para prohibirlo), y la guardia lo deja pasar.
   `design.md > 4.2` decide ponerlo ahi con su porque. ¿Se confirma y se anota la fila en
   `docs/architecture.md`, o el humano prefiere otra ubicacion?
3. **Rotacion del secreto de sesion.** Con un unico `SESSION_SECRET`, cambiarlo invalida
   todas las sesiones vivas de golpe. ¿Se acepta, o hace falta soportar dos secretos
   (actual + anterior) desde ya? Aqui se acepta el corte; cambiarlo despues es tocar solo el
   adaptador.

### Cerradas por el humano el 2026-09-01 (para que nadie las busque abiertas)

- **Duracion de la sesion** -> 8 h, sin "recordarme" (D10, R11).
- **Limite de intentos** -> 5 fallos, bloqueo temporal creciente por cuenta, sin limite por IP
  (D11, D12, R22-R31).
- **E2E / Playwright** -> aprobado, `@playwright/test` v1.62.1 (D13, `design.md > 6.4`).
