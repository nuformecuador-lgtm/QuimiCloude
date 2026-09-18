# QC-114 — tabla-compartida-en-iphone-real · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** QC-56 (`done`) ·
> **Rama** `feature/QC-114-tabla-compartida-en-iphone-real` · **Épica** QC-16 Plataforma
>
> **Alcance.** Comprobar, **en un iPhone físico con Safari de iOS**, que la tabla compartida
> (`components/shared/data-table`) se comporta en las **nueve vistas** que la montan. En cada una se
> verifican los tres puntos que fijó QC-55: que la **columna fijada se queda quieta**, que el
> **scroll es de la tabla y no del `body`**, y que el **menú de cabecera se abre por toque**. Una
> sola pasada sobre todas, que es la condición por la que esta ficha esperó a QC-56. El resultado se
> escribe en `docs/verificacion-ios/QC-114.md` y viaja en el PR.
>
> **Esta ficha la ejecuta una persona.** Ningún agente puede hacerla: jsdom no tiene layout y el E2E
> en WebKit de **escritorio** no reproduce el `sticky` dentro de un scroll anidado con inercia
> táctil, que es el punto caliente declarado del componente (QC-55, decisión 17).
>
> **Lo que NO entra.** Arreglar lo que falle: cada hallazgo nace como **ficha nueva** en el board,
> bloqueada por esta. Auditar pantallas que no montan la tabla compartida. Android y Chrome Android
> (la regla multiplataforma cubre tres plataformas; esta ficha cierra **solo** iOS). Añadir tests
> automatizados nuevos: no hay código de producción en esta feature.
>
> Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Vocabulario.** **Verificador**: la persona que ejecuta la prueba con el iPhone físico —ningún
> agente puede ser el verificador—. **Pasada**: la ejecución completa del protocolo sobre las nueve
> vistas, de una vez. **Vista**: cada una de las nueve pantallas que montan la tabla compartida.
> **Punto**: cada uno de los tres comportamientos que fijó QC-55 (columna fijada quieta, scroll
> contenido en la tabla, menú de cabecera por toque). **Registro**: `docs/verificacion-ios/QC-114.md`.
> **Veredicto**: el valor que el verificador anota para un punto en una vista, que sólo puede ser
> **verde** (se observó lo exigido), **rojo** (se observó algo distinto) o **no concluyente** (no se
> pudo ejercer el punto).
>
> Estos requisitos describen **comportamiento observable por una persona** y **condiciones de la
> prueba**. No hay código de producción que escribir en esta ficha, así que la trazabilidad
> `R<n> -> test` se satisface contra la fila del registro, no contra un archivo de Vitest: el mapa
> vive en `design.md > 6`. `[D<n>]` cita la fila n-ésima de la tabla de decisiones, contando desde
> arriba.

### Alcance de la pasada: qué se abre y cuántas veces

**R1.** La pasada DEBE cubrir **exactamente nueve vistas**, ni una más ni una menos: `/pedidos`,
`/inventario`, `/proveedores`, `/configuracion/presentaciones`, `/configuracion/unidades`,
`/configuracion/usuarios` (pestaña **personas**), `/configuracion/usuarios?tab=grupos` (pestaña
**grupos**), `/produccion/formulas` y `/asignacion`. La lista DEBE corresponder a las ocho rutas que
autoriza `tests/unit/shared/data-table-alcance.test.ts` más la segunda pestaña de usuarios, y NO
DEBE tomarse de la `description` de la ficha. `[D3]`

**R2.** La pasada DEBE ejecutarse **una sola vez, en esta ficha**, cubriendo las nueve vistas en la
misma sesión y sobre el mismo despliegue. El sistema NO DEBE exigir una comprobación en iPhone por
cada ficha que monte la tabla compartida, ni repartir las nueve vistas entre varias pasadas. `[D2]`

**R3.** La pasada NO DEBE incluir ninguna pantalla que no monte `components/shared/data-table`, ni
ningún navegador o sistema operativo distinto de Safari de iOS: Android y Chrome Android quedan
**fuera** y sin comprobar (ver `## Preguntas abiertas`, 1).

### Condiciones bajo las que vale la observación

**R4.** La pasada DEBE ejecutarse contra **el preview de Vercel del PR de esta rama**, sobre HTTPS y
con el bundle de producción. Una observación hecha contra `next dev`, contra `localhost`, contra un
túnel de desarrollo o contra cualquier otro despliegue NO DEBE anotarse como veredicto. `[D4]`

**R5.** La pasada DEBE ejecutarse en un **iPhone físico** con **iOS 16 o superior** y el navegador
**Safari de iOS**. Una observación hecha en el simulador de Xcode, en el modo responsive de Safari
de escritorio, en un emulador de navegador o en un iPhone con iOS anterior a 16 NO DEBE anotarse
como veredicto. `[D5]`

**R6.** MIENTRAS una vista no desborde **a la vez en horizontal y en vertical** en la pantalla del
iPhone, el verificador NO DEBE anotar veredicto verde en ella: antes de la pasada DEBEN sembrarse
datos (`pnpm db:seed` y filas añadidas a mano si hace falta) hasta que las dos direcciones
desborden. SI tras sembrar una vista sigue cabiendo entera en la pantalla, ENTONCES sus tres puntos
DEBEN anotarse como **no concluyentes** con el motivo escrito, y NO DEBEN contarse como verdes.
`[D6]`

**R7.** Para poder ejercer la columna fijada, cada vista DEBE tener **al menos una columna fijada**
antes de observar: SI ninguna columna viene fijada por defecto, ENTONCES el verificador DEBE fijar
una desde el menú de su cabecera. SI la vista no ofrece ninguna columna fijable, ENTONCES ese punto
DEBE anotarse como **no concluyente** con el motivo escrito. `[D1]`

### Los tres puntos, en cada vista

**R8.** MIENTRAS haya una columna fijada y el verificador desplace la tabla en horizontal con el
dedo, la columna fijada DEBE permanecer quieta contra su borde —durante el arrastre **y** durante la
inercia posterior a soltar—, sin desplazarse, sin separarse de su borde, sin parpadear y sin dejar
ver por debajo las celdas que pasan. `[D1]`

**R9.** CUANDO el verificador arrastre el dedo dentro de la tabla, lo que DEBE desplazarse es el
**contenedor de la tabla**: la cabecera de la página, la navegación y el resto del documento NO
DEBEN moverse, el `body` NO DEBE desplazarse en horizontal y el documento NO DEBE hacer el rebote
elástico de iOS por un arrastre que empieza dentro de la tabla. Esto DEBE cumplirse en las dos
direcciones, horizontal y vertical. `[D1]`

**R10.** CUANDO el verificador toque el disparador del menú de una cabecera de columna, el menú DEBE
abrirse con **un solo toque**, sus opciones DEBEN poder activarse por toque y el menú DEBE poder
cerrarse tocando fuera. Ninguna de esas acciones DEBE requerir `:hover`, doble toque, pulsación
larga ni un teclado. `[D1]`

**R11.** Los tres puntos —R8, R9 y R10— DEBEN observarse en **cada una de las nueve vistas** de R1 y
anotarse por separado: un veredicto por punto y por vista, veintisiete en total. Un punto observado
en una vista NO DEBE darse por observado en las demás. `[D2] [D3]`

### El registro de evidencia

**R12.** La pasada DEBE quedar escrita en **`docs/verificacion-ios/QC-114.md`**, con **nueve filas**
—una por vista de R1, en ese orden—, y cada fila DEBE llevar: la vista y su ruta, el veredicto de
cada uno de los tres puntos, y el **modelo de iPhone** y la **versión de iOS** con que se observó.
El documento DEBE llevar además la fecha de la pasada y la URL del preview usada. Ese archivo DEBE
viajar en el PR de esta rama. `[D4] [D5] [D7]`

**R13.** MIENTRAS todos los veredictos de una fila sean verdes, esa fila NO DEBE exigir captura ni
vídeo. SI un veredicto es **rojo**, ENTONCES su fila DEBE enlazar una captura o un vídeo de lo
observado; un veredicto rojo sin imagen NO DEBE darse por registrado y la ficha NO DEBE cerrarse con
él. `[D8]`

**R14.** El registro DEBE decir de forma explícita que esta pasada cierra **sólo iOS** y que Android
y Chrome Android quedan **sin comprobar** —desconocido, no un sí (regla 6 de `CLAUDE.md`)—.

**R15.** El registro DEBE contener el mapa `R<n> -> fila/columna del propio registro` que exige la
regla 4 de `CLAUDE.md`, de modo que el reviewer pueda comprobar cada requisito contra una casilla
concreta sin buscarla. `[D7]`

### Qué se hace con lo que falle

**R16.** SI un punto sale **rojo** en cualquier vista, ENTONCES DEBE nacer una **ficha nueva en el
board**, bloqueada por QC-114, y su clave DEBE quedar escrita en la fila correspondiente del
registro. El arreglo NO DEBE entrar en el PR de esta ficha. `[D9]`

**R17.** QC-114 DEBE poder cerrarse como **«probado, con hallazgos»**: la existencia de veredictos
rojos, siempre que cumplan R13 y R16, NO DEBE impedir el cierre de la ficha. `[D9]`

**R18.** El diff del PR de esta ficha NO DEBE contener código de producción, tests automatizados
nuevos ni dependencias nuevas: DEBE limitarse a `docs/verificacion-ios/QC-114.md`,
`specs/QC-114-tabla-compartida-en-iphone-real/**` y `progress/**`. En particular NO DEBE tocar
`components/shared/data-table/**` ni ninguna de las nueve pantallas de R1. `[D9]`

### Cobertura de las decisiones cerradas

| Decisión cerrada | Requisitos que la cubren |
| --- | --- |
| D1 · El `sticky` anidado es el punto caliente (QC-55, decisión 17) | R7, R8, R9, R10 |
| D2 · Una sola pasada, aquí (QC-56 D3) | R2, R11 |
| D3 · Las nueve vistas las manda la guardia, no la `description` | R1, R11 |
| D4 · Se prueba contra el preview de Vercel del PR | R4, R12 |
| D5 · iOS 16 o superior | R5, R12 |
| D6 · Se siembran datos hasta que desborde en ambas direcciones | R6 |
| D7 · La evidencia vive en `docs/verificacion-ios/QC-114.md` | R12, R15 |
| D8 · Capturas sólo en los rojos | R13 |
| D9 · El arreglo no entra aquí: ficha nueva por hallazgo | R16, R17, R18 |
| Alcance · Sólo iOS; nada fuera de la tabla compartida | R3, R14 |

## Preguntas abiertas

1. **Android y Chrome Android.** `docs/architecture.md > Regla: multiplataforma` rige sobre tres
   plataformas y esta ficha cierra una. Queda sin decidir si la otra mitad merece ficha propia o si
   el soporte Android se declara sin comprobar — que sería un desconocido, no un sí (regla 6).
2. **La matriz de soporte completa del producto.** Esta ficha fija un mínimo de iOS porque lo
   necesitaba para tener contra qué probar, no porque el negocio haya decidido a quién soporta.
3. **Con qué cuenta se entra al preview.** *(La añade `spec_author`; no reabre ninguna decisión
   cerrada, es un dato que no está en `docs/`, `specs/` ni el código — regla 6.)* La navegación
   privada filtra por permiso (`lib/shared/navigation/private-nav.ts`: `asignaciones.consultar`,
   `usuarios.consultar`, …), así que **no consta que exista una sola cuenta que vea las nueve
   vistas** de R1. Si no la hay, la pasada necesita dos sesiones —una por rol— y R2 («una sola
   pasada») se lee como *una sola pasada de la ficha*, no como *un solo inicio de sesión*. Hace
   falta que el humano diga **qué cuenta o cuentas del preview usa el verificador**. **Bloqueante
   para T5**: sin credenciales no se puede abrir ninguna vista.
4. **Cómo se siembran datos en el preview.** *(Misma procedencia que la 3.)* D6 manda sembrar con
   `pnpm db:seed` «y filas a mano si hace falta», pero el preview de Vercel (D4) apunta a una base
   de datos de la que este repo no documenta ni el acceso ni si `db:seed` puede correrse contra
   ella. Falta decidir **quién siembra y contra qué base** antes de la pasada. **Bloqueante para
   T3**.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-04 | ¿El `sticky` anidado es el punto caliente? | **Sí, y no se levanta. Heredado de QC-55 (decisión 17).** jsdom no puede probarlo; `product-table.tsx` evitó el `sticky` horizontal justo por esto |
| 2026-09-15 | ¿Una pasada por ficha o una sola? | **Una sola, aquí. Heredado de QC-56 (D3).** Por eso esta ficha va después de QC-56 y no antes |
| 2026-09-18 | ¿Qué vistas entran? | **Las ocho rutas que autoriza la guardia** (`tests/unit/shared/data-table-alcance.test.ts`): pedidos, inventario, proveedores, presentaciones, unidades, usuarios, recetas y **asignación** — más la **segunda pestaña de usuarios** (personas y grupos), que son dos vistas en una ruta. Total **nueve vistas**. La guardia manda sobre la `description`, que se escribió antes de que asignación existiera y nombraba un «catálogo de proveedor» que no es ruta propia |
| 2026-09-18 | ¿Contra qué entorno se prueba? | **El preview de Vercel del PR de esta rama.** HTTPS real y bundle de producción, que es donde el CSS va minificado y el `sticky` se comporta como en producción |
| 2026-09-18 | ¿Qué versión de iOS cuenta? | **iOS 16 o superior.** No había ninguna declarada en `docs/`; se fija aquí y **se escribe en `docs/architecture.md > Regla: multiplataforma` por `/afinar-regla`**, no desde esta ficha |
| 2026-09-18 | ¿Y si una vista no tiene datos suficientes? | **Se siembran antes de la pasada** (`pnpm db:seed` y filas a mano si hace falta) hasta que la tabla desborde en horizontal **y** en vertical. Una tabla que cabe en la pantalla no ejerce el `sticky` ni el scroll anidado: daría un falso verde |
| 2026-09-18 | ¿Dónde vive la evidencia? | **`docs/verificacion-ios/QC-114.md`**, en el PR. Una fila por vista con el veredicto de los tres puntos, más modelo de iPhone y versión de iOS. Formato heredado de la T13 de QC-55 («dispositivo, versión y qué se vio»), en doc de producto en vez de en `progress/` |
| 2026-09-18 | ¿Capturas? | **No en los verdes.** Si algo falla, captura o vídeo: es lo que el agente que arregle el componente necesita ver, y un rojo sin imagen es irreproducible |
| 2026-09-18 | ¿El arreglo entra en este PR? | **No. Ficha nueva por hallazgo**, bloqueada por esta; QC-114 cierra como «probado, con hallazgos». Mantiene `complexity: medium`: el alcance de un arreglo en el componente que montan las nueve vistas no se puede estimar antes de ver el resultado |
