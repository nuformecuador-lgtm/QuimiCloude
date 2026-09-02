# QC-8 — sesion-actual-y-logout · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-7`, `QC-15`
> **Rama** `feature/QC-8-sesion-actual-y-logout`
>
> **Alcance.** Leer en cada petición la cookie de sesión que QC-7 dejó escrita, verificar su
> firma y su caducidad, y resolver quién es el usuario y cuál es su rol — o que no hay sesión.
> Y cerrar sesión: retirar la cookie desde el servidor y devolver al login.
>
> **Lo que NO entra.** La protección de rutas y el `middleware.ts` que corta antes de renderizar
> son **QC-9**. La invalidación real de un código de sesión ya copiado, y el «cerrar sesión en
> todos mis dispositivos», son **QC-23 — Registro de sesiones y cierre en todos los
> dispositivos** (creada el 2026-09-02, bloqueada por esta ficha). No hay trabajo de UI: el botón
> de cerrar sesión ya existe desde QC-11 (`components/private/nav-user.tsx`) y su Server Action
> tiene la firma congelada.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notacion EARS (`docs/specs.md`). El mapa `decision cerrada -> R<n>` esta en
> `design.md > 0`; el mapa `R<n> -> test` lo escribe el implementer en
> `progress/impl_QC-8-sesion-actual-y-logout.md` (`CHECKPOINTS.md > Trazabilidad`).

### Leer y verificar la cookie

**R1.** El sistema DEBE exponer una unica operacion de lectura de sesion que devuelva **o bien**
el usuario de la sesion en curso con su rol, **o bien** la ausencia de sesion, distinguibles por
el valor devuelto y sin lanzar excepcion en el caso de "no hay sesion".

**R2.** CUANDO llega una peticion que no trae la cookie `qc_session`, el sistema DEBE resolver
"sin sesion" sin consultar la base de datos.

**R3.** SI el valor de la cookie no empieza por el prefijo de version `v1.`, ENTONCES el sistema
DEBE resolver "sin sesion" sin intentar interpretar el resto del valor y sin consultar la base
de datos.

**R4.** SI la firma que trae la cookie no coincide con la firma recomputada sobre su parte
firmada, ENTONCES el sistema DEBE resolver "sin sesion" y no consultar la base de datos.

**R5.** El sistema DEBE recomputar esa firma con **la misma funcion que la emite**
(`signSessionValue()`, exportada por el adaptador que escribe la cookie) y compararla en
**tiempo constante**; NO DEBE existir una segunda implementacion del algoritmo de firma en el
repositorio.

**R6.** SI la parte firmada no decodifica a un objeto con `sub` (identificador de usuario con
formato valido), `iat` y `exp` enteros, ENTONCES el sistema DEBE resolver "sin sesion" sin
consultar la base de datos y sin propagar el error de decodificacion.

**R7.** SI el instante actual es igual o posterior al `exp` **firmado**, ENTONCES el sistema DEBE
resolver "sin sesion", aunque el navegador siga enviando la cookie; la caducidad DEBE evaluarse
sobre `exp` y NUNCA sobre el `Max-Age` de la cookie.

**R8.** MIENTRAS una sesion valida este en curso, el sistema NO DEBE reemitir, prolongar ni
renovar la cookie al leerla: la validez sigue siendo de 8 h absolutas desde su emision.

**R9.** SI `SESSION_SECRET` falta o es mas corto que el minimo exigido al emitirla, ENTONCES la
lectura de sesion DEBE fallar de forma ruidosa (excepcion con mensaje que no incluya el valor
del secreto) y NUNCA resolver una sesion como valida; el cierre de sesion DEBE seguir
funcionando en esa situacion, porque retirar la cookie no necesita el secreto.

### Resolver quien es el usuario

**R10.** CUANDO la cookie es valida, el sistema DEBE resolver el usuario **consultando la base de
datos por el `sub`** en cada peticion, y no a partir de datos transportados en la cookie.

**R11.** SI el usuario identificado por `sub` no existe o tiene `deleted_at` con valor, ENTONCES
el sistema DEBE resolver "sin sesion", aunque la firma y la caducidad sean correctas.

**R12.** CUANDO se resuelve el usuario, `roleName` DEBE ser el nombre del rol que ese usuario
tiene en la base **en el momento de la peticion**, nunca el que tuviera al iniciar sesion.

**R13.** CUANDO se resuelve el usuario, `displayName` DEBE ser **el primer nombre de
`first_names` seguido del primer apellido de `last_names`** (de «Ana Maria» y «Perez Gomez» sale
«Ana Perez», y sus iniciales son «AP»); SI ese nombre resultara vacio, ENTONCES `displayName`
DEBE ser el `username`.

**R14.** El sistema NO DEBE devolver para la sesion ningun dato fuera de `id`, `username`,
`displayName` y `roleName`, ni modificar el tipo `SessionUser`.

**R15.** El sistema NO DEBE necesitar ninguna migracion ni columna nueva: `displayName`,
`roleName` y la condicion de usuario activo se leen de `first_names`, `last_names`, `roles.name`
y `deleted_at`, que ya existen.

### Zona privada y cierre de sesion

**R16.** MIENTRAS no haya sesion valida, CUANDO se renderice cualquier pantalla de la zona
privada, el sistema DEBE redirigir al login sin renderizar contenido privado.

**R17.** CUANDO hay sesion valida, la zona privada DEBE obtener el usuario **una sola vez por
render** y repartirlo por props; ningun componente de `components/private/` DEBE resolver la
sesion por su cuenta.

**R18.** CUANDO se ejecuta el cierre de sesion, el sistema DEBE retirar la cookie **desde el
servidor**, con el mismo nombre y `path` con los que se emitio, y a continuacion redirigir al
login.

**R19.** El sistema DEBE conservar la firma congelada de `logoutAction()`: sin parametros y sin
valor de retorno.

**R20.** CUANDO se ha cerrado sesion, una peticion posterior desde ese navegador DEBE resolverse
como "sin sesion", y volver atras en el historial NO DEBE mostrar contenido privado.

**R21.** El cierre de sesion NO DEBE invalidar un valor de cookie ya emitido: una copia de ese
valor presentada despues del cierre DEBE seguir resolviendose como sesion valida hasta su `exp`.
(Riesgo asumido en la tabla de decisiones; la invalidacion real es QC-23.)

### Capas y verificacion

**R22.** El sistema DEBE mantener la lectura y el borrado de la cookie en un **adaptador driven**
detras del puerto de sesion, cableado **unicamente** en `lib/composition/index.ts`; ningun
archivo de `app/`, `components/` ni `hooks/` DEBE importar ese adaptador, y ningun codigo de
cliente DEBE leer ni borrar la cookie de sesion.

**R23.** El sistema DEBE mantener en `domain/` las decisiones de que hace valida a una sesion
—version aceptada del formato, caducidad, exigencia de usuario activo y composicion del nombre
mostrable—, de forma ejercitable sin cookie, sin Next y sin base de datos.

**R24.** CUANDO se ejecute la suite E2E, DEBE existir al menos un recorrido en navegador real que
entre con credenciales correctas, vea en la barra lateral el nombre real del usuario, cierre
sesion, termine en el login y compruebe que volver atras no muestra la zona privada; ese
recorrido DEBE borrar al terminar todas las filas que haya creado.

## Preguntas abiertas

1. **Resolver el usuario dos veces en la misma petición.** El layout privado lo resuelve, y el
   `middleware.ts` de QC-9 va a necesitarlo también. Si acaban siendo dos consultas por página,
   ¿se memoiza por petición? Se deja a `spec_author` y a QC-9; no condiciona el alcance.

   > **Resuelta en QC-8 (spec_author, 2026-09-02): no se memoiza, porque hoy no hay dos
   > consultas.** En QC-8 el único consumidor es el layout privado: una lectura de cookie y una
   > consulta por petición. Y el `middleware.ts` de QC-9 **no puede** hacer la segunda: corre en
   > el runtime Edge, donde no hay cliente Prisma, así que lo más que podrá hacer es verificar la
   > cookie firmada (sin base) y dejar la resolución del usuario al layout. Si QC-9 acaba
   > necesitando el `SessionUser` completo en un segundo punto **del mismo render**, la salida es
   > de una línea en `lib/composition/index.ts` —envolver `getSessionUser` en `cache()` de React—
   > y no cambia ningún puerto. Se deja escrito para QC-9 y no se adelanta aquí: memoizar un solo
   > llamador es código que nadie ejercita (`design.md > 6.4`).
2. **`roleName` nunca será `null` en QC-8.** El rol es obligatorio en la base (`users.role_id`
   `NOT NULL` con `ON DELETE RESTRICT`), así que esa rama del tipo `SessionUser` —que QC-11
   congeló como anulable— no se ejercita. No se cambia el tipo; queda anotado para que nadie
   escriba un test que no puede fallar.

   > **Confirmada en QC-8 (spec_author, 2026-09-02).** El adaptador de lectura devuelve el rol
   > como `string` (la relación `User.role` es obligatoria en Prisma), y el paso a
   > `roleName: string | null` del tipo congelado es un **ensanchamiento**, no una rama. No se
   > escribe ningún test de «rol nulo» en QC-8: sería verde por construcción. La rama `null` de
   > `nav-user.tsx` ya tiene su test en QC-11 y ahí se queda.

3. **La zona privada todavía no tiene ninguna URL, y el E2E de la decisión del 2026-09-02 la
   necesita.** *(Abierta por `spec_author` el 2026-09-02; no reabre ninguna decisión cerrada.)*
   `app/(private)/` tiene `layout.tsx` pero **ningún `page.tsx`**: Next no renderiza un layout sin
   una página debajo, así que hoy no existe ninguna dirección en la que se pueda «ver el nombre
   real en la barra» ni comprobar la redirección de R16 en navegador. La pantalla es **QC-12 —
   dashboard-en-blanco** (`pending`, `low`, zona `frontend`, con sus dos dependencias ya `done`).
   Dos salidas, y la elige el humano:
   - **(a) Recomendada:** hacer QC-12 antes o en paralelo (es zona `frontend`, así que no compite
     con las dos plazas de `backend` de QC-8). QC-8 no toca `app/(private)/` salvo el `redirect`
     del layout, y el E2E de R24 espera a que QC-12 aterrice.
   - **(b) Alternativa:** QC-8 crea un `app/(private)/dashboard/page.tsx` mínimo de andamiaje que
     QC-12 sustituye. Es más rápido, pero mete trabajo de UI en una ficha cuyo Alcance dice que
     no lo hay, y deja dos features tocando el mismo archivo.

   Mientras no se responda, `tasks.md > T12` **para y pregunta** en vez de improvisar. El resto de
   la feature (R1–R23) no depende de esto y se puede implementar y verificar entero.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-02 | ¿Cerrar sesión invalida un código de sesión ya copiado? | **No.** El servidor retira la cookie de ese navegador y nada más; una copia robada sigue valiendo hasta su caducidad (8 h). Riesgo asumido: exige un robo previo, es reversible y hay salida de emergencia real (ver la decisión siguiente). La invalidación de verdad es **QC-23**, bloqueada por esta ficha. |
| 2026-09-02 | ¿Sigue dentro un empleado dado de baja, o uno al que le cambiaron el rol? | **No.** El usuario se resuelve contra la base en cada petición; si no está activo (`deleted_at`) se trata como **sin sesión** y vuelve al login en su siguiente clic. El rol que se aplica es **siempre el actual**, nunca el que tenía al entrar. No cuesta nada: la consulta ya hace falta para el nombre y el rol. |
| 2026-09-02 | ¿Qué nombre se muestra en la barra lateral? | **Primer nombre + primer apellido** — `first_names` «Ana María» y `last_names` «Pérez Gómez» dan **«Ana Pérez»**, iniciales **«AP»**. Cabe sin recortarse y es el trato del día a día. |
| 2026-09-02 | ¿Qué hace la zona privada si no hay sesión válida? | **Redirige al login ya en QC-8.** Evita la ventana entre QC-8 y QC-9 en la que entrar sin sesión rompería la página. QC-9 añade después el corte en `middleware.ts`, que es anterior y más barato, sin deshacer esto. |
| 2026-09-02 | ¿Lleva prueba en navegador real? | **Sí, en QC-8.** Entrar, comprobar el nombre real en la barra, cerrar sesión, comprobar el retorno al login y que no se vuelve atrás. Playwright ya está montado desde QC-7. |
| 2026-09-01 | Formato del valor de la cookie | **Heredado de QC-7 `design.md > 5.1`, congelado:** `v1.<payload-base64url>.<hmac-base64url>`, con `sub` / `iat` / `exp`. La verificación reutiliza `signSessionValue()`, que QC-7 exporta a propósito, y compara en tiempo constante (`timingSafeEqual`). QC-8 no reimplementa la firma. |
| 2026-09-01 | Caducidad | **Heredada de QC-7 (D10):** 8 h absolutas desde la emisión, sin renovación deslizante y sin «recordarme». Se comprueba sobre el `exp` **firmado**, no sobre el `Max-Age`, que lo controla el navegador. |
| 2026-09-01 | Atributos y manejo de la cookie | **Heredados de QC-7 `design.md > 5.2` (D3):** `qc_session`, `httpOnly`, `sameSite: lax`, `secure` en producción, `path: /`. La pone y la quita **solo el servidor**; el JavaScript del navegador no puede leerla ni borrarla. |
| 2026-08-06 | Tipo `SessionUser` | **Congelado por QC-11:** `id`, `username`, `displayName`, `roleName`. `displayName` y `roleName` llegan ya resueltos como texto mostrable; la UI no compone nombres ni traduce roles. |
| 2026-08-06 | Firma de `logoutAction()` | **Congelada por QC-11:** sin parámetros y sin valor de retorno. QC-8 le añade el `redirect` al login sin tocar la firma. |
| 2026-09-01 | Capas | **Heredado de QC-15:** la lectura de la cookie es un **adaptador driven** detrás del puerto `SessionProvider`; el cableado vive solo en `lib/composition/index.ts`. El dominio decide qué es una sesión válida; el adaptador sabe cómo viaja. |
| 2026-08-06 | Idioma de los identificadores y borrado lógico | **Heredados de QC-4:** identificadores de base en inglés; «usuario dado de baja» es `deleted_at`, no una fila borrada. |
