# QC-73 — limite-de-peticiones-por-origen · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** QC-71 (done) · **Rama:** `feature/QC-73-limite-de-peticiones-por-origen`
>
> **Alcance.** Un límite de peticiones **por origen (IP)**, aplicado en el adaptador del middleware
> sobre **todas** las peticiones que entran por el `matcher`: navegación, login y Server Actions.
> El contador vive en **Upstash Redis**, detrás de un puerto. Al frenar, la persona ve en pantalla el
> mensaje neutro «Demasiados intentos. Prueba de nuevo más tarde», sin decir cuánto falta. Si
> Upstash no responde, se deja pasar y queda un aviso en el log.
>
> **Lo que NO entra.** Tocar el bloqueo de cuenta de `identity` (`account-lock.ts`): son capas
> complementarias. Ningún cambio en `db/`. Ninguna pantalla para ver, ajustar o levantar límites.
> Migrar `middleware.ts` a `proxy.ts` (Next 16 lo declara obsoleto): sin ficha, y no se hace de
> paso. La caché de sesión en Redis, que es QC-28.
>
> Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Las decisiones cerradas se citan como **[D1]…[D9]**, numeradas en el orden de las filas de la
> tabla de abajo: D1 qué peticiones cuentan · D2 Upstash no responde · D3 cuotas · D4 cómo se ve el
> freno · D5 plan y caché en memoria · D6 latencia · D7 dependencia nueva · D8 E2E · D9 lo heredado.
> «Mensaje neutro» es, en todo este archivo, el texto exacto «Demasiados intentos. Prueba de nuevo
> más tarde». El mapa `R<n> -> test` previsto está en `tasks.md > Trazabilidad`.

### Qué se cuenta

- **R1** [D1] El sistema DEBE contar contra la cuota de su origen **cada** petición que entre por el
  `matcher` del middleware: navegación de página, petición de datos de una navegación del cliente,
  precarga de enlaces, envío de Server Action y login.
- **R2** [D3] CUANDO una petición va a la ruta del login, cualquiera que sea su método, el sistema
  DEBE contarla en la **cuota de login** y NO en la general.
- **R3** [D1] [D3] CUANDO una petición va a cualquier otra ruta del `matcher`, el sistema DEBE
  contarla en la **cuota general**.
- **R4** [D1] El sistema DEBE llevar la cuenta de cada origen por separado: que un origen agote su
  cuota NO DEBE frenar ninguna petición de otro origen.
- **R5** [D3] CUANDO termina la ventana en la que un origen agotó su cuota, el sistema DEBE volver a
  dejar pasar sus peticiones.

### De dónde sale el origen (cierra la pregunta abierta 3)

- **R6** El sistema DEBE identificar el origen de una petición por la **primera** dirección de su
  cabecera `x-forwarded-for`.
- **R7** SI esa cabecera falta, o su primera entrada no es una dirección IPv4 o IPv6 válida,
  ENTONCES el sistema DEBE contar la petición bajo un único origen común «desconocido».

### El freno

- **R8** [D1] SI el origen ha agotado la cuota que corresponde a la petición, ENTONCES el sistema
  DEBE responder con estado **429** sin ejecutar la página, la ruta ni la Server Action pedidas.
- **R9** [D9] El sistema DEBE decidir el freno **antes** de verificar la sesión: una petición frenada
  NO DEBE llegar a verificar la cookie de sesión ni a recibir identificador de petición.
- **R10** [D4] CUANDO el sistema frena una petición que no es de Server Action, DEBE responder con una
  pantalla que muestre el mensaje neutro.
- **R11** [D4] CUANDO el sistema frena una Server Action invocada desde un formulario, el mensaje
  neutro DEBE aparecer en la pantalla donde está ese formulario, sin navegar a otra pantalla y sin
  mostrar la pantalla de error genérica.
- **R12** [D4] SI una Server Action falla por cualquier motivo que no sea el freno, ENTONCES el
  sistema DEBE tratar ese fallo exactamente como hoy: NO DEBE tomarlo por un freno ni mostrar el
  mensaje neutro.
- **R13** [D4] El sistema NO DEBE revelar cuánto falta ni cuánto queda: ni en el texto, ni en el
  cuerpo, ni en cabeceras de respuesta (`Retry-After`, `X-RateLimit-*` o equivalentes).
- **R14** [D4] La respuesta de freno DEBE ser la misma sea cual sea la cuota agotada, la ruta pedida
  y si la petición trae sesión o no; lo único que la distingue es si es pantalla o Server Action
  (R10, R11).
- **R15** [D4] La pantalla de freno DEBE poder leerse en navegador de móvil (iOS y Android) sin
  hacer zoom: ajustada al ancho del dispositivo, con texto de al menos 16 px y sin alto `100vh`.
- **R16** [D4] La respuesta de freno NO DEBE poder guardarse en caché, ni en el navegador ni en un
  intermediario.

### Las cuotas

- **R17** [D3] El sistema DEBE leer de variables de entorno el máximo y la ventana de cada cuota y el
  tiempo máximo de espera al contador, de modo que cambiarlos NO exija cambiar código.
- **R18** [D3] SI una de esas variables no está definida, ENTONCES el sistema DEBE usar su valor por
  defecto: login **30 peticiones cada 600 s**; general **600 peticiones cada 60 s**; espera máxima
  **500 ms**.
- **R19** [D3] SI una de esas variables tiene un valor que no es un entero positivo, ENTONCES el
  sistema DEBE usar su valor por defecto y registrar un aviso que nombre la variable.
- **R20** [D3] Con los valores por defecto, la cuota de login DEBE admitir menos peticiones por
  segundo que la general.

### Si el contador falla

- **R21** [D2] SI el contador no responde dentro del tiempo máximo de espera, ENTONCES el sistema
  DEBE dejar pasar la petición, sin esperar más que ese tiempo, y registrar un aviso.
- **R22** [D2] SI el contador responde con un error, ENTONCES el sistema DEBE dejar pasar la petición
  y registrar un aviso.
- **R23** [D2] CUANDO el sistema deja pasar una petición por fallo del contador, esa petición DEBE
  seguir exactamente el camino que sigue hoy: verificación de sesión, redirecciones e identificador
  de petición.
- **R24** [D2] El aviso NO DEBE contener la dirección del origen ni ninguna credencial del contador.

### El contador y su caché

- **R25** [D9] [D7] DONDE estén definidas `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, el
  sistema DEBE contar en Upstash Redis.
- **R26** [D9] [D8] MIENTRAS falte cualquiera de las dos y el entorno no sea el de producción, el
  sistema DEBE contar en la memoria de la propia instancia. _Qué pasa en producción sin
  credenciales es la pregunta abierta 1 y no se rellena aquí._
- **R27** [D9] El contador en memoria y el de Upstash DEBEN aplicar la misma regla de cuota y ventana:
  la misma secuencia de peticiones produce los mismos frenos en los dos.
- **R28** [D5] DONDE el contador de Upstash esté activo, el sistema DEBE recordar en la memoria de la
  instancia los orígenes ya frenados y frenarlos **sin consultar Upstash** mientras dure su ventana.

### Lo heredado y lo que no se toca

- **R29** [D9] El archivo `middleware.ts` de la raíz NO DEBE cambiar: sigue siendo el cascarón con el
  reexport y el `matcher`.
- **R30** [D9] El cierre de imports desde `middleware.ts` NO DEBE traer ningún paquete ni archivo que
  `guard-middleware-edge` prohíbe, DEBE alcanzar los archivos nuevos del límite, y la guardia NO DEBE
  perder ninguna de sus prohibiciones.
- **R31** [D7] `@upstash/ratelimit` y `@upstash/redis` DEBEN importarse únicamente desde el adaptador
  del contador de Upstash.
- **R32** [D7] Las únicas dependencias nuevas de `package.json` DEBEN ser `@upstash/ratelimit` y
  `@upstash/redis`, cada una con su fila en `docs/dependencias.md`.
- **R33** El bloqueo de cuenta de `identity` (5 fallos, escalada de 1, 5, 15 y 60 minutos) NO DEBE
  cambiar su comportamiento.

### Latencia y E2E

- **R34** [D6] El repositorio DEBE incluir un procedimiento reproducible que mida la latencia que
  añade el límite —p50 y p95 por petición, con el contador de Upstash y con el de memoria—, y el PR
  de la ficha DEBE anotar su resultado.
- **R35** [D8] [D4] CUANDO desde un mismo origen se agota la cuota de login contra el contador en
  memoria, el siguiente envío del formulario de login DEBE mostrar el mensaje neutro en la propia
  pantalla de login, y la siguiente navegación al login DEBE mostrar la pantalla de freno.

## Preguntas abiertas

1. **La cuenta de Upstash: quién la da de alta y cuándo.** Hoy no existe, ni tampoco
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Queda sin decidir qué hace
   **producción sin credenciales**: ¿se trata como «Upstash no responde» (dejar pasar y avisar) o
   el despliegue debe fallar? El contador en memoria **no** sirve en producción: cada instancia de
   Vercel llevaría su propia cuenta.
   **→ CERRADA por el humano al aprobar el spec (F1.4, 2026-09-18): opción (a)**, ver la última fila de «Decisiones cerradas». Quién da de alta la cuenta y cuándo sigue abierto, y no bloquea T9.
2. **El techo real del plan gratuito.** 500.000 comandos/mes y 256 MB no se pudieron confirmar en
   la fuente. Se verifica al dar de alta la cuenta; si el consumo medido se acerca al techo, se
   decide entre pasar a pago o dejar de contar la navegación.
3. **De qué cabecera sale el origen y cuándo se confía en ella.** Next 16 ya no expone
   `request.ip`. En Vercel, `x-forwarded-for` la pone la plataforma; en local y en otros
   despliegues la puede falsear el cliente. Lo cierra el `design.md`.
   **→ CERRADA en `design.md > 3` (requisitos R6 y R7).** La confianza se apoya en que el único
   despliegue soportado es Vercel; lo que eso deja abierto fuera de Vercel está escrito allí y en
   `design.md > 11 Para decidir al aprobar`, punto 5.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-18 | ¿Qué peticiones cuentan? | **Todas** las que entran por el `matcher`: navegación, login y Server Actions. El humano lo eligió frente a «solo login y guardados», sabiendo que suma un viaje a Upstash por navegación y acerca el techo del plan gratuito. |
| 2026-09-18 | ¿Qué pasa si Upstash no responde? | **Se deja pasar y se registra un aviso en el log.** Un fallo de un tercero no para el ERP, y el login sigue protegido por el bloqueo de cuenta de 5 fallos. La espera a Upstash tiene tiempo máximo, para que un Upstash lento no bloquee como si estuviera caído. |
| 2026-09-18 | ¿Qué cuotas? | **Holgadas, pensando en una oficina entera detrás de una sola IP**, y **ajustables por variable de entorno sin desplegar código**. Los valores por defecto los propone el `design.md`; como orden de magnitud, unos 30 intentos de login cada 10 minutos y cientos de peticiones por minuto. El login lleva una cuota más dura que el resto. |
| 2026-09-18 | ¿Cómo se ve el freno? | **Mensaje neutro en pantalla**: «Demasiados intentos. Prueba de nuevo más tarde», **sin cronómetro** (criterio de QC-7). En una Server Action se muestra en el formulario donde estaba la persona; en una navegación, en una pantalla. Por eso la zona se queda en **fullstack**. |
| 2026-09-18 | ¿Plan de Upstash? | **Gratuito**, con la **caché en memoria de la librería para los orígenes ya bloqueados**, que ahorra comandos. La cifra del techo sigue abierta (pregunta 2). |
| 2026-09-18 | ¿La latencia añadida bloquea? | **Se mide y se anota en el PR, sin umbral que bloquee.** Hoy no hay ninguna referencia contra la que comparar. |
| 2026-09-18 | ¿Dependencia nueva? | **`@upstash/ratelimit` y `@upstash/redis`, APROBADAS por el humano, sujetas a repetir los cuatro checks de salud en F1.4** (los del 2026-09-07 están caducados). El leader escribe las dos filas de `docs/dependencias.md` al aprobar el spec. **Esto saca de suspenso `@upstash/redis`** solo para esta ficha: QC-28 sigue con su propia condición. |
| 2026-09-18 | ¿Hace falta E2E? | **Sí, uno sobre el login**: superar la cuota de login desde el mismo origen y comprobar el mensaje neutro, **contra el contador en memoria**. `CHECKPOINTS.md` lo exige para autenticación. El resto se cubre con tests unitarios y de integración. |
| 2026-09-18 | Lo que se hereda y no se decide otra vez | **El contador entra por un puerto**, con **adaptador en memoria** para tests y desarrollo local, y el de Upstash cableado solo donde hay credenciales (**QC-28**). Se cablea por **`lib/composition/edge.ts`** y se engancha en **`route-guard-middleware.ts`**, no en `middleware.ts`, que sigue siendo un cascarón (**QC-71 / QC-9 R20**). `guard-middleware-edge` **no se relaja**. Identificadores en inglés (**feature 4**). |
| 2026-09-18 | (F1.4) ¿Qué hace producción sin credenciales de Upstash? | **Opción (a): se trata como «Upstash no responde» (D2): se deja pasar y se registra un aviso.** El despliegue NO falla. Producción = `VERCEL_ENV === 'production'` (propuesta de `design.md > 11`, aceptada al aprobar sin cambios). Coste aceptado: hasta que exista la cuenta, en producción no hay límite. Los puntos 2-9 de `design.md > 11` se aceptan tal como los propone el diseño. |
