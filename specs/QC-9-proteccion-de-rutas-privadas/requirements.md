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
>
> **Revision del 2026-09-02 (segunda tanda).** El humano cerro la pregunta abierta 1: **el rol viaja
> dentro de la cookie**, y en consecuencia **el formato del token cambia y sube de version**. Eso
> **deroga D3** (ver la tabla: la fila se conserva tachada, con su motivo). Los requisitos afectados
> son R4, R12 y R16, reescritos en sitio; los nuevos son R26–R30. La numeracion R1–R25 no se mueve.

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

**R4.** *(Revisado el 2026-09-02.)* El middleware NO DEBE consultar la base de datos ni resolver el
`SessionUser`: decide **solo** con lo que viaja firmado en la cookie —identificador, caducidad y
**rol** (R26)—. La resolucion del usuario contra la base (rol y nombre **actuales**) sigue siendo del
layout privado (QC-8 R10, R12).

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

**R12.** *(Revisado el 2026-09-02.)* El sistema DEBE ofrecer un conjunto declarado de reglas ruta→rol
que la decision de acceso consulta en cada peticion, evaluandolas contra el **rol que viaja firmado
en la cookie** (R26) y sin consultar la base; ese conjunto DEBE estar **vacio** en esta ficha, y
MIENTRAS este vacio toda sesion valida DEBE pasar a cualquier ruta privada.

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

**R16.** *(Reescrito el 2026-09-02: D3 derogada, ver la tabla.)* La migracion a WebCrypto NO DEBE
cambiar el **algoritmo ni la codificacion** del valor de la cookie: mismo troceado en tres por `.`,
HMAC-SHA-256 sobre la parte firmada completa, misma clave (los bytes UTF-8 del secreto) y misma
codificacion base64url **sin relleno**. Lo unico que cambia es la **version** y el **contenido** del
payload (R26, R27). En consecuencia, la firma que produzca la implementacion WebCrypto para una
misma parte firmada DEBE ser identica byte a byte a la que producia `node:crypto`, y los tests de
sesion de QC-8 DEBEN seguir en verde **sin que se cambie la forma en que recomputan la firma
esperada**: sus unicas modificaciones admisibles son el literal de version y la lista de claves del
payload.

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

### El rol dentro de la cookie *(revision del 2026-09-02)*

**R26.** CUANDO se emite una sesion, el contenido firmado DEBE llevar, ademas del identificador de
usuario y los instantes de emision y caducidad, **el nombre del rol** que esa persona tiene en la
base **en el instante de emitir**; ese rol DEBE tomarse de la base y NUNCA de un dato recibido del
cliente.

**R27.** El sistema DEBE subir la **version del valor de la cookie**; SI el valor recibido trae la
version anterior (`v1`), ENTONCES DEBE rechazarse como «sin sesion» **sin verificar su firma y sin
intentar interpretarlo**, y el usuario DEBE terminar en el login. NO DEBE existir compatibilidad
hacia atras: un token de la version anterior no vale, ni aunque su firma y su `exp` fueran correctos.

**R28.** SI el contenido firmado de la version vigente no trae un rol con forma valida —ausente,
vacio o de un tipo que no es texto—, ENTONCES el sistema DEBE resolver «sin sesion», sin consultar la
base y sin suponer ningun rol por defecto.

**R29.** El rol firmado NO DEBE usarse como frontera de autorizacion: su unico efecto admisible es
**mostrar, ocultar o redirigir una pantalla**. Toda autorizacion sobre datos u operaciones DEBE
seguir validandose en el service (`docs/architecture.md > Acceso a datos y autorizacion`), y la
decision de acceso de ruta NO DEBE devolver capacidades ni permisos, solo «pasa» o «redirige a».

**R30.** MIENTRAS no exista la revocacion de sesiones (QC-23), el rol firmado DEBE entenderse como
una **foto del instante de la emision**: CUANDO a una persona se le cambia el rol, sus sesiones ya
emitidas DEBEN seguir llevando el rol anterior hasta que caduquen, y el sistema NO DEBE simular lo
contrario renovando ni reemitiendo la cookie al leerla. La consecuencia visible —el middleware puede
dejar pasar a una pantalla que el service le denegara, o cortarle una a la que ya tendria
derecho— DEBE quedar cubierta por un test que la caracterice, no disimulada.

## Preguntas abiertas

Las dos que abrio la acotacion se cerraron el mismo dia y estan en la tabla (D9 y D10). El spec abrio
dos mas: **la 1 la cerro el humano el 2026-09-02** (y su respuesta derogo D3); **la 2 sigue abierta**
y no se resuelve aqui (`CLAUDE.md`, regla 6).

1. ~~**¿De donde saca el middleware el rol cuando exista la primera regla ruta→rol?**~~ **CERRADA
   por el humano el 2026-09-02: el rol viaja DENTRO de la cookie.** La pregunta era: el borde no
   tiene base de datos y el token no llevaba el rol, asi que se ofrecieron tres salidas — (a) subir
   la version del formato para meter el rol, (b) que la regla de rol la aplicara el Server Component,
   (c) una consulta del borde a un endpoint interno. **El humano eligio (a)** y acepto su coste:
   *«no existen sesiones vivas y si alguna vive la borramos desde el navegador»*. Consecuencias, todas
   con requisito: el contenido firmado gana el rol (**R26**), la version sube y la anterior se
   **rechaza** sin compatibilidad (**R27**, **R28**), y **D3 queda derogada** — no matizada — con su
   fila reescrita en la tabla. Se descartaron (b) por dejar el gancho de D8 sin efecto real en el
   middleware, y (c) por pagar latencia de red en cada navegacion.

   **Lo que la respuesta arrastra y no se disimula:** el rol firmado envejece (**R30**), y el
   middleware **no** es la frontera de autorizacion (**R29**).
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
| 2026-09-02 · **DEROGADA el mismo día** | ¿La migración puede cambiar el formato del token? | ~~**No.** Mismo formato, mismo algoritmo, misma codificación: **las sesiones ya emitidas siguen valiendo**. Es además la mejor red para tocar código ajeno — los tests de QC-8 deben seguir verdes **byte a byte**, sin reescribir sus vectores~~ · **Derogada**, no matizada, por la decisión de meter el rol en la cookie (fila de abajo). Se conserva porque explica de dónde viene el diseño: se cerró primero al revés, y cambió cuando el humano confirmó que **no hay sesiones vivas que preservar** («y si alguna vive la borramos desde el navegador»), con lo que el único argumento a favor de congelar el formato —la compatibilidad— dejó de existir. **Lo que sí sobrevive de esta fila es la parte criptográfica** (mismo algoritmo, misma clave, misma codificación base64url) y su red de seguridad: R16 |
| 2026-09-02 | ¿De dónde saca el middleware el rol, si el borde no tiene base? | **El rol viaja DENTRO de la cookie**, firmado junto al resto del contenido, y el middleware comprueba el permiso en el borde sin consultar la base ni llamar a ningún endpoint interno. Cierra la pregunta abierta 1 del spec. Requisitos: R26, R12 |
| 2026-09-02 | ¿Y las sesiones ya emitidas, entonces? | **Se rompen a propósito.** La versión del valor de la cookie **sube**, y un token de la versión anterior **se rechaza** sin verificar su firma: no hay compatibilidad hacia atrás ni doble camino de verificación. Aceptado explícitamente: *«no existen sesiones vivas y si alguna vive la borramos desde el navegador»*. Requisitos: R27, R28 |
| 2026-09-02 | ¿Un cambio de rol debe cortar las sesiones de esa persona? | **Sí, al instante — pero se implementa en QC-23** (revocación de sesiones), no aquí. **Mientras tanto**, el rol firmado es una foto del momento de la emisión y un cambio de rol no surte efecto hasta que la sesión caduca (8 h). Es un límite conocido, no un olvido, y lleva test de caracterización: R30 |
| 2026-09-02 | ¿El rol en la cookie convierte al middleware en la frontera de seguridad? | **No.** `docs/architecture.md > Acceso a datos y autorizacion` sigue mandando: **la autorización se valida en el service**. El rol en el token es solo un atajo para no enseñar una pantalla que el usuario no va a poder usar. Un rol en una cookie invita justo al error contrario, así que queda como requisito propio: R29 |
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
