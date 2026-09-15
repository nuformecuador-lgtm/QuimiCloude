# QC-104 — sesion-una-sola-vez-por-peticion · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** ninguna ·
> **Rama** `feature/QC-104-sesion-una-sola-vez-por-peticion` · **Bloquea** QC-28
>
> **Alcance.** Dentro de **una misma peticion** la sesion se resuelve **una sola vez**, venga de
> donde venga: layout, pagina, componente de servidor o **Server Action**. Las siguientes llamadas
> reciben el mismo resultado ya calculado. Y la ficha **deja la medicion que QC-28 no tiene**: un
> **conteo** de lecturas por peticion que vigila el gate, y **tiempos antes y despues** medidos
> una vez y escritos en disco.
>
> **Medido en disco el 2026-09-15**, mas de lo que decia la ficha: tres lecturas por pagina en
> `/configuracion/usuarios`, `/pedidos` y `/configuracion/unidades`; dos en el resto; y **dos por
> cada clic de guardar** en 8 archivos de Server Actions (`getSessionUser` + `getSessionContext` en
> paralelo). *(Al sembrar se escribio «11»: error de conteo del leader, corregido el 2026-09-15 tras
> el hallazgo H4 de `design.md > 0`.)*
>
> **Lo que NO entra.**
> - **Guardar el resultado entre peticiones** (Redis o cualquier cache): es **QC-28**.
> - **Decidir si Redis hace falta**: lo decide el humano al reabrir QC-28, con los numeros delante.
> - **Monitorizacion permanente de rendimiento** o una linea de log por peticion: nadie la pidio.
> - **Otras consultas repetidas de las pantallas** que no sean la sesion.
>
> *Sembrado por `/afinar-feature` el 2026-09-15. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> **Vocabulario de estos requisitos.** *Leer la ficha de sesion* es la consulta a la base que hoy
> hace cada resolucion de la sesion (una por resolucion que pasa los cortes de cookie y caducidad).
> *Servir una pantalla* es la respuesta a una navegacion de la zona privada: layout privado, pagina,
> componentes de servidor y todo lo que estos invoquen mientras se pinta. *Invocar una Server Action*
> es la ejecucion de una accion pedida desde el navegador, sin el repintado que Next pueda hacer
> despues en la misma respuesta (ese repintado lo trata R4, provisional, ver Pregunta abierta 2).
> Entre corchetes, la decision cerrada de la que sale cada requisito (numero de fila de la tabla).

### Una sola lectura por peticion

- **R1** — CUANDO el servidor sirve una pantalla de la zona privada con una cookie de sesion valida,
  el sistema DEBE leer la ficha de sesion como maximo UNA vez en esa peticion, sumando las lecturas
  del layout privado, de todos los cortes por permiso de la pagina, de los componentes de servidor y
  de las Server Actions que esos componentes invoquen mientras se pinta. [1, 2]
- **R2** — CUANDO el servidor sirve `/configuracion/usuarios`, `/pedidos` o `/configuracion/unidades`
  a una sesion valida que tiene los permisos de esa pantalla, el sistema DEBE leer la ficha de sesion
  exactamente UNA vez en esa peticion. [1, 2]
- **R3** — CUANDO se invoca desde el navegador una Server Action que resuelve quien la pide, el
  sistema DEBE leer la ficha de sesion como maximo UNA vez durante esa invocacion, aunque la accion
  necesite a la vez el usuario y la empresa de la sesion. [1]
- **R4** — *(Provisional, pendiente de la Pregunta abierta 2.)* SI tras invocar una Server Action el
  servidor vuelve a pintar la pantalla dentro de la misma respuesta, ENTONCES ese repintado DEBE
  leer la ficha de sesion de nuevo, como maximo UNA vez, sin reutilizar la lectura hecha durante la
  accion. [1, 5]

### Nunca entre peticiones

- **R5** — CUANDO la misma cookie de sesion llega en dos peticiones distintas, seguidas o
  simultaneas, el sistema DEBE leer la ficha de sesion en cada una de ellas. [5]
- **R6** — CUANDO se atienden a la vez peticiones de personas distintas, el sistema DEBE entregar a
  cada peticion la sesion que corresponde a su propia cookie. [5]
- **R7** — SI una lectura de sesion ocurre fuera de servir una pantalla y fuera de invocar una Server
  Action (un route handler, un script, un test sin peticion), ENTONCES el sistema DEBE leer la ficha
  de sesion en cada llamada, igual que antes de esta ficha. [5]
- **R8** — CUANDO la ficha de un usuario se da de baja mientras su sesion esta abierta, el sistema
  DEBE llevar a esa persona al login en su siguiente navegacion, con una sola redireccion. [5]

### Fallo cerrado y estructura de la resolucion

- **R9** — SI la lectura de la ficha de sesion falla durante una peticion, ENTONCES todas las
  lecturas de sesion de esa misma peticion DEBEN resolver «sin sesion», sin volver a intentar la
  consulta. [6]
- **R10** — SI la lectura de la ficha de sesion falla durante una peticion, ENTONCES el sistema DEBE
  dejar la causa en el registro del servidor UNA sola vez para esa peticion. [6, 8]
- **R11** — El sistema DEBE seguir ofreciendo `getSessionUser` y `getSessionContext` sin parametros
  y con su mismo tipo de resultado, y las dos DEBEN devolver `null` exactamente en los mismos casos.
  [7]
- **R12** — MIENTRAS una peticion tiene sesion valida, el sistema DEBE entregar las dos proyecciones
  de esa peticion desde la misma lectura: el identificador del usuario y el de su contexto coinciden,
  y el rol es el mismo en las dos. [7]
- **R13** — CUANDO una misma invocacion de Server Action emite la sesion y despues la lee (el inicio
  de sesion), el sistema DEBE devolver la sesion recien emitida. [5, 7]

### Medicion

- **R14** — MIENTRAS las peticiones se atienden sin fallos, el sistema DEBE atenderlas sin escribir
  ninguna linea en el registro por la resolucion de la sesion ni por su medicion. [2, 8]
- **R15** — El gate DEBE contener una comprobacion ejecutable que cuente las lecturas de la ficha de
  sesion por peticion en las tres pantallas de R2 y en cada Server Action que resuelve a la vez el
  usuario y la empresa de la sesion, y que falle cuando cualquiera de ellas supere UNA. [2]
- **R16** — El sistema DEBE dejar escrito en disco, una sola vez, el numero de lecturas de la ficha
  de sesion por peticion medido en ejecucion real antes y despues del cambio, para las tres
  pantallas de R2 y al menos un guardado, junto con el metodo para repetirlo. Esta medicion no
  depende de la Pregunta abierta 1. [2]
- **R17** — DONDE esten acordados el proyecto Supabase real, las credenciales y el usuario de la
  Pregunta abierta 1, el sistema DEBE dejar escritos en disco los tiempos de respuesta antes y
  despues, medidos una sola vez en local contra ese proyecto, para las tres pantallas de R2 y al
  menos un guardado, junto con el metodo para repetirlos. [2, 3]
- **R18** — MIENTRAS la Pregunta abierta 1 siga sin respuesta, el documento de medicion DEBE
  declarar los tiempos como pendientes de ella y DEBE omitir cualquier tiempo medido contra la base
  local como si fuera la cifra que pide QC-28. [3]
- **R19** — El documento de medicion DEBE limitarse a los numeros antes y despues y a su metodo, sin
  fijar un umbral ni recomendar si QC-28 arranca. [4]

### Lo que no cambia

- **R20** — El sistema DEBE cumplir R1 a R14 sin ninguna dependencia de terceros que no figure ya en
  `package.json` y en `docs/dependencias.md`. [9]
- **R21** — El sistema DEBE conservar el comportamiento de sesion que cubren los E2E existentes de
  `e2e/session.spec.ts`, sin E2E nuevo. [10]
- **R22** — El sistema DEBE conservar lo que ve la persona en la zona privada: sin sesion, la
  redireccion al login con la marca de sesion cortada; con sesion y sin el permiso de la pantalla, el
  404 dentro del layout privado; y el menu filtrado por los permisos de la sesion. [11]

### Cobertura de las decisiones cerradas

| Decision (fila) | Requisitos |
|---|---|
| 1 — pantallas y Server Actions | R1, R2, R3, R4 |
| 2 — conteo en el gate + tiempos una vez, sin logs | R1, R2, R14, R15, R16, R17 |
| 3 — tiempos en local contra Supabase real | R17, R18 |
| 4 — sin umbral para QC-28 | R19 |
| 5 — solo lo que dura la peticion, nunca entre peticiones | R4, R5, R6, R7, R8, R13 |
| 6 — fallo cerrado, una lectura fallida vale para toda la peticion | R9, R10 |
| 7 — una instancia, dos proyecciones, sin cambio de firma | R11, R12, R13 |
| 8 — sin log por peticion | R10, R14 |
| 9 — sin dependencia nueva | R20 |
| 10 — sin E2E nuevo, los de sesion siguen verdes | R21 |
| 11 — `backend`/`medium`, no toca pantallas | R22 |

## Preguntas abiertas

1. **Contra que Supabase se miden los tiempos, y con que credenciales.** El `.env` de hoy apunta
   a una base **local** (`DATABASE_URL` y `DIRECT_URL` en `localhost`), y en el repo no hay
   ningun Supabase real configurado. Falta decidir **que proyecto** (no uno con datos reales de
   una empresa), **quien pone las credenciales** y **con que usuario** se entra. **Solo bloquea
   la mitad de tiempos**; el conteo del gate no depende de esto. `spec_author` no la cierra por
   su cuenta.
2. **¿Que es «una peticion» cuando una Server Action pide repintar la pantalla?** *(Anadida por
   `spec_author` el 2026-09-15; detalle en `design.md > 0`, hallazgo H2.)* Cuando una accion
   revalida, Next ejecuta la accion y **despues** repinta la pantalla **en la misma respuesta HTTP**.
   Hay dos lecturas posibles de la decision 1: **(a)** accion y repintado son dos ambitos, hasta
   **dos** lecturas por esa respuesta, y el repintado ve la ficha **despues** de la mutacion; **(b)**
   es un solo ambito y el repintado reutiliza la lectura de la accion, con una lectura en total pero
   pintando la sesion de **antes** de la mutacion (si la accion cambio el rol o el estado de quien la
   pide, el menu de esa respuesta saldria desfasado). **R4 esta escrito con (a), como provisional.**
   Lo decide el humano.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decision |
|---|---|---|
| 2026-09-15 | ¿Que entra: solo abrir pantallas, o tambien guardar? | **Las dos.** Una lectura por peticion, venga de layout, pagina, componente de servidor o Server Action. Si el mecanismo elegido no alcanza a las acciones, `spec_author` **lo declara por escrito con la evidencia** en `design.md`; no lo deja fuera en silencio |
| 2026-09-15 | ¿Que forma tiene la medicion? | **Conteo en el gate + tiempos una vez.** Un test cuenta las lecturas de sesion por peticion y **falla si pasan de una**, que es lo que impide que esto se deshaga en silencio. Los tiempos se miden **antes y despues, una sola vez**, y quedan **escritos en disco con el metodo para repetirlos**, no en el chat (regla 3). **Sin logs en produccion** |
| 2026-09-15 | ¿Donde se miden los tiempos? | **En local, contra un Supabase real.** Contra la base local la red no aparece, y la red es justo lo que discute QC-28 (decision 10: «Postgres-por-red contra Redis-por-HTTP»). Pendiente de la pregunta abierta 1 |
| 2026-09-15 | ¿Con que umbral arranca QC-28? | **Ninguno fijado aqui.** Nadie tiene hoy una referencia para elegir la cifra. QC-104 entrega los numeros antes y despues, y **decide el humano** al reabrir QC-28 |
| 2026-09-15 | ¿Se toca «dar de baja surte efecto en el siguiente clic»? | **No.** Heredado de **QC-8** («el usuario se resuelve contra la base en cada peticion»). El resultado vive **solo lo que dura la peticion** y **nunca** se reutiliza entre peticiones: eso seria QC-28. La red ya existe: `e2e/session.spec.ts:352` |
| 2026-09-15 | ¿Y si la base falla al resolver? | **Se falla cerrado, como hoy.** Heredado de **QC-23, decision 13**. Una lectura fallida vale para **toda** la peticion: layout y pagina ya no pueden discrepar |
| 2026-09-15 | ¿Se conserva la estructura de la resolucion? | **Si.** Heredado de **QC-48 R19 y R21**: una sola instancia de `resolveSession` con sus dos proyecciones, `getSessionUser` y `getSessionContext`, que devuelven `null` en exactamente los mismos casos. Ninguna de las dos cambia de firma |
| 2026-09-15 | ¿Log por peticion para medir? | **No.** Heredado de **QC-71 y QC-57**: el log se escribe **solo cuando algo falla**. La medicion no deja ninguna linea por peticion |
| 2026-09-15 | ¿Dependencia nueva? | **Ninguna.** Next 16 documenta `React.cache` para compartir un resultado dentro de una peticion (`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md:264`). Si `design.md` concluye que no basta, lo dice; **no se instala nada** sin la regla 7 |
| 2026-09-15 | ¿Hace falta E2E? | **No hace falta uno nuevo, y se difiere aqui con motivo.** Heredado de **QC-71 y QC-54**: nadie entra ni sale de ninguna pantalla por esto. La red son **los E2E de sesion que ya existen**, que siguen en verde |
| 2026-09-15 | ¿Zona y complejidad? | **`backend` / `medium`, sin cambio.** No toca ninguna pantalla; crece el alcance, pero no el riesgo |
