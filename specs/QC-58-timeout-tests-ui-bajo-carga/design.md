# QC-58 — timeout-tests-ui-bajo-carga · design.md

> Decisiones técnicas para los requisitos de `requirements.md`. Esta ficha **no toca producto**:
> no hay modelo de datos, ni migraciones, ni RLS, ni rutas, ni contratos de entrada/salida que
> diseñar (R17). Lo que se diseña aquí es configuración de pruebas, un helper compartido, una
> guardia y dos archivos de rastro escrito.

## 0. Lo que NO hay en este diseño, y por qué

| Apartado habitual | Aquí | Motivo |
| --- | --- | --- |
| Modelo de datos, migración, `down.sql` | **nada** | No se toca `db/schema.prisma` ni la base (R17). |
| RLS y autorización | **nada** | No hay superficie nueva que autorizar. |
| Rutas / endpoints | **nada** | No se añade ni se modifica ninguna ruta de `app/`. |
| Contratos I/O | **nada** | El único «contrato» nuevo es la firma del helper de §2. |
| Integraciones externas | **nada** | — |
| Dependencias nuevas | **ninguna** | Ver §7. |
| E2E | **diferido** | R18: la ficha no cambia comportamiento de la aplicación. |

## 1. El plazo: `testTimeout: 15_000` en los tres proyectos (R1, R4)

`vitest.config.mts` monta hoy tres proyectos inline (`ui` jsdom, `node`, `integration` con
`fileParallelism: false`) y **ninguno declara `testTimeout`**: los tres corren con el default de
5000 ms, que es literalmente el número del error medido.

Se añade `testTimeout: 15_000` **dentro del bloque `test` de cada uno de los tres proyectos**, con
un comentario corto que remita a `docs/verification.md > Los flakes de saturación` para que el
siguiente que lo vea entienda que no es un número al azar.

**Por qué en los tres y no en la raíz.** La raíz de esta config ya lleva un comentario explicando
que `passWithNoTests` vive ahí porque `ProjectConfig` no lo admite; el caso de `testTimeout` es el
inverso y más peligroso: es una opción **por proyecto**, y un proyecto define su propia
configuración de ejecución. Escribirlo una sola vez arriba y **suponer** que los tres lo heredan
es exactamente la clase de arreglo que sale verde sin hacer nada — por eso R3 exige comprobarlo en
ejecución en cada proyecto, y R2 exige una guardia que lo mire proyecto a proyecto.

**Lo que este cambio cuesta, y es todo lo que cuesta:** un test colgado de verdad tarda 15 s en
reportarse en vez de 5. No cambia si un test pasa o falla, sólo cuánto se espera para saberlo. No
se toca `maxWorkers` ni `fileParallelism` (R4): está medido que bajar los procesos multiplica por
cinco el tiempo del gate y **no** elimina el fallo.

## 2. La forma de teclear: un helper compartido (R5, R6, R8, R9)

### Ubicación y firma

Archivo nuevo: **`tests/helpers/user-event.ts`** (kebab-case, `docs/conventions.md > Nombres`).

```ts
export function setupUser(): UserEvent   // userEvent.setup({ delay: null })
```

- **Sin parámetros, a propósito.** Si el helper acepta opciones, vuelven las 224 variantes con
  otra cara y deja de haber «un sitio donde está escrito cómo se teclea en este repo». El único
  test que necesita otra cosa es el del rebote, y se resuelve como excepción nombrada (§2.3), no
  como parámetro abierto.
- **No es un archivo de test** (`.ts` sin `.test.`), así que ningún proyecto lo recoge como suite:
  `node` incluye `tests/**/*.test.ts`, `ui` incluye `tests/**/*.test.tsx` y `tests/ui/**/*.test.ts`.
  No hace falta tocar los `include`.
- El comentario que hoy vive suelto en `tests/unit/recetas-ui/recipe-form.test.tsx:191-200`
  —qué hace `delay: null`, que la secuencia de eventos que recibe el DOM es idéntica y que
  **no se relaja ninguna comprobación de `user-event`**, incluida la de `pointer-events`— se
  **muda** al helper. Es el precedente que la decisión n.º 3 manda promover, y su valor está en
  el razonamiento, no en la línea de código.

### 2.2 La migración de los 33 archivos

Cambio mecánico, una línea por archivo: se importa `setupUser` desde `tests/helpers/user-event`
y se sustituyen las llamadas a `userEvent.setup()` por `setupUser()`. Donde el archivo defina hoy
su propio `setupUser` local (`recipe-form.test.tsx`), se borra la definición local y su comentario
—que ya vive en el helper— y se deja sólo el import. Donde el import de `@testing-library/user-event`
quede sin uso, se retira (lo pilla el lint).

Reparto por carpeta, que es como se paraleliza en `tasks.md`:

| Carpeta | Archivos con `userEvent.setup()` |
| --- | --- |
| `tests/unit/` (raíz) | 8 — uno de ellos es la excepción de §2.3 |
| `tests/ui/` | 1 |
| `tests/unit/shared/` | 5 |
| `tests/unit/pedidos-ui/` | 8 |
| `tests/unit/proveedores-ui/` | 5 |
| `tests/unit/recetas-ui/` | 5 |
| `tests/unit/inventario/` | 1 |

**Criterio de que la migración está completa** (R6): cero llamadas a `userEvent.setup(` en todo
`tests/` fuera del helper y de la excepción declarada. Es un conteo que la guardia de §3 hace
sola, así que no depende de que nadie vuelva a contar a mano.

**Que no cambie nada más** (R9): el conteo de casos por archivo antes y después se compara con la
salida de la propia batería, y queda en la bitácora. Ningún `skip`, ningún `todo`, ninguna
aserción tocada.

### 2.3 La excepción declarada

`tests/unit/async-autocomplete.test.tsx:248` mantiene su `userEvent.setup({ delay: 20 })`: los
20 ms entre teclas son el **sujeto** de la prueba —escribir más rápido que una persona contra un
rebote de 250 ms y afirmar que llegó al servidor la palabra completa y no un prefijo—. Se queda
tal cual, con su comentario, y además entra por nombre en la lista de excepciones de la guardia,
de modo que quitarlo requiera borrarlo de dos sitios. No se reescribe con relojes falsos: eso es
trabajo de diagnóstico que esta ficha no tiene.

## 3. La guardia: `tests/guards/guard-teclear-y-plazo.test.ts` (R2, R7)

Una sola guardia nueva, con dos `describe`, siguiendo el patrón de `tests/guards/guard-editor-aislado.test.ts`
(helpers de lectura, recorrido de árbol, rutas normalizadas con `/` para que Windows y Linux den
lo mismo, lista de excepciones **por nombre** y nunca por patrón amplio).

Vive en `tests/guards/` a propósito: `pnpm run test:guardias` selecciona por patrón `guard` y
entra siempre en `./init.sh --rapido`. Nada de esto lo seleccionaría el grafo de imports, que es
justo el agujero que `docs/verification.md > Las guardias van SIEMPRE` describe.

### 3.1 El plazo

**Importa `vitest.config.mts` y lee la configuración**, en vez de buscar el número con una
expresión regular sobre el texto:

```ts
const config = (await import('@/vitest.config.mts')).default
for (const proyecto of config.test.projects) { /* nombre + testTimeout */ }
```

Comprueba, y falla nombrando el proyecto:

1. Que **cada** proyecto declarado tenga `test.testTimeout >= 15_000`. Recorre los proyectos que
   haya, no una lista fija de tres: así un proyecto nuevo entra solo en la guardia sin que nadie
   se acuerde de añadirlo (mismo criterio que el reparto por convención de nombre de la config).
2. Que los tres nombres conocidos (`ui`, `node`, `integration`) **sigan existiendo**: si alguien
   renombra o borra un proyecto, el punto 1 se quedaría satisfecho recorriendo menos cosas, y una
   guardia que se ablanda sola no es una guardia.

Leer la config en vez del texto evita el falso verde clásico: un `testTimeout` escrito dentro de
un comentario, o en la raíz creyendo que se hereda, satisface a un regex y no cambia nada.

### 3.2 La forma de teclear

Recorre `tests/**` y busca el literal `userEvent.setup(`. Permitidos exactamente:

- `tests/helpers/user-event.ts` — la definición compartida.
- `tests/unit/async-autocomplete.test.tsx` — la excepción de §2.3.
- `tests/guards/guard-teclear-y-plazo.test.ts` — la propia guardia, que escribe el literal para
  poder compararlo (misma excepción autoconsciente que ya tiene `guard-editor-aislado`).

Cualquier otro archivo con esa llamada **falla, nombrándolo**, con un mensaje que diga qué hacer:
importar `setupUser` de `tests/helpers/user-event`.

### 3.3 Probar que muerde, no que pasa

`docs/verification.md > Cuando lo que verificas es el gate mismo` es explícito y aquí aplica
entero. Para cada una de las dos mitades, se rompe **el archivo real**, se corre la guardia, se
confirma que sale con **1** y con el mensaje que nombra lo que falla, y se restaura **desde una
copia (`cp`), nunca con `git checkout`** —el worktree tiene cambios sin commitear que no son de
esta ficha—:

| Mutación | Qué se espera |
| --- | --- |
| Quitar `testTimeout` del proyecto `node` | rojo nombrando `node` |
| Bajar `testTimeout` de `ui` a 5000 | rojo nombrando `ui` |
| Renombrar el proyecto `integration` | rojo por proyecto conocido que falta |
| Meter un `userEvent.setup()` en un test cualquiera ya migrado | rojo nombrando ese archivo |

Las cuatro salidas se pegan en la bitácora. Una guardia probada sólo con su caso verde no está
probada, y esa lección ya costó una sesión entera en este repo.

## 4. La sonda de ejecución (R3)

La guardia de §3.1 demuestra que el número **está declarado**. No demuestra que **rige**. Para eso,
una vez y a mano: un archivo temporal por proyecto con un test que espera ~7000 ms y pasa.

- Con el plazo viejo (5000 ms) ese test **falla**; con el nuevo, pasa. Es la comprobación exacta
  de que la opción se aplica en ese proyecto y no se quedó en la raíz.
- Se ejecutan los tres (uno `.test.tsx` para `ui`, uno `.test.ts` para `node`, uno bajo
  `tests/integration/` para `integration`), se pega la salida en la bitácora y **se borran**.
- **No se quedan en la batería**: pagar ~21 s de reloj en cada corrida del gate para siempre, a
  cambio de una comprobación que sólo puede cambiar de resultado si alguien toca la config —y eso
  ya lo vigila la guardia de §3.1— es un mal negocio. Queda escrito en la bitácora cómo repetirlas.

## 5. El baseline (R10, R11, R12)

`tests/baseline-rojos.json` queda con **dos** entradas.

**Se retiran** las tres de esta causa, que es lo que hace que el arreglo cuente: si el arreglo
entra y las entradas se quedan, el gate sigue ciego sobre esos tres archivos y nadie se entera.

- `tests/unit/inventario/product-page.test.tsx`
- `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`
- `tests/unit/proveedores-ui/supplier-page.test.tsx`

**Se quedan** las dos estructurales, con `motivo` y `desde` intactos salvo la corrección:

- `tests/unit/recetas/module-contract.test.ts` — sin cambios.
- `tests/unit/recetas-ui/recipe-route-contract.test.ts` — **su `motivo` hoy miente**. Dice que
  falla porque, estando en `dev`, `git diff --name-only origin/dev...HEAD` está vacío y el caso se
  declara rojo a propósito. La causa real por la que está roja es **la migración de QC-35, que sí
  aparece en el diff**. El texto nuevo describe eso, conserva la nota de coste aceptado —listar el
  archivo apaga el archivo **entero** para el comparador, también en las ramas donde su guardia
  sí mordería— y conserva la salida pendiente (que el caso del diff se auto-salte cuando el rango
  no existe, y entonces borrar la entrada). El `desde` **no se toca**: la deuda es la misma, lo
  que estaba mal era la explicación.

No se toca `scripts/comparar-baseline-rojos.mjs`: la comparación por archivo, la exigencia de
`motivo`/`desde` y el aviso de «por limpiar» ya son como R12 los quiere.

## 6. El rastro escrito (R16)

`docs/verification.md`, dos sitios:

1. **`> Los flakes de saturación: qué son, y qué NO los cura`.** El párrafo final dice hoy que el
   arreglo «tiene ficha propia» y que hasta que entre esos archivos viven en el baseline. Pasa a
   decir que entró en **QC-58** (con fecha), en qué consistió —plazo de 15 s en los tres proyectos
   y una sola forma de teclear sin retardo—, y que sus tres entradas del baseline se retiraron en
   ese mismo cambio. **La tabla de `--maxWorkers` se conserva entera**: su valor no era diagnóstico,
   era impedir que el siguiente recorra el mismo callejón, y ese valor no caduca.
2. **El bloque `> Estado en QuimiCloude (2026-09-04)` de «Rojos heredados»**, que dice «el baseline
   tiene **cinco** entradas». Pasa a decir dos, con la fecha nueva, manteniendo la explicación del
   motivo estructural de esas dos y de por qué lo correcto sería que desaparecieran.

`CHECKPOINTS.md` no cambia: el mapa `R<n> → test` que exige lo produce la bitácora del implementer,
no un archivo nuevo.

## 7. Dependencias de terceros

**Ninguna** (`docs/architecture.md > Dependencias de terceros`). Todo lo que hace falta ya está
instalado y aprobado: `vitest`, `@testing-library/user-event`, `@vitejs/plugin-react`. El helper
son cinco líneas sobre una API que ya se usa en 33 archivos, y la guardia usa `node:fs` y
`node:path` como las 17 guardias que ya existen. No hay nada que someter a los cuatro checks de
salud y no hay fila nueva en `docs/dependencias.md`.

## 8. Alternativas descartadas

**a) Bajar los procesos de trabajo de Vitest (`--maxWorkers`).** Es la primera idea que se le
ocurre a cualquiera y aquí está **medida y descartada** (`docs/verification.md`): con 4 workers,
1 archivo rojo en 335 s; con 2, 1 rojo en 541 s; por defecto, 2 rojos en 114 s. Multiplica por
cinco el tiempo del gate y **no** elimina el fallo, porque la causa no es cuántos procesos hay
sino que 5 s es poco para `userEvent` en una máquina cargada. Una corrida verde con 2 workers fue
suerte y llevó a proponerlo como arreglo; repetida, volvió a fallar. R4 lo prohíbe explícitamente
para que no vuelva de tapadillo.

**b) Subir el plazo sólo en el proyecto `ui`.** Era la lectura obvia —«es un flake de `userEvent`,
luego es cosa de la UI»— y está desmentida por medición: el mismo día falló
`composition/identity-facade`, del proyecto `node`, que **no teclea nada** y murió en
`await import('@/lib/composition')` cargando el barril que arrastra los cinco módulos y el cliente
de Prisma. La causa es contención de CPU y no distingue de proyecto.

**c) Escribir `testTimeout` una vez en la raíz de `vitest.config.mts` y confiar en la herencia.**
Más corto de leer y de mantener, pero es una apuesta sobre cómo Vitest resuelve la configuración
de los `projects`, y una apuesta que **sale verde si pierdes**: el gate no distingue «el plazo se
aplicó» de «el plazo se ignoró y ningún test tardó tanto hoy». Se descarta a favor de escribirlo
tres veces y comprobarlo dos (guardia estática §3.1 + sonda de ejecución §4).

**d) Exponer la sesión de `userEvent` como global desde `tests/setup.ts`.** Ahorraría el import en
los 33 archivos. Se descarta por tres motivos: `setupFiles` está montado **sólo** en el proyecto
`ui`, así que no cubriría nada fuera de él; un global implícito no se tipa bien ni se navega desde
el editor; y una sesión creada una vez y compartida entre tests arrastra estado entre casos, que
es peor enfermedad que la que se cura. Además el import explícito **es** parte del valor: hace
visible en cada archivo que hay una forma canónica de teclear.

**e) Un parámetro de opciones en el helper (`setupUser(opciones?)`).** Cubriría el caso del rebote
sin excepción. Descartado: reabre la puerta a 224 variantes con otro nombre y disuelve lo único
que esta ficha compra de verdad, que es que haya **un** sitio donde está escrito cómo se teclea.
Una excepción nombrada y visible en la guardia envejece mejor que un parámetro que cualquiera usa
sin pensar.

**f) Reescribir `async-autocomplete.test.tsx` con relojes falsos** para que no necesite retardo.
Sería más rápido y más determinista, pero es trabajo de diagnóstico sobre el rebote —y sobre cómo
interactúan los timers falsos con `user-event`— que esta ficha no tiene presupuestado. Su alcance
es el plazo y la forma de teclear, no rediseñar pruebas de comportamiento asíncrono.

**g) Dejar el conteo de cinco corridas en «varias veces», como decía la ficha original.** Sin
número el reviewer no puede verificar nada y el criterio se vuelve una opinión. Cinco es lo que
fijó el humano y lo que R13 exige.
