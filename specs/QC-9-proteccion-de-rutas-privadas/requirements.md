# QC-9 — proteccion-de-rutas-privadas · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-8`, `QC-15` ·
> **Rama:** `feature/QC-9-proteccion-de-rutas-privadas`
>
> **Alcance.** El portero. Un `middleware.ts` que protege **por convención** todo lo que cuelga
> de `app/(private)/`, valida la sesión **de verdad** —firma y caducidad, no solo que la cookie
> exista— y redirige en los dos sentidos. Incluye **migrar el firmado de sesión de QC-8 de
> `node:crypto` a WebCrypto** para que exista **una sola** implementación del HMAC, válida en Node
> y en el borde, y **sin cambiar el formato del token**. Y, antes de escribir `middleware.ts`,
> ampliar las dos guardias a los `.ts` de primer nivel del repo.
>
> **Lo que NO entra.** La costura de UI —que el formulario de login autentique de verdad, que el
> layout privado muestre el usuario real y que su cerrar sesión funcione—: va a **QC-13**. Las
> reglas concretas de rol por ruta: las trae la ficha de cada módulo (la primera será la pantalla
> de productos, solo Administrador). Tampoco entra la revocación de sesiones, que es **QC-23**.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notacion EARS (`docs/specs.md`). El mapa `decision cerrada -> R<n>` esta en `design.md > 0`; el
> mapa `R<n> -> test` esta en `tasks.md > Trazabilidad` y lo confirma el implementer en
> `progress/impl_QC-9-proteccion-de-rutas-privadas.md` (`CHECKPOINTS.md > Trazabilidad`).
>
> «Sesion valida» significa, en todo este documento: cookie presente, **version del formato
> reconocida, firma verificada y `exp` firmado aun en el futuro**. Nunca «la cookie existe».

### El portero: rutas privadas

**R1.** El sistema DEBE proteger **por convencion** toda ruta que cuelgue de `app/(private)/`, sin
que ninguna pantalla tenga que registrarse a mano en el middleware; SI existe bajo `app/(private)/`
una ruta con `page.tsx` cuyo prefijo de URL no este cubierto por el conjunto declarado de rutas
privadas, ENTONCES la verificacion DEBE fallar señalando esa ruta.

**R2.** CUANDO llega una peticion a una ruta privada sin sesion valida, el sistema DEBE responder
una redireccion al login **antes de renderizar**, sin ejecutar el Server Component de la pantalla y
sin que la respuesta contenga contenido privado.

**R3.** CUANDO llega una peticion a una ruta privada **con** cookie de sesion, el sistema DEBE
tratarla como «sin sesion» SI la version del formato no es la reconocida, SI la firma no coincide
con la recomputada sobre su parte firmada, SI el contenido firmado no decodifica a un
`sub`/`iat`/`exp` validos, o SI el instante actual es igual o posterior al `exp` **firmado**; la
mera presencia de la cookie NUNCA DEBE bastar para dejar pasar.

**R4.** El middleware NO DEBE consultar la base de datos ni resolver el `SessionUser`: decide solo
con lo que viaja firmado en la cookie. La resolucion del usuario (rol y nombre actuales) sigue
siendo del layout privado (QC-8 R10).

**R5.** MIENTRAS una peticion atraviesa el middleware, el sistema NO DEBE emitir, reemitir,
prolongar ni borrar la cookie de sesion: la validez sigue siendo de 8 h absolutas desde su emision
(QC-8 R8).

**R6.** El sistema DEBE conservar la comprobacion de sesion del layout privado (QC-8 R16) como
ultima linea de defensa: el corte del middleware NO DEBE sustituirla ni relajarla, y esta ficha NO
DEBE cambiar el comportamiento visible del layout privado, de la barra lateral ni del cierre de
sesion (eso es QC-13).

### Vuelta a la ruta pedida, y el redirector abierto

**R7.** CUANDO el sistema redirige al login por falta de sesion valida, la redireccion DEBE llevar
la **ruta pedida** (camino y cadena de consulta) como destino de vuelta.

**R8.** CUANDO se entra con credenciales correctas y hay un destino de vuelta valido, el sistema
DEBE aterrizar al usuario en **esa** pantalla, y no en el dashboard; SI no hay destino de vuelta,
ENTONCES DEBE aterrizar en el dashboard. Esto NO DEBE cambiar la firma congelada de `loginAction`
(`prevState`, `formData`) ni la forma de `LoginFormState`.

**R9.** SI el destino de vuelta no es una **ruta interna** —no empieza por una unica `/`, empieza
por `//` o `/\`, trae esquema o autoridad (`http:`, `https:`, `javascript:`, `data:`, `//host`), o
no decodifica a una ruta— ENTONCES el sistema DEBE descartarlo y usar el dashboard; el sistema
NUNCA DEBE emitir una redireccion hacia un destino fuera de este sitio.

**R10.** CUANDO se pide el login con sesion valida, el sistema DEBE redirigir al dashboard, o al
destino de vuelta SI lo hay y es valido segun R9.

**R11.** MIENTRAS no haya sesion valida, las rutas publicas —el login incluido— DEBEN servirse sin
redireccion alguna.

### Reglas de ruta por rol (el gancho)

**R12.** El sistema DEBE ofrecer un conjunto declarado de reglas ruta→rol que la decision de acceso
consulta en cada peticion; ese conjunto DEBE estar **vacio** en esta ficha, y MIENTRAS este vacio
toda sesion valida DEBE pasar a cualquier ruta privada.

**R13.** SI hay sesion valida y una regla ruta→rol exige un rol que el usuario no tiene, ENTONCES el
sistema DEBE redirigir al **dashboard**, nunca al login; y SI la ruta no autorizada fuera el propio
dashboard, ENTONCES DEBE resolverse sin bucle de redirecciones.

### Una sola firma, valida en Node y en el borde

**R14.** El sistema DEBE verificar la firma de la cookie con **la misma implementacion que la
emite**; NO DEBE existir una segunda implementacion del algoritmo de firma en el repositorio
—**raiz incluida**—, ni con `node:crypto` ni con `crypto.subtle`.

**R15.** El sistema DEBE calcular esa firma con WebCrypto (`crypto.subtle`), disponible tanto en
Node como en el borde; ningun archivo alcanzable por imports desde `middleware.ts` DEBE importar
`node:crypto`, `@prisma/client`, el cliente Prisma compartido ni `next/headers`.

**R16.** La migracion NO DEBE cambiar el formato del valor de la cookie: mismo prefijo de version
`v1`, mismo troceado por `.`, HMAC-SHA-256 sobre la misma parte firmada, misma clave (los bytes
UTF-8 del secreto) y misma codificacion base64url sin relleno. Una cookie emitida **antes** de la
migracion DEBE seguir validando hasta su `exp`, y los tests de sesion de QC-8 DEBEN seguir en verde
**sin que se modifique ni uno de sus vectores**.

**R17.** El sistema DEBE comparar la firma recibida con la esperada en **tiempo constante** —tiempo
independiente de cuantos bytes coinciden— sin depender de `node:crypto`.

**R18.** SI `SESSION_SECRET` falta o es mas corto que el minimo exigido al emitirla, ENTONCES el
middleware DEBE fallar cerrado —tratar la peticion como «sin sesion» y redirigir al login— y NUNCA
resolver la sesion como valida; el mensaje que registre NO DEBE incluir el valor del secreto.

### Capas, guardias y documentacion

**R19.** Las guardias `guard-firma-sesion-unica` y `guard-arquitectura-modulos` DEBEN barrer tambien
los archivos `.ts`/`.tsx` de **primer nivel** del repositorio; un archivo en la raiz que reimplemente
la firma o que importe un adaptador driven fuera de `lib/composition/**` DEBE poner el gate en rojo.
Esta ampliacion DEBE estar verde **antes** de que exista `middleware.ts`.

**R20.** La decision de acceso —que ruta es privada, si la sesion vale, a donde se redirige y si el
destino de vuelta es interno— DEBE vivir en `domain/` del modulo `identity` y ser ejercitable sin
Next, sin cookies y sin base de datos; `middleware.ts` en la raiz DEBE limitarse a delegar y a
declarar su `matcher`, sin ninguna decision propia.

**R21.** `middleware.ts` y el adaptador driving que lo implementa NO DEBEN importar un adaptador
driven: el cableado DEBE seguir viviendo solo en `lib/composition/**`.

**R22.** El middleware NO DEBE intervenir en los recursos estaticos (`/_next/static`, `/_next/image`,
`favicon.ico` y assets equivalentes): no los redirige ni los inspecciona.

**R23.** `docs/architecture.md > Permisos y autenticacion` DEBE describir el middleware como
validador de **firma y caducidad** de la cookie de sesion, y NO DEBE seguir diciendo que «verifica
existencia de cookie de sesion».

**R24.** *(Heredado de QC-8, donde quedo fuera de alcance por no existir ninguna URL privada; la
historia esta en `specs/QC-8-sesion-actual-y-logout/requirements.md > Preguntas abiertas 3` y en la
fila revisada de su tabla.)* CUANDO se ejecute la suite E2E, DEBE existir al menos un recorrido en
navegador real que: pida una pantalla privada **sin sesion** y termine en el login, entre con
credenciales correctas, aterrice **en la pantalla que habia pedido**, vea en la barra lateral el
nombre real del usuario, cierre sesion, termine en el login y compruebe que volver atras no muestra
la zona privada; ese recorrido DEBE borrar al terminar todas las filas que haya creado.

**R25.** El sistema NO DEBE añadir ninguna dependencia nueva a `package.json`: WebCrypto es API de
plataforma. SI aun asi hiciera falta una, ENTONCES DEBE proponerse en `design.md` con los cuatro
checks de `docs/architecture.md > Dependencias de terceros` y quedar **pendiente de aprobacion
humana**, sin instalarse.

## Preguntas abiertas

Las dos que abrio la acotacion se cerraron el mismo dia y estan en la tabla (D9 y D10). El spec
abrio estas dos, que la tabla no cubre y que **no se resuelven aqui** (`CLAUDE.md`, regla 6):

1. **¿De donde saca el middleware el rol cuando exista la primera regla ruta→rol?** D8 cierra que el
   permiso lo comprueba el middleware, y R12 construye el gancho. Pero el borde **no tiene base de
   datos** y el token **no lleva el rol** (su formato esta congelado, D3). Con el conjunto de reglas
   vacio la pregunta no muerde: R12/R13 se implementan y se testean enteros pasando el rol como
   dato de entrada de la decision, y el middleware pasa hoy «rol desconocido». Cuando llegue la
   primera regla —la pantalla de productos, solo Administrador— habra que elegir entre: (a) añadir
   el rol al token en una version `v2` del formato, con el coste de reabrir D3 y de invalidar
   sesiones vivas; (b) dejar que el middleware corte solo por autenticacion y que la regla de rol la
   aplique el Server Component de esa pantalla, que si tiene base; (c) una consulta desde el borde a
   un endpoint interno, que paga latencia en cada navegacion. **Lo decide la ficha que traiga la
   primera regla, no esta.**
2. **¿Que hace `/` (la raiz del sitio)?** Hoy `app/page.tsx` es la plantilla de Next: no cuelga de
   `(private)` ni de `(public)`, asi que R1 no la protege y R10/R11 no la mencionan. Un usuario con
   sesion que abra `/` sigue viendo esa plantilla. Redirigirla al dashboard —o al login— seria un
   comportamiento nuevo que la tabla no cierra, y esta ficha **no lo inventa**: `/` se queda como
   esta y se anota aqui para que se decida donde toque.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-02 | ¿Cómo comprueba el middleware la sesión, si el borde no tiene `node:crypto`? | **La firma migra a WebCrypto (`crypto.subtle`)**, que existe en Node y en el borde, y el middleware **valida de verdad**: firma y caducidad. Se descartan las otras dos salidas: verificar solo la existencia de la cookie (deja pasar una caducada o falsificada hasta la página) y correr el middleware en runtime Node (sale del camino por defecto y cuesta en cada navegación) |
| 2026-09-02 | ¿Cuántas implementaciones del HMAC quedan? | **Una sola, en todo el repositorio.** Es R5 de QC-8 y la razón de ser de esta decisión: el middleware era el candidato número uno a convertirse en la segunda |
| 2026-09-02 | ¿La migración puede cambiar el formato del token? | **No.** Mismo formato, mismo algoritmo, misma codificación: **las sesiones ya emitidas siguen valiendo**. Es además la mejor red para tocar código ajeno — los tests de QC-8 deben seguir verdes **byte a byte**, sin reescribir sus vectores |
| 2026-09-02 | ¿Qué rutas se protegen? | **Por convención: todo lo que cuelga de `app/(private)/`.** Una pantalla nueva queda protegida **por nacer ahí**, sin tocar el middleware ni acordarse de una lista. Se descarta la lista explícita: olvidar una entrada no rompe ningún test, simplemente deja la pantalla abierta |
| 2026-09-02 | ¿Se vuelve a la ruta pedida tras entrar? | **Sí.** Quien pide una pantalla concreta sin sesión aterriza en ella después de entrar, no en el dashboard |
| 2026-09-02 | ¿Y el riesgo de redirector abierto? | **La ruta de vuelta se valida como interna**, siempre. Sin eso, un enlace fabricado sacaría al usuario del ERP justo después de autenticarse, que es el agujero clásico de este patrón |
| 2026-09-02 | ¿Y si tiene sesión pero no acceso a esa ruta? | **Va al dashboard, no al login.** «No autorizado» no es «no autenticado»: mandarlo al login le haría creer que su sesión caducó y reintentaría en bucle |
| 2026-09-02 | ¿Quién comprueba ese permiso? | **El middleware**, que es quien decide si devuelve al usuario a la ruta pedida. O sea que el gancho de reglas ruta→rol **se construye en esta ficha**, aunque hoy no haya ninguna regla que aplicar |
| 2026-09-02 | ¿Y el login con sesión válida? | **Redirige al dashboard.** El login sigue siendo público para quien no tiene sesión |
| 2026-09-02 | Frontera con QC-13 | **QC-9 es el portero** (middleware, validación y redirecciones). **QC-13 es la costura de UI** (el formulario autentica de verdad, el layout muestra al usuario real, su cerrar sesión funciona). Sin solape: una es servidor, la otra es UI |
| 2026-09-02 | Las guardias no ven la raíz del repo | **Se amplían `PRODUCTION_DIRS` (`guard-firma-sesion-unica`) y `SCAN_ROOTS` (`guard-arquitectura-modulos`) a los `.ts` de primer nivel ANTES de escribir `middleware.ts`.** Hoy las dos barren solo `lib`, `app`, `components` y `hooks`, así que un `createHmac` propio en la raíz **pasa el gate en verde** — verificado por el reviewer de QC-8 creando el archivo y borrándolo. Encargo ya anotado en `progress/current.md`; R5 dice «en el repositorio», no «en `lib/`» |
| 2026-09-02 | `docs/architecture.md` deja de ser cierto | **Hay que actualizarlo.** `> Permisos y autenticacion` dice hoy que el middleware «verifica existencia de cookie de sesión», y esta ficha lo cambia a validación real. Es el documento que el `reviewer` usa para juzgar: si no se actualiza, la implementación correcta se leerá como una desviación |
| 2026-09-02 | Módulo propietario | **`identity`.** El middleware es un adaptador driving de ese módulo; la lógica de validar la sesión vive en su dominio, no en el archivo de Next (**QC-15**, y `CHECKPOINTS.md > Modulos hexagonales`: «la lógica de negocio está en `domain/`, no en la Server Action» — aquí, no en el middleware) |
| 2026-09-02 | Librería nueva | **Ninguna.** WebCrypto es API estándar de la plataforma, no una dependencia. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
