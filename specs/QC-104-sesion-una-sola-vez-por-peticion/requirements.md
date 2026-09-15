# QC-104 — sesion-una-sola-vez-por-peticion · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** ninguna ·
> **Rama** `feature/QC-104-sesion-una-sola-vez-por-peticion` · **Bloquea** QC-28
>
> **Alcance.** Dentro de **una misma peticion** la sesion se resuelve **una sola vez**, venga de
> donde venga: layout, pagina, componente de servidor o **Server Action**. Las siguientes llamadas
> reciben el mismo resultado ya calculado. **El objetivo es evitar llamadas innecesarias a la base,
> no medir**: se demuestra con un **conteo** de lecturas por peticion que vigila el gate y con una
> comprobacion **una vez** en la app real que cuenta las consultas en la base local, antes y despues.
> *(Revisado el 2026-09-15 por decision humana en F1.4: la version sembrada incluia ademas
> «tiempos antes y despues» para QC-28, y se quitaron. Ver la tabla de decisiones.)*
>
> **Medido en disco el 2026-09-15**, mas de lo que decia la ficha: tres lecturas por pagina en
> `/configuracion/usuarios`, `/pedidos` y `/configuracion/unidades`; dos en el resto; y **dos por
> cada clic de guardar** en 8 archivos de Server Actions (`getSessionUser` + `getSessionContext` en
> paralelo). *(Al sembrar se escribio «11»: error de conteo del leader, corregido el 2026-09-15 tras
> el hallazgo H4 de `design.md > 0`.)*
>
> **Lo que NO entra.**
> - **Guardar el resultado entre peticiones** (Redis o cualquier cache): es **QC-28**.
> - **Medir tiempos de respuesta**, y con ello **decidir si Redis hace falta**: QC-104 no entrega
>   ese numero (revision del 2026-09-15). QC-28 sigue en espera y se justificara por su cuenta.
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
> Entre corchetes, la decision cerrada de la que sale cada requisito (numero de fila de la tabla,
> contando la fila anadida en la revision de F1.4: son 12).
>
> **Revision del 2026-09-15 (F1.4).** Se retiraron **R17, R18 y R19** (tiempos, Supabase real y
> umbral), porque el humano quito los tiempos. **Se dejan huecos a proposito**: esos numeros no se
> reutilizan, y asi R20-R22 y todas las referencias de `design.md` y `tasks.md` siguen apuntando a lo
> mismo.

### Una sola lectura por peticion

- **R1** — CUANDO el servidor sirve una pantalla de la zona privada con una cookie de sesion valida,
  el sistema DEBE leer la ficha de sesion como maximo UNA vez en esa peticion, sumando las lecturas
  del layout privado, de todos los cortes por permiso de la pagina, de los componentes de servidor y
  de las Server Actions que esos componentes invoquen mientras se pinta. [1]
- **R2** — CUANDO el servidor sirve `/configuracion/usuarios`, `/pedidos` o `/configuracion/unidades`
  a una sesion valida que tiene los permisos de esa pantalla, el sistema DEBE leer la ficha de sesion
  exactamente UNA vez en esa peticion. [1]
- **R3** — CUANDO se invoca desde el navegador una Server Action que resuelve quien la pide, el
  sistema DEBE leer la ficha de sesion como maximo UNA vez durante esa invocacion, aunque la accion
  necesite a la vez el usuario y la empresa de la sesion. [1]
- **R4** — *(Provisional, pendiente de la Pregunta abierta 2.)* SI tras invocar una Server Action el
  servidor vuelve a pintar la pantalla dentro de la misma respuesta, ENTONCES ese repintado DEBE
  leer la ficha de sesion de nuevo, como maximo UNA vez, sin reutilizar la lectura hecha durante la
  accion. [1, 6]

### Nunca entre peticiones

- **R5** — CUANDO la misma cookie de sesion llega en dos peticiones distintas, seguidas o
  simultaneas, el sistema DEBE leer la ficha de sesion en cada una de ellas. [6]
- **R6** — CUANDO se atienden a la vez peticiones de personas distintas, el sistema DEBE entregar a
  cada peticion la sesion que corresponde a su propia cookie. [6]
- **R7** — SI una lectura de sesion ocurre fuera de servir una pantalla y fuera de invocar una Server
  Action (un route handler, un script, un test sin peticion), ENTONCES el sistema DEBE leer la ficha
  de sesion en cada llamada, igual que antes de esta ficha. [6]
- **R8** — CUANDO la ficha de un usuario se da de baja mientras su sesion esta abierta, el sistema
  DEBE llevar a esa persona al login en su siguiente navegacion, con una sola redireccion. [6]

### Fallo cerrado y estructura de la resolucion

- **R9** — SI la lectura de la ficha de sesion falla durante una peticion, ENTONCES todas las
  lecturas de sesion de esa misma peticion DEBEN resolver «sin sesion», sin volver a intentar la
  consulta. [7]
- **R10** — SI la lectura de la ficha de sesion falla durante una peticion, ENTONCES el sistema DEBE
  dejar la causa en el registro del servidor UNA sola vez para esa peticion. [7, 9]
- **R11** — El sistema DEBE seguir ofreciendo `getSessionUser` y `getSessionContext` sin parametros
  y con su mismo tipo de resultado, y las dos DEBEN devolver `null` exactamente en los mismos casos.
  [8]
- **R12** — MIENTRAS una peticion tiene sesion valida, el sistema DEBE entregar las dos proyecciones
  de esa peticion desde la misma lectura: el identificador del usuario y el de su contexto coinciden,
  y el rol es el mismo en las dos. [8]
- **R13** — CUANDO una misma invocacion de Server Action emite la sesion y despues la lee (el inicio
  de sesion), el sistema DEBE devolver la sesion recien emitida. [6, 8]

### Prueba del conteo (sin tiempos)

- **R14** — MIENTRAS las peticiones se atienden sin fallos, el sistema DEBE atenderlas sin escribir
  ninguna linea en el registro por la resolucion de la sesion ni por la comprobacion del conteo.
  [2, 9]
- **R15** — El gate DEBE contener una comprobacion ejecutable que cuente las lecturas de la ficha de
  sesion por peticion en las tres pantallas de R2 y en cada Server Action que resuelve a la vez el
  usuario y la empresa de la sesion, y que falle cuando cualquiera de ellas supere UNA. [2, 5]
- **R16** — El sistema DEBE dejar escrito en disco, una sola vez, el numero de consultas de la ficha
  de sesion por peticion contado en la aplicacion real (`next build && next start`) contra la base
  local, antes y despues del cambio, para las tres pantallas de R2 y al menos un guardado, junto con
  el metodo para repetirlo. [5]

### Lo que no cambia

- **R20** — El sistema DEBE cumplir R1 a R14 sin ninguna dependencia de terceros que no figure ya en
  `package.json` y en `docs/dependencias.md`. [10]
- **R21** — El sistema DEBE conservar el comportamiento de sesion que cubren los E2E existentes de
  `e2e/session.spec.ts`, sin E2E nuevo. [11]
- **R22** — El sistema DEBE conservar lo que ve la persona en la zona privada: sin sesion, la
  redireccion al login con la marca de sesion cortada; con sesion y sin el permiso de la pantalla, el
  404 dentro del layout privado; y el menu filtrado por los permisos de la sesion. [12]

### Cobertura de las decisiones cerradas

| Decision (fila) | Requisitos |
|---|---|
| 1 — pantallas y Server Actions | R1, R2, R3, R4 |
| 2 — **SUSTITUIDA**; sobreviven el test del gate y el «sin logs» | R14, R15 |
| 3 — **SUSTITUIDA**, sin objeto (tiempos contra Supabase real) | ninguno: sin objeto |
| 4 — **SUSTITUIDA**, sin objeto (umbral de QC-28) | ninguno: sin objeto |
| 5 — revision en F1.4: sin tiempos; test del gate + comprobacion una vez en la app real | R15, R16 |
| 6 — solo lo que dura la peticion, nunca entre peticiones | R4, R5, R6, R7, R8, R13 |
| 7 — fallo cerrado, una lectura fallida vale para toda la peticion | R9, R10 |
| 8 — una instancia, dos proyecciones, sin cambio de firma | R11, R12, R13 |
| 9 — sin log por peticion | R10, R14 |
| 10 — sin dependencia nueva | R20 |
| 11 — sin E2E nuevo, los de sesion siguen verdes | R21 |
| 12 — `backend`/`medium`, no toca pantallas | R22 |

## Preguntas abiertas

1. ~~**Contra que Supabase se miden los tiempos, y con que credenciales.**~~ **CERRADA SIN OBJETO
   el 2026-09-15**: el humano quito los tiempos de la ficha (ver la ultima fila de «Decisiones
   cerradas»). Sin tiempos no hace falta ningun Supabase real; la comprobacion en ejecucion va
   contra la base local.
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
| 2026-09-15 · **SUSTITUIDA** | ¿Que forma tiene la medicion? | ~~Conteo en el gate + tiempos una vez.~~ **Sustituida por la ultima fila de esta tabla.** Lo que sobrevive: un test del gate cuenta las lecturas de sesion por peticion y **falla si pasan de una**, y **sin logs en produccion** |
| 2026-09-15 · **SUSTITUIDA** | ¿Donde se miden los tiempos? | ~~En local, contra un Supabase real.~~ **Sin objeto**: ya no se miden tiempos (ultima fila) |
| 2026-09-15 · **SUSTITUIDA** | ¿Con que umbral arranca QC-28? | ~~Ninguno fijado aqui; QC-104 entrega los numeros.~~ **Sin objeto**: QC-104 no entrega numeros de tiempo (ultima fila) |
| 2026-09-15 · **revision en F1.4** | ¿Hace falta medir tiempos? | **No.** Decision humana al revisar el spec: «la idea es solo evitar llamados innecesarios a la db». Se quitan los tiempos antes y despues, el Supabase real y el script de tiempos. **Se queda como prueba, no como medicion**: el test del gate que falla si hay mas de una lectura por peticion, y **una comprobacion una sola vez en la app real** (`next build && next start` contra la base local) que cuenta las consultas de sesion antes y despues, porque Vitest no puede probar `React.cache` de verdad (`design.md > 0`, H5). **Efecto en QC-28**: su condicion «no arranca hasta que QC-104 de un numero» queda sin camino; sigue en espera y se comento en su issue |
| 2026-09-15 | ¿Se toca «dar de baja surte efecto en el siguiente clic»? | **No.** Heredado de **QC-8** («el usuario se resuelve contra la base en cada peticion»). El resultado vive **solo lo que dura la peticion** y **nunca** se reutiliza entre peticiones: eso seria QC-28. La red ya existe: `e2e/session.spec.ts:352` |
| 2026-09-15 | ¿Y si la base falla al resolver? | **Se falla cerrado, como hoy.** Heredado de **QC-23, decision 13**. Una lectura fallida vale para **toda** la peticion: layout y pagina ya no pueden discrepar |
| 2026-09-15 | ¿Se conserva la estructura de la resolucion? | **Si.** Heredado de **QC-48 R19 y R21**: una sola instancia de `resolveSession` con sus dos proyecciones, `getSessionUser` y `getSessionContext`, que devuelven `null` en exactamente los mismos casos. Ninguna de las dos cambia de firma |
| 2026-09-15 | ¿Log por peticion para medir? | **No.** Heredado de **QC-71 y QC-57**: el log se escribe **solo cuando algo falla**. La medicion no deja ninguna linea por peticion |
| 2026-09-15 | ¿Dependencia nueva? | **Ninguna.** Next 16 documenta `React.cache` para compartir un resultado dentro de una peticion (`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md:264`). Si `design.md` concluye que no basta, lo dice; **no se instala nada** sin la regla 7 |
| 2026-09-15 | ¿Hace falta E2E? | **No hace falta uno nuevo, y se difiere aqui con motivo.** Heredado de **QC-71 y QC-54**: nadie entra ni sale de ninguna pantalla por esto. La red son **los E2E de sesion que ya existen**, que siguen en verde |
| 2026-09-15 | ¿Zona y complejidad? | **`backend` / `medium`, sin cambio.** No toca ninguna pantalla; crece el alcance, pero no el riesgo |
