# docs/verification.md — Cómo demostrar que funciona

"Compila" y "el agente dice que está listo" NO son verificación. Una feature está
verificada cuando hay evidencia ejecutable.

## El gate tiene DOS niveles — usa el que toca

```bash
./init.sh --rapido   # CERRAR UNA TANDA: typecheck + lint + tests relacionados + guardias (~1 min)
./init.sh            # CERRAR LA FEATURE y ANTES DE CADA PR: la suite entera
```

Comandos sueltos, por si necesitas uno concreto:

```bash
pnpm run typecheck        # TypeScript strict, cero errores
pnpm run lint             # ESLint, cero errores
pnpm test                 # la suite entera
pnpm run test:rapido      # lo que el grafo relaciona con tu diff vs origin/dev + las guardias
pnpm run test:guardias    # solo las guardias (van SIEMPRE, ver abajo)
pnpm exec vitest related --run <archivos>   # que tests cubren ESTOS archivos
```

### Por que dos niveles

Una suite madura son miles de tests y varios minutos. Correrla al cerrar **cada** tanda convierte
el arnes en una sala de espera: una feature de 9 tandas se lleva media hora de reloj **solo
esperando**, y el arnes existe para mejorar el trabajo, no para alargarlo. Cerrar la feature y
abrir el PR son otra cosa: ahi si se paga la suite entera.

Referencia medida el 2026-08-03 sobre un proyecto anterior que corria este mismo arnes
(QuimiCloude todavia no tiene suite propia; estas cifras son de donde salio la regla, no
una medicion de este repo):

| Que corres | Archivos | Tests | Tiempo |
| --- | --- | --- | --- |
| suite entera | 804 | 10.187 | ~235 s |
| relacionados con un servicio | 16 | 437 | 21 s |
| relacionados con un cambio en un util muy importado | 155 | 2.577 | 103 s |
| **`./init.sh --rapido` entero** (typecheck + lint + tests) | — | — | **~58 s** |

### Las guardias van SIEMPRE, y esta es la razon

`--rapido` selecciona por el **grafo de imports**. Las guardias **no importan lo que vigilan**:
recorren el arbol de archivos (censo de tablas, columnas sensibles, modulos puros, emisores de una
categoria). **Ningun grafo de imports las selecciona**, asi que serian justo lo que se pierde. Por
eso `test:rapido` las corre enteras siempre; cuestan ~8 s.

Se seleccionan por patron (`vitest run guard`), no por lista: una guardia nueva entra sola.

### Lo que `--rapido` NO cubre — no te engañes

- Acoplamientos que **no son imports**: SQL, nombres de archivo, lectura de `feature_list.json`.
- Un cambio en un archivo **sin tests que lo importen** selecciona cero tests y sale verde.
- Regresiones lejanas que solo aparecen con la suite entera.

Por eso **antes de abrir un PR se corre `./init.sh` completo, sin excepcion**. La leccion viene de
dos PRs de un proyecto anterior con este arnes y va justo en esa direccion: se mergeo mirando el
estado del PR —que es un build y **no corre tests**— y entro un guard rojo en `dev`.

**Detalle que importa al seleccionar en modo rapido:** el diff se calcula contra el **merge-base**
con `dev`, no contra el ultimo commit, o una tanda de tres commits solo mira el tercero:

```bash
pnpm exec vitest related --run $(git diff --name-only origin/dev...HEAD)   # tres puntos
```

> **Estado en QuimiCloude (2026-08-26):** ya hay suite y configuracion, asi que los dos modos
> **si** hacen cosas distintas. `vitest.config.mts` monta dos proyectos (`ui` en jsdom, `node`)
> repartidos por convencion de nombre, y `tests/` tiene 10 archivos, 3 de ellos guardias
> (`tests/guards/`). `--rapido` selecciona por grafo y corre las tres guardias; el completo corre
> los 10.
>
> Lo que **no** te cubre todavia: con una suite tan pequena, `--rapido` se queda en cero tests
> relacionados con mucha facilidad y sale verde con solo las guardias. Y la tabla de tiempos de
> arriba es de otro proyecto — aqui la diferencia de reloj entre los dos modos es hoy
> despreciable. El motivo para correr `./init.sh` completo antes del PR no es el tiempo, es la
> cobertura.

## Qué cuenta como evidencia
- Salida real de los tests pasando, pegada en `progress/impl_<feature>.md`.
- El mapa `R<n> → test`: para cada requisito, el test que lo cubre.
- Para features con UI o flujo crítico: un test E2E que ejercita el camino
  completo, no solo un unit test del helper.

## Qué NO cuenta
- "Debería funcionar."
- Un test que no asegura nada (sin asserts reales).
- Tests que el implementer escribió para pasar, sin cubrir el requisito.

## Datos (Supabase)
- **Verifica la autorizacion en el service**: un test que llame al metodo con un usuario
  sin permiso y confirme que lanza, sin llegar al repositorio. Ese es el test que cierra
  el requisito.
- Un test de RLS es **adicional**, y hay que saber leerlo: si lo escribes con Prisma
  saldra verde pase lo que pase, porque Prisma se conecta como dueño de la tabla y la
  policy no se le aplica (`docs/architecture.md > Acceso a datos y autorizacion`). Para
  que un test de RLS signifique algo tiene que ejercitar la via que RLS protege.
- Verifica migraciones aplicando y revirtiendo en un entorno de prueba: `down.sql` es
  convencion propia, nadie lo prueba por ti.

## Rojos heredados: la pregunta es «¿rompí algo YO?»

Cuando `dev` arrastra tests rojos que no son tuyos, la suite completa termina siempre en rojo y
el gate deja de responder lo único que importa al cerrar una feature. Comparar a mano contra un
número que viaja por el chat no escala: en una sola feature de un proyecto anterior hubo que
hacerlo **ocho veces** y una se concluyó mal.

Por eso el modo completo no exige que la suite esté verde, sino que **no aparezca ningún archivo
de test rojo que no estuviera ya en `tests/baseline-rojos.json`**.

- **La comparación es por archivo, no por conteo.** Una suite grande tira 2–5 flakes de
  saturación que cambian de sitio —se midieron 30, 31 y 32 rojos sobre el mismo código—, así
  que exigir conteos exactos daría falsas alarmas constantes, y un gate que grita en falso se
  ignora. **Qué son exactamente esos flakes y qué NO los cura: la subsección de abajo.**
- **Coste aceptado:** si un archivo ya listado gana un rojo nuevo de verdad, no lo ves. A cambio
  la pregunta que sí responde —«¿apareció un archivo que antes no fallaba?»— aguanta el ruido.
- **Cada entrada del baseline necesita `motivo` y `desde`**, y el comparador falla si faltan.
  Sin eso la lista se vuelve el sitio donde cualquiera mete lo que le estorba.
- **Un archivo del baseline que ya pasa** genera aviso, no rojo; toca borrarlo de la lista.
  Sólo se avisa si esa corrida lo ejecutó: calcular `baseline − rojos` parece natural y está
  **mal**, porque un archivo que no corrió no dice nada. Esa versión, con fixtures de dos
  archivos, pedía limpiar 6 de las 7 entradas —una falsa alarma en el primer uso—.

**Al sembrarlo:** mídelo en una rama que sea `dev` más archivos que no toquen producto, para
saber que la deuda es de `dev` y no tuya. Y síémbralo con pocas entradas: si nace con cincuenta,
nadie lo va a limpiar nunca.

> **Estado en QuimiCloude (2026-09-08):** el baseline tiene **dos** entradas. Eran cinco hasta
> QC-58, que retiró las tres que estaban ahí por los flakes de saturación —`inventario/product-page`,
> `proveedores-ui/catalog-line-sheet` y `proveedores-ui/supplier-page`— en el mismo cambio que
> arregló la causa (ver la sección siguiente). Las dos que quedan son por el
> mismo motivo estructural: `tests/unit/recetas-ui/recipe-route-contract.test.ts` y
> `tests/unit/recetas/module-contract.test.ts` contienen guardias que se apoyan en
> `git diff --name-only origin/dev...HEAD` y que, estando en `dev`, no tienen rango que mirar
> y fallan a propósito en vez de pasar sin comprobar nada. El coste está anotado en cada
> `motivo` y no es menor: al ser la comparación **por archivo**, esos dos archivos quedan
> ignorados también en las ramas de feature donde sus guardias sí morderían. Lo correcto es
> que el caso del diff se salte explícitamente cuando el rango no existe y que estas dos
> entradas desaparezcan.

### Los flakes de saturación: qué son, qué NO los cura, y cómo se curaron (2026-09-04, arreglado en QC-58 el 2026-09-08)

Los «2–5 flakes de saturación» de arriba tienen una firma concreta, y merece la pena reconocerla
antes de perder una tarde: **`Test timed out in <plazo>ms`, en un test de UI que escribe con
`userEvent`**. Hasta QC-58 ese plazo era `5000` —el default de Vitest— y ese número era
literalmente la firma; desde QC-58 son `15000`, así que si vuelves a verlo ahora es una señal
mucho más seria que entonces: 15 s de espera no se agotan por contención de CPU sin más. El campo controlado no llega a repintarse entre tecla y tecla cuando la máquina va
cargada, y la prueba escribe más rápido de lo que el campo se actualiza. El síntoma clásico es que
las letras salgan intercaladas —`xxxxxAxcxixdxox` donde debía salir `Acido citrico`—.

**Cómo distinguirlo de un rojo de verdad**, y es barato: corre el archivo **solo**. Si pasa en
aislado y falla en la suite, es saturación. Si falla también solo, es tuyo. La otra comprobación,
cuando sospechas de una rama, es correrlo en `dev` sin tu rama encima.

**Lo que NO lo cura: bajar los workers de vitest.** Es la primera idea que se le ocurre a
cualquiera y está medida, en esta máquina (12 núcleos, 25,5 GB de RAM, 3,4 GB libres) y sobre la
misma rama:

| `--maxWorkers` | Resultado | Duración |
| --- | --- | --- |
| por defecto (12) | 2 archivos rojos | 114 s |
| 4 | 1 archivo rojo | 335 s |
| 2 | 1 archivo rojo | 541 s |

Una corrida anterior con `--maxWorkers=2` salió verde y **eso fue suerte, no prueba**: se tomó por
buena y llevó a proponer un límite de workers como arreglo del gate. Repetida, volvió a fallar.
Queda escrito para que el siguiente no recorra el mismo callejón: el límite multiplica por cinco
el tiempo del gate y no elimina el fallo, porque la causa no es cuántos procesos hay sino que el
plazo de 5 s es demasiado corto para `userEvent` en una máquina cargada.

**El arreglo entró en QC-58 (2026-09-08), y fueron las dos cosas a la vez**, porque eran dos
causas y no una:

- **El plazo.** `testTimeout: 15_000` declarado **dentro del bloque `test` de cada uno de los tres
  proyectos** (`ui`, `node`, `integration`), nunca en la raíz de `vitest.config.mts`: es opción por
  proyecto y confiar en la herencia es una apuesta que sale verde si la pierdes. Y a los tres, no
  sólo a `ui`: el mismo día falló `composition/identity-facade`, del proyecto `node`, que **no
  teclea nada** y murió cargando el barril de `@/lib/composition`. La causa es contención de CPU y
  no distingue de proyecto. Lo único que cuesta es que un test colgado de verdad tarda 15 s en
  reportarse en vez de 5.
- **La forma de teclear.** Una sola definición compartida, `setupUser()` en
  `tests/helpers/user-event.ts`, con `delay: null`. Antes había 206 llamadas sueltas a
  `userEvent.setup()` repartidas por 33 archivos; lo que se compró no fue quitar código duplicado
  —es una línea— sino que exista **un** sitio donde está escrito cómo se teclea en este repo, en
  vez de que la llamada 207 volviera a nacer mal sin que nadie lo decidiera. `delay: null` quita
  sólo la espera artificial entre eventos: la secuencia que recibe el DOM es idéntica y **no se
  relaja ninguna** comprobación de `user-event`, incluida la de `pointer-events`.

Las dos mitades las vigila `tests/guards/guard-teclear-y-plazo.test.ts`, que vive en las guardias
a propósito: ningún grafo de imports seleccionaría ni la configuración ni un test que nadie
importa. La guardia lee la **configuración resuelta**, no el texto del archivo —un `testTimeout`
escrito en un comentario o en la raíz satisface a un regex y no cambia nada—, y se probó con
cuatro mutaciones del archivo real, no sólo con su caso verde.

Que el número esté escrito no prueba que rija: se comprobó además **en ejecución**, con una sonda
temporal por proyecto (un test de 7000 ms, por encima del plazo viejo y por debajo del nuevo). Los
tres pasaron con 15000 y los tres murieron con `Test timed out in 5000ms` al volver a bajarlo. Las
sondas **no se quedaron** en la batería: pagar ~21 s de reloj en cada corrida para siempre, a
cambio de algo que sólo puede cambiar si alguien toca la config —y eso ya lo vigila la guardia—,
es mal negocio. Cómo repetirlas está en `progress/impl_QC-58-timeout-tests-ui-bajo-carga.md`.

**Sus tres entradas del baseline se retiraron en ese mismo cambio**, que es lo que hace que el
arreglo cuente: si la causa se arregla y las entradas se quedan, el gate sigue ciego sobre esos
archivos y nadie se entera. Ahí estaba el coste mientras duró: **el baseline se estaba usando para
tapar un problema que no era suyo y crecía con cada feature**, que es exactamente lo que su propia
nota advierte que no debe pasar.

## Cuando lo que verificas es el gate mismo

Un check que no corre es peor que uno que no existe: crees que te cubre. Al tocar `init.sh`,
`scripts/` o una guardia no basta con que el gate salga verde — hay que comprobar que
**muerde**. Se rompe al revés que el código normal, y estas son las formas conocidas de
equivocarse.

### Probar que muerde, no que pasa

Para cada validación nueva, un fixture por desenlace: el caso correcto (`exit 0`) y **uno por
cada motivo de fallo** (`exit 1`, con el mensaje nombrando qué falla). Y después la prueba que
de verdad convence: **rompe el archivo real** —inyecta el dato inválido en `feature_list.json`,
renombra el script—, corre el gate completo, confirma que sale con 1 y restaura. Un check
probado solo con su caso verde no está probado.

Restaura desde una copia (`cp`), no con `git checkout`: el archivo puede tener cambios sin
commitear que no son tuyos.

### Trampas conocidas

Las tres pasaron de verdad, en la sesión del 2026-08-28 que sustituyó la validación de
`feature_list.json` basada en `jq`:

- **No pipees el gate a `head` o `tail` para leer el código de salida.** El estado de una
  tubería es el del último comando, así que verás `0` aunque el gate haya fallado. Redirige a
  un archivo y lee `$?`.
- **Un mensaje de fallo no debe prometer un detalle que no entrega.** `$(...)` captura solo
  stdout; si los errores del script van a stderr, un `fail "invalido: $SALIDA"` imprime
  `invalido:` y nada más. O capturas `2>&1`, o dejas que stderr salga por su cuenta y el
  mensaje no promete nada.
- **Tocar `init.sh` o `scripts/` hace que el modo rápido se niegue a cubrirte.** Es correcto:
  son cimientos, ahí se corre el completo.

### El anti-patrón: la validación opcional

Una validación colgada de `if command -v <herramienta>` o `if [ -f <script> ]` con un `warn` en
el `else` **no es una validación**: en la máquina que no tenga eso, se salta entera y el gate
sigue en verde. Pasó aquí con `jq` —dos bloques mudos el tiempo suficiente para que nadie
notara que sus dos `ok` no se imprimían nunca— y volvió a pasar con el propio script que vino a
reemplazarlo, esta vez colgado de su propia existencia. Si el check importa, lo que va en el
`else` es `fail`; si no importa, bórralo. Instalar la herramienta que falta no arregla nada:
mueve el problema a la siguiente máquina.

Corolario: **antes de escribir un check, mira si ya existe.** Dos validadores con nombres
parecidos e `init.sh` llamando a uno solo es la misma enfermedad con mejor disfraz.

Los avisos propios de `scripts/validate-features.mjs` —no ampliar la comprobación de specs a
las fichas `done`, no cambiar el máximo por zona sin mirar `CLAUDE.md` / `AGENTS.md`— viven
como comentarios en el script, que es donde se leen en el momento de romperlos.

## Regla del reviewer
Si un requisito no tiene test, o un test no verifica el requisito que dice cubrir,
es hallazgo bloqueante. La feature no pasa a `done`.
