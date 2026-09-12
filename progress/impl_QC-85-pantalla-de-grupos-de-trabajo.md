# QC-85 — pantalla-de-grupos-de-trabajo · bitacora de implementacion

> Estado: **en curso**. T1 se bloqueo —la condicion de parada que `design.md > 9` y `tasks.md > T1`
> declararon por escrito se disparo de verdad— y el humano la resolvio con la **salida B**. El
> detalle del bloqueo y de su resolucion esta en la seccion 1, que se conserva entera a proposito:
> es la evidencia con la que el `reviewer` tiene que juzgar el unico archivo de `components/ui/`
> que esta ficha edito a mano.

## 0. Preparacion del worktree (hecha, verde)

| Paso | Resultado |
| --- | --- |
| `.env` propio apuntando a **`QuimiCloude_QC85`** (misma credencial y host que el repo principal) | creado; `.env` no se versiona |
| `pnpm install --frozen-lockfile` | ok |
| `pnpm exec prisma migrate deploy` | `All migrations have been successfully applied.` |
| `pnpm exec prisma generate` | `Generated Prisma Client (v6.19.3)` |
| Baseline `pnpm exec vitest run tests/unit/configuracion-ui tests/unit/navegacion` | **47 archivos, 726 pasan, 8 saltados, 0 rojos** |

Recordatorio operativo para las siguientes tandas: **tras cada `git merge origin/dev`, repetir
`prisma migrate deploy` + `prisma generate`** (la omision costo dos corridas de gate en QC-86).

## 1. T1 — La primitiva de pestanas: la condicion de parada se ha cumplido

`design.md > 9` lo dejo escrito: *«si `pnpm dlx shadcn@latest add tabs` intentara instalar un
paquete que `package.json` no tiene, la tarea se detiene, no se instala nada y el implementer sube
la propuesta con sus cuatro checks al leader»*. Y `tasks.md > T1`: *«Si `package.json` cambia:
PARAR»*.

### Lo que se comprobo, no lo que se supuso

Se ejecuto **dos veces**, con las dos CLIs, y el resultado es el mismo:

1. `pnpm exec shadcn add tabs` (la CLI pineada del repo, `shadcn@4.16.2`)
2. `pnpm dlx shadcn@latest add tabs`

Las dos crean `components/ui/tabs.tsx` **y las dos modifican `package.json` y `pnpm-lock.yaml`**:

```
+    "cn": "^0.3.0",
```

Y el archivo generado importa el helper **del paquete nuevo**, no del repo:

```ts
import { cn } from "cn"
```

### Que es `cn@0.3.0`

No es un typosquat: es un paquete **oficial de shadcn-ui** (`github.com/shadcn-ui/cn`), MIT,
descrito como *«drop-in replacement for clsx + tailwind-merge»*. El estilo `base-nova` que declara
`components.json` emite ahora ese import en lugar del alias `aliases.utils`.

**Pero el repo ya resuelve exactamente eso.** `lib/utils.ts` es literalmente `twMerge(clsx(inputs))`
sobre `clsx@^2.1.1` y `tailwind-merge@^3.6.0`, las dos ya en `package.json`, y **las 23 primitivas
que hoy viven en `components/ui/` importan `cn` desde `@/lib/utils`** —`sheet.tsx`,
`alert-dialog.tsx`, `select.tsx`, todas—. O sea: la dependencia que la CLI quiere meter es
**redundante con lo que el repo ya tiene**, no una capacidad que falte.

### El choque, dicho sin adornos

R37 pide dos cosas que aqui **no pueden cumplirse a la vez**:

- «**ninguna dependencia de terceros nueva**» → prohibe quedarse con `cn@^0.3.0`;
- «**sin escribir ni editar a mano archivos de `components/ui/`**» → prohibe corregir la linea 5
  del archivo que la CLI acaba de generar.

No hay bandera de la CLI que lo evite (`aliases.utils` de `components.json` ya dice `@/lib/utils` y
la CLI la ignora en este estilo). No se elige por cuenta propia: lo decide el humano.

### RESOLUCION: salida B, decidida por el humano el 2026-09-12

**Ninguna dependencia entra.** Se conserva el `tabs.tsx` que genero la CLI y se corrige **solo su
linea de import**, dejandola con la forma y las comillas dobles que usan sus hermanas:

```ts
import { cn } from "@/lib/utils"
```

**Por que ese archivo se edito a mano, dicho sin rodeos.** El spec prefiere no tocar
`components/ui/` —R37 lo escribe—, pero la alternativa era **meter una dependencia redundante**, y
la **regla 7 de `CLAUDE.md` pesa mas que una preferencia de estilo**. El dato que lo sostiene es
verificable en disco y no es una impresion: **21 de las 23 primitivas que ya vivian en
`components/ui/` importan `cn` desde `@/lib/utils`**, y `lib/utils.ts` es literalmente
`twMerge(clsx(inputs))` sobre dos paquetes ya declarados. O sea: la edicion a mano **acerca** el
archivo a la convencion del repo en vez de apartarlo de ella, y lo que se rechazo fue una segunda
definicion de `cn` conviviendo con la primera.

`package.json` y `pnpm-lock.yaml` **quedaron intactos**: `git diff` no los incluye y `cn` no
aparece en ninguno de los dos.

### La guardia que impide la reincidencia

`tests/guards/guard-primitivas-ui-usan-el-cn-del-repo.test.ts` (**nueva**). Afirma que ninguna
primitiva de `components/ui/` importa `cn` de algo que no sea `@/lib/utils`, con ancla de
no-vacuidad (el barrido tiene que encontrar al menos 20 primitivas y al menos 20 que importen `cn`)
y con un caso que comprueba que **el detector muerde** el import exacto que la CLI escribio
—`import { cn } from "cn"`— sin morder al correcto ni a `cva` ni a un comentario.

**No duplica a `guard-dependencias-aprobadas.test.ts`**, y esta dicho en su cabecera: aquella
vigila el MANIFIESTO (que toda dependencia de `package.json` tenga fila en `docs/dependencias.md`);
esta vigila el IMPORT, que es donde la CLI escribe primero. Un `import { cn } from "cn"` con la
dependencia ya aprobada pasaria la otra y cae aqui. No habia en el repo nada equivalente: ninguna
guardia miraba la procedencia de los imports dentro de `components/ui/`.

Verde: `pnpm exec vitest run tests/guards/guard-primitivas-ui-usan-el-cn-del-repo.test.ts` →
**1 archivo, 3 tests, 0 rojos**.

### T1, cerrado

- `components/ui/tabs.tsx` existe (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`,
  `tabsListVariants`, sobre `@base-ui/react/tabs`).
- `git diff package.json pnpm-lock.yaml` **vacio**.
- `pnpm typecheck` **verde** y `pnpm lint` **verde**.
- Nota operativa: el `typecheck` de un worktree recien montado falla con
  `app/layout.tsx: Cannot find name 'LayoutProps'` hasta que se generan los tipos de ruta. Se
  arregla con **`pnpm exec next typegen`** (rapido, no hace falta un `next build`). No es un fallo
  de la ficha.

### Estado del arbol cuando se escribio el bloqueo

**Limpio.** `package.json` y `pnpm-lock.yaml` revertidos, `node_modules` reinstalado desde el lock
original (`cn 0.3.0` desinstalado), `components/ui/tabs.tsx` borrado. `git status --short` solo
muestra la carpeta `specs/QC-85-.../` sin seguimiento. **No se ha instalado nada.**

La salida cruda de la CLI se guardo fuera del repo, en el scratchpad de la sesion
(`tabs.cli-output.tsx`), por si la opcion B se aprueba y hay que volver a ella sin repetir la
descarga.

### Las tres salidas, con su precio

| | Salida | Precio |
| --- | --- | --- |
| **A** | Aprobar `cn@^0.3.0` como dependencia: fila en `docs/dependencias.md` + los cuatro checks + visto bueno humano | Rompe la decision cerrada 13 («ninguna libreria nueva») y mete un tercer paquete que hace lo que `clsx` + `tailwind-merge` ya hacen. Ademas dejaria el repo con **dos** definiciones de `cn` |
| **B** | Quedarse con el archivo de la CLI y **corregir su linea 5** a `@/lib/utils`, como las otras 23 primitivas | Un edit a mano en `components/ui/`, que la letra de R37 prohibe. **Cero dependencias nuevas**, y el resultado es exactamente el que el repo ya tiene en las otras 23. Es la opcion que esta bitacora recomienda |
| **C** | **Alternativa E** de `design.md > 11`: escribir el conmutador a mano con `role="tablist"`, sin primitiva | La propia `design.md > 11 (E)` la reserva para «si § 9 detecta que la primitiva arrastra un paquete nuevo» —que es justo lo que paso—. Precio: implementar el patron ARIA de pestanas (roving tabindex, flechas, `aria-controls`) que la primitiva trae probado |

### Los cuatro checks sobre `cn@0.3.0` (por si se elige A)

| Check | Resultado |
| --- | --- |
| 1. No marcada `deprecated` en npm | **Desconocido**: el gate corre sin red y no se consulto el registro |
| 2. Release en los ultimos 12 meses | **Desconocido** por lo mismo |
| 3. >= 10.000 descargas semanales | **Desconocido** por lo mismo |
| 4. Licencia MIT / Apache-2.0 / BSD / ISC | **MIT**, leida de `node_modules/cn/package.json` mientras estuvo instalado. Es el unico de los cuatro que es un hecho verificable en disco |

Tres de los cuatro son **desconocidos**, y asi se dicen (`CLAUDE.md` regla 6). No se disfrazan de
«si».

## 2. Estado de las tasks

| Task | Estado |
| --- | --- |
| T1 — la primitiva de pestanas | **hecha** (salida B; ver seccion 1) |
| T2 a T15 | en curso |

El mapa `R<n> -> test` real se consolida al cerrar las tandas; el previsto sigue en
`tasks.md > Trazabilidad`.

## 3. Hallazgo colateral, para cuando se desbloquee

`tests/unit/configuracion-ui/usuarios-convenciones.test.ts` declara
`const COMPONENTES_ESPERADOS = 13;` y afirma `COMPONENTES.length === COMPONENTES_ESPERADOS`. Las
catorce piezas nuevas de esta ficha lo pondran rojo. Es un test heredado de **lista CERRADA cuyo
punto de extension por diseno es darse de alta en el**, asi que R39 manda **tensarlo** —subir el
numero a 27 y anadir las siete Server Actions de grupos a `ACCIONES_POR_RUTA` con su ruta exacta—,
nunca relajar la asercion. Queda anotado aqui para que no se descubra a mitad de T12.

Los centinelas que miden la rama contra git (`data-table-intacta-usuarios.test.ts`, el bloque R37
de `usuarios-convenciones.test.ts`) usan `merge-base` **y** una precondicion conjuntiva
«page.tsx de usuarios + `specs/QC-67-pantalla-de-usuarios/`», asi que en esta rama quedaran
`skipped`, no verdes por vacuidad: es su diseno. Esta ficha traera su propio `grupos/alcance.test.ts`
con la senal de QC-85.

## 4. Centinelas ajenos que T1 destapo, y como se retensaron

`components/ui/tabs.tsx` —el unico archivo que la CLI anadio, autorizado por R37— puso en rojo
**tres centinelas de alcance que pertenecen a OTRAS fichas** y que miraban el diff contra `dev`
**sin comprobar de quien es la rama que estaban midiendo**:

| Archivo | Ficha dueña | Caso que fallaba |
| --- | --- | --- |
| `tests/unit/configuracion-ui/configuracion-convenciones.test.ts` | QC-45 | «no toca `package.json` ni `components/ui/`» |
| `tests/unit/configuracion-ui/data-table-intacta.test.ts` | QC-45 | «ningun archivo tocado vive en `components/shared/data-table/` ni en `components/ui/`» |
| `tests/unit/configuracion-ui/data-table-intacta-unidades.test.ts` | QC-39 | «QC-39 modifico archivos intocables» |

Los tres fallaban con la **misma** lista de violaciones, y esa lista contenia **exactamente un
archivo**: `components/ui/tabs.tsx`.

**No se relajo nada.** Las listas `INTOCABLES` no se tocaron y `tabs.tsx` **no** entro en ninguna
lista de excepciones —eso habria dejado ciega a la ficha dueña en su propia rama—. Lo que se les
anadio es el **sujeto que les faltaba**: la precondicion de rama CONJUNTIVA (archivo central de la
ficha **mas** su carpeta de spec), copiando **la forma que ya estaba escrita** en
`data-table-intacta-usuarios.test.ts` —que vivio este mismo fallo el 2026-09-11 desde la rama de
QC-84 y cuya cabecera pide expresamente que se copie «sin inventar una segunda»—.

Esto **ENDURECE**: antes esos tres median cualquier rama con reglas ajenas, lo que produce rojos
falsos como este y —peor— **verdes falsos** cuando una rama ajena resulta estar limpia. Ahora, en la
rama de su ficha comprueban lo mismo o mas, y fuera de ella quedan **`skipped` con el motivo
escrito**, nunca verdes.

De propina, la no-vacuidad de los dos de QC-45 se separo del `not.toThrow()` del rango y se acoto a
la carpeta de SU pantalla: en la rama de QC-45 es **mas** estricta que el `length > 0` global de
antes.

### Un arreglo de rango que hubo que hacer para que la precondicion discriminara

`data-table-intacta-unidades.test.ts` seguia con un **SHA congelado** (`516e9c0`). Medido antes de
tocarlo: `git diff 516e9c0 -- .` devuelve en esta rama **565 archivos ajenos**, entre ellos
`app/(private)/configuracion/unidades/page.tsx` **y** `specs/QC-39-pantalla-de-unidades/`. O sea:
con el SHA congelado la precondicion habria dado positivo en **cualquier** rama y no habria
discriminado nada. Se paso a **merge-base con `dev`**, identico a sus hermanos ya curados.

| | antes | despues |
| --- | --- | --- |
| total | 31 | 33 |
| passed | 28 | 26 |
| failed | **3** | **0** |
| skipped | 0 | **7**, cada uno con su motivo |

### Un centinela con SHA congelado que esta ficha NO toca, y por que

**CORRECCION del `reviewer` (2026-09-12).** Aqui se escribio que **dos** archivos arrastraban el
mismo agujero. Era **falso para uno de los dos**, y se deja dicho en vez de reescribirlo en
silencio:

- `tests/unit/unidades/modulo-intacto.test.ts` — **NO tiene el agujero.** Ya mide contra
  `git merge-base origin/dev HEAD`, calculado en cada ejecucion. El `516e9c0` que aparece en su
  cabecera esta dentro del parrafo «POR QUE MERGE-BASE Y NO UN COMMIT FIJADO A MANO», que **cuenta
  la historia de cuando lo tuvo** y por que se quito. Lo que fallo aqui fue el metodo: se busco el
  literal `516e9c0` con `grep` y se dio por culpable a quien solo lo **citaba**. La abstencion de
  no tocarlo sigue siendo correcta; **el motivo escrito estaba mal**.
- `tests/unit/configuracion-ui/unidades-convenciones.test.ts` — **este SI lo tiene**, verificado
  leyendo su codigo y no su prosa: `const RAMA_BASE = '516e9c0'` se usa de verdad en
  `git diff --name-only RAMA_BASE -- package.json` y en `git show RAMA_BASE:package.json`
  (lineas 648-670). Su alcance es **estrecho** —solo vigila el manifiesto—, asi que hoy no produce
  el falso positivo ancho que si producia `data-table-intacta-unidades`. Ademas su comentario ya
  **miente**: dice que esa base es «la misma que usan `data-table-intacta-unidades.test.ts` y
  `tests/unit/unidades/modulo-intacto.test.ts`», y **los dos se pasaron ya a merge-base**.

Sigue sin tocarse: esta verde, es de QC-39 y arreglarlo seria un cambio ancho y no pedido. Se anota
para que el leader decida si abre ficha.

## 5. Verificacion acumulada

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | limpio |
| `pnpm lint` | limpio |
| `pnpm test:guardias` | 30 archivos, 316 pasan, 4 saltados, **0 rojos** |
| `pnpm exec vitest run tests/unit/configuracion-ui tests/unit/navegacion` | 50 archivos, 754 pasan, 15 saltados, **0 rojos** |

Baseline antes de la ficha: 47 archivos, 726 pasan, 8 saltados.

## 6. Tanda 1 (T3–T7): la lista de grupos

**Nuevos** en `app/(private)/configuracion/usuarios/components/`: `work-group-list-params.ts`,
`work-group-columns.tsx`, `work-group-list-{empty,error,skeleton}.tsx`,
`work-group-list-section.tsx`, `work-group-table.tsx`.
**Nuevos** en `tests/unit/configuracion-ui/grupos/`: `work-group-list-params.test.ts`,
`work-group-columns.test.tsx`, `work-group-list-{empty,error,skeleton}.test.tsx`,
`work-group-list-section.test.tsx`, `work-group-table.test.tsx`, `work-group-a11y.test.tsx`.

`page.tsx` sustituye el hueco por la seccion real, con `<Suspense
key={buildWorkGroupListQuery(...)}>` y esqueleto. El corte por permiso sigue siendo **la primera y
unica** sentencia del cuerpo.

`usuarios-convenciones.test.ts` se **tenso** otra vez: `COMPONENTES_ESPERADOS` 16 → **23**, y las
**siete** Server Actions de grupos se dieron de alta en `ACCIONES_POR_RUTA` / `TODAS_LAS_ACCIONES`
por su **ruta exacta**. Igualdades exactas intactas; ninguna excepcion nombrada.

### La desviacion declarada, con su por que y su medida

Tres tests heredados de QC-67 —`user-list-section.test.tsx`, `usuarios-page.test.tsx` y
`usuarios-viewport.test.tsx`— **se tocaron**, y hay que decirlo en voz alta porque el encargo pedia
que la pestana de personas siguiera verde **sin tocar sus tests**.

**Por que no habia salida.** Desde que la pantalla sirve DOS pestanas, su barrel arrastra
`work-group-actions.ts`, cuyo cuerpo evalua `observabilidad.readRequestIdHeader` de
`@/lib/composition` **al importarse** —exactamente igual que `user-actions.ts`, que esos tests ya
doblaban—. El doble de composicion de esos archivos declara solo `identity`, asi que el modulo
reventaba al cargar con `No "observabilidad" export is defined`. Importar la action por su ruta
exacta es **obligatorio** (R36 y su guardia) y el barrel completo tambien (R38 y
`usuarios-convenciones`), y los tests no pueden entrar por ruta profunda (la guardia lo prohibe en
todo el repo). No queda ninguna combinacion que los deje literalmente intactos.

**Que se les hizo, medido.** `git diff --numstat` da **25 lineas anadidas y 0 borradas** en cada uno
de los tres. **Ni un `test(...)`, ni un selector, ni una asercion cambian.** Lo anadido es un
bloque de preambulo que dobla las siete actions de grupos **haciendolas LANZAR si se las llama**, que
es la misma tecnica que el archivo ya aplicaba a `user-actions` y `role-actions`.

**TENSA, no relaja**: convierte en comprobable algo que antes nadie afirmaba —que la pestana de
personas **no consulta ni escribe NADA de grupos** (R6)—. Si manana un descuido hiciera que la
pestana de personas llamara a una action de grupos, estos tres tests se ponen rojos.

**El reviewer decide.** Revertirlo es barato y localizado; si se prefiere otra salida, se cambia.

### Verificacion de la tanda 1

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | limpio |
| `pnpm lint` | limpio |
| `pnpm exec vitest related --run <10 fuentes>` | 24 archivos, 406 pasan, **0 rojos** |
| `pnpm exec vitest run tests/unit/configuracion-ui tests/unit/navegacion` | 58 archivos, **891 pasan**, 15 saltados, **0 rojos** |
| `pnpm exec vitest run tests/guards` | 25 archivos, 260 pasan |

Rutas prohibidas en `git status`: **cero cambios** en `lib/modules/**`, `db/**`,
`lib/composition/**`, `lib/shared/**`, `components/shared/data-table/**`, `package.json`,
`pnpm-lock.yaml` y `e2e/**`.

## 7. Tanda 2 (T8–T12): las escrituras

**Nuevos**: `work-group-form.tsx`, `work-group-members.tsx`, `work-group-sheet.tsx`,
`delete-work-group-dialog.tsx`, con sus cuatro tests en `tests/unit/configuracion-ui/grupos/`.

`work-group-table.tsx` sustituye sus dos huecos de andamio por las piezas reales; el estado, el
`closePanel` y la regla «una instancia de panel y una de dialogo por pagina» no se tocaron.
El barrel republica las **27** piezas. `usuarios-convenciones.test.ts` se tenso por tercera vez:
`COMPONENTES_ESPERADOS` 23 → **27**, igualdad exacta, sin excepciones.

**Los tres tests heredados de QC-67 NO se volvieron a tocar.**

Verificacion: `typecheck` y `lint` limpios; `vitest related` sobre los archivos de la tanda →
28 archivos / 453 tests / 0 rojos; `configuracion-ui` + `navegacion` → **62 archivos / 938 pasan /
15 saltados / 0 rojos**; `pnpm test:guardias` → 30 archivos / 316 pasan / 4 saltados.
`git diff --name-only HEAD` sobre las rutas prohibidas: **vacio**.

### Dos decisiones de lectura que NO se tomaron en silencio

**(a) R35 frente a `design.md > 5.3` en las operaciones de miembro.**

> **Dictamen del `reviewer` (2026-09-12): la lectura de abajo es la CORRECTA y el diseño no esta
> incumplido. Lo que esta mal es el TEXTO de R35, que se contradice con R30 y con R25: pide cerrar
> el panel en una operacion cuyo efecto observable es «volver a pedir la lista de miembros y pintar
> lo que devuelva». Enmendar ese texto es del humano, no del implementer, asi que `requirements.md`
> NO se toca aqui.**
 R35 al pie de la letra dice
«cerrar el panel o el dialogo abierto» tambien al meter o sacar a una persona; pero §5.3 manda «tras
cualquier exito se vuelve a pedir la lista de miembros **y se pinta lo que devuelva**», que sobre un
panel cerrado no querria decir nada. Lo implementado: **el panel sigue abierto** en alta y baja de
miembro, con aviso por el `<Toaster />` heredado y **recarga desde el servidor**; cerrar y refrescar
si ocurre en crear, renombrar y borrar. Esta razonado en el JSDoc de `work-group-members.tsx`.
**Queda a la vista del reviewer**: si se prefiere la lectura literal, son tres lineas.

**(b) La lista de grupos no se refresca tras un cambio de miembros.** Si tras crear, renombrar o
borrar. No tras meter o sacar a alguien, porque **la tabla no pinta ningun conteo** (R12; eso es
QC-100) y un `router.refresh()` ahi seria trabajo sin efecto observable. Tambien anotado en el
JSDoc.

### Las dos preguntas abiertas siguen ABIERTAS

Ninguna se cerro y el comportamiento por defecto de `design.md > 10` se mantiene:

1. **El actor no aparece entre los candidatos** —`listUsers` no lo devuelve (QC-66 dec. 12)— y **no
   se abrio ninguna via**: habria sido backend.
2. **El buscador no muestra el estado de cuenta.** Y ahora esta **medido**: el candidato de prueba
   trae `email` y `accountStatus`, y un caso comprueba que **ninguno de los dos llega al DOM**.

## 8. Tanda 3 — T13: el centinela de alcance y el mapa completo

**Nuevo**: `tests/unit/configuracion-ui/grupos/alcance.test.ts` (**32 casos**). Es la pieza que
cierra el mapa: R4, R5, R12 (diff), R16, R36, R37, R39 y R41.

- **Precondicion de rama COPIADA** de `data-table-intacta-usuarios.test.ts`, no inventada. Senal
  conjuntiva de QC-85: `.../components/work-group-table.tsx` **mas**
  `specs/QC-85-pantalla-de-grupos-de-trabajo/`. **No** se usa `page.tsx` de usuarios como archivo
  central: esa es la senal de QC-67 y confundiria las dos fichas. Hay 5 casos puros que prueban que
  la senal discrimina, incluido que **la rama de QC-67 —misma pantalla— NO cuenta como la de
  QC-85**.
- **Merge-base en cada ejecucion, nunca un SHA congelado.** Y como el archivo central de esta ficha
  esta **sin seguimiento**, el barrido une `git diff --name-only <merge-base>` con
  `git ls-files --others --exclude-standard`: mirando solo el diff, la precondicion no se cumpliria
  jamas y todo quedaria `skipped` —un falso verde silencioso—.
- **Anti-vacuidad en cada `toEqual([])`**: el detector de rutas reconoce las `page.tsx` privadas
  reales, el barrido del diff muerde en la carpeta de la pantalla, el detector de filtro encuentra
  el filtro real de la pestana de personas, el de copy encuentra las tres formas en una muestra, y
  las ocho operaciones se comprueban como importadas de verdad.

### La excepcion de R37, NOMBRADA y no relajada

`components/ui/tabs.tsx` es un **alta** del 2026-09-12 por `pnpm dlx shadcn@latest add tabs`,
autorizada por R37, cuya linea de `cn` se corrigio a `@/lib/utils` por decision del humano para no
meter `cn@0.3.0`. La asercion es **igualdad contra lista cerrada** —`archivosCambiados('components/ui')
=== []` **y** `archivosSinSeguimiento('components/ui') === ['components/ui/tabs.tsx']`—, **nunca una
desigualdad**, y remite a `guard-primitivas-ui-usan-el-cn-del-repo.test.ts` sin duplicar su
comprobacion del import.

### Una guardia heredada mas que hubo que TENSAR

`tests/guards/guard-identificador-de-request.test.ts` compara `e2e/*.spec.ts` contra la lista
**CERRADA** `E2E_ESPERADOS`, y el spec nuevo de T14 la ponia roja. Su propio comentario dice que la
lista es cerrada y que **su punto de extension por diseno es darse de alta en ella**; QC-67 hizo
exactamente esto en su T15 con `usuarios.spec.ts`, con el comentario todavia a la vista.

Se dio de alta `'grupos-de-trabajo.spec.ts'` **nombrandolo uno a uno**, en su sitio alfabetico y con
el motivo escrito: **el ancla no se relaja** y la decision de QC-71 R21 sigue intacta, porque este
E2E no prueba el identificador de peticion sino el recorrido de la pestana.

Tras el alta: `pnpm test:guardias` → **30 archivos, 316 pasan, 4 saltados, 0 rojos**.

### Verificacion de T13

| Comando | Resultado |
| --- | --- |
| `pnpm exec vitest run tests/unit/configuracion-ui/grupos` | 16 archivos, **249 pasan**, 0 rojos |
| `pnpm exec vitest run tests/unit/configuracion-ui tests/unit/navegacion` | 63 archivos, **970 pasan**, 15 saltados, 0 rojos |
| `pnpm test:guardias` | 30 archivos, 316 pasan, 4 saltados, 0 rojos |
| `pnpm typecheck` / `pnpm lint` | limpios |

**Ningun requisito quedo sin test.** El mapa completo de los 43, con los nombres REALES de cada
caso, esta en la seccion 9.

## 9. Tanda 3 — T14: el E2E

**Nuevo y unico**: `e2e/grupos-de-trabajo.spec.ts`. **Ningun spec existente se toco** (R43):
`git status e2e/` muestra solo el archivo nuevo.

Un solo `test`, el recorrido entero de R42, comprobando en cada paso lo que la pantalla presenta:

1. **Entrar** — sin `tab`: se sirve personas y `work-group-section` **no esta en el arbol** (una
   sola seccion montada, que es R1).
2. **Cambiar de pestana** — la URL pasa a ser **exactamente** `USERS_ROUTE?tab=grupos`: solo `tab`,
   sin parametros arrastrados (R7).
3. **Acotar la lista** — con `pageSize=25` y busqueda: esta el grupo testigo, no esta aun el nuevo.
4. **Crear** — panel `data-mode="create"` **sin bloque de miembros** (el grupo no existe todavia);
   tras enviar, panel cerrado, aviso por el `<Toaster />` del layout, URL intacta, y **se verifica
   en Postgres** (`companyId` del actor, `nameNormalized` del dominio, `deletedAt` nulo).
5. **Renombrar** — **la misma fila**, mismo `id`, con el nombre nuevo; el viejo ya no esta.
6. **Meter a una persona** — miembros vacios (el renombrado **no** los toco, R23); el buscador
   devuelve **un solo** candidato —**el actor esta excluido**, que es la pregunta abierta 1
   funcionando—; tras meterla, `data-total="1"` y la pertenencia en base.
7. **Sacarla** — cero filas, estado vacio y `workGroupMember.count === 0`; cerrar devuelve a la
   misma URL.
8. **Borrar** — el dialogo nombra el grupo; **antes de confirmar el grupo sigue vivo en base**;
   tras confirmar, la fila sale, **el grupo testigo sigue en la lista** —para no confundir
   «desaparecio la fila» con «se vacio la lista»— y `deletedAt` no nulo.

El fixture crea la persona con **`accountStatus: 'active'` explicito**, por `design.md > 10.2`: una
cuenta nace `pending` y entonces el alta daria exito y la persona **no apareceria**. Selectores solo
por `data-testid` / `data-*` / valores del fixture; **ningun assert sobre copy** (R41).

| Comando | Resultado |
| --- | --- |
| `pnpm exec playwright test e2e/grupos-de-trabajo.spec.ts` | **2 passed** (chromium + webkit) |
| idem con `--repeat-each=3`, 6 workers | **6 passed** |
| `pnpm exec playwright test e2e/usuarios.spec.ts` | verde en los dos proyectos (R43) |

## 10. El unico rojo abierto: la suite E2E del worktree, por estado de la base

`pnpm e2e` **no cierra en verde**: **49 pasan / 23 fallan**. El spec de esta ficha pasa en los dos
proyectos y `e2e/usuarios.spec.ts` tambien. Los 23 fallos se reprodujeron **sin el spec nuevo en la
corrida**, asi que no son de QC-85.

**La causa, medida en la propia base y no supuesta.** En `QuimiCloude_QC85`, recien migrada y
sembrada con `pnpm db:seed`, los permisos por rol son:

```
Administrador: asignaciones.consultar, asignaciones.modificar, dashboard.consultar,
               inventario.*, pedidos.*, proveedores.*, recetas.*, unidades.*, usuarios.*
Operador:      asignaciones.consultar, inventario.consultar
```

**`Operador` NO tiene `dashboard.consultar`.** Por tanto quien entra con ese rol aterriza en el
primer item de su menu —`/inventario`, QC-75 R11— y **cualquier spec cuyo helper `login()` espere
`DASHBOARD_ROUTE` con un fixture que no sea Administrador agota su `waitForURL`**. Ese es
exactamente el patron repetido en `recetas`, `proveedores`, `inventario`, `pedidos`,
`presentaciones` y `errores`.

Es una propiedad de **`scripts/seed.ts` y del catalogo de permisos**, no del codigo de esta ficha:
`db/**`, `scripts/**` y `lib/**` tienen el **diff vacio**. En el repo principal esos specs pasan
porque su base `QuimiCloude` arrastra estado acumulado que una base nueva no tiene.

**No se toco ninguno de esos specs** (R43) ni el seed (limite duro). **Decide el leader**: o se
completa el sembrado de `Operador`, o esos specs dejan de depender de estado acumulado. Cualquiera
de las dos es ficha propia.

## 11. Auditoria final del diff contra la lista de «archivos que NO se tocan»

`git status --porcelain` sobre **todas** las rutas prohibidas —`lib/modules`, `db`,
`lib/composition`, `lib/shared`, `components/shared`, `package.json`, `pnpm-lock.yaml`, `scripts`,
`prisma.config.ts` y los `user-*` de la ruta— sale **vacio**.

**Modificados (12):**

| Archivo | Por que |
| --- | --- |
| `app/(private)/configuracion/usuarios/page.tsx` | de los **dos** que el diseño autoriza (§2.2) |
| `.../components/index.ts` | el otro de los dos: el barrel |
| `tests/guards/guard-identificador-de-request.test.ts` | **alta** en lista cerrada, 7 lineas anadidas y **0 borradas** |
| `tests/unit/configuracion-ui/usuarios-convenciones.test.ts` | tensada 13 → 27 y alta de las 7 actions |
| `tests/unit/configuracion-ui/configuracion-convenciones.test.ts` | centinela ajeno, precondicion de rama |
| `tests/unit/configuracion-ui/data-table-intacta.test.ts` | idem |
| `tests/unit/configuracion-ui/data-table-intacta-unidades.test.ts` | idem + merge-base |
| `tests/unit/configuracion-ui/user-list-section.test.tsx` | **25 anadidas / 0 borradas** (§6) |
| `tests/unit/configuracion-ui/usuarios-page.test.tsx` | idem |
| `tests/unit/configuracion-ui/usuarios-viewport.test.tsx` | idem |

**Nuevos:** las **14** piezas de la ruta, `components/ui/tabs.tsx`,
`tests/guards/guard-primitivas-ui-usan-el-cn-del-repo.test.ts`,
`tests/unit/configuracion-ui/grupos/` (16 archivos) y `e2e/grupos-de-trabajo.spec.ts`.

### Un fallo real que cazo el centinela nuevo, y merece anotarse

Al dar de alta el spec en `E2E_ESPERADOS`, una reescritura del archivo con Python **convirtio todo
el archivo a CRLF**. `git --numstat` paso a decir **963 anadidas / 956 borradas** en vez de 7 / 0, y
el caso «cero lineas borradas» de `alcance.test.ts` se puso **rojo**. Se normalizo a LF y volvio a
7 / 0.

Sin ese caso, el alta habria entrado como un **rewrite completo de una guardia**, indistinguible en
el diff de haberla reescrito de verdad. **La anti-relajacion se gano el sueldo el mismo dia en que
se escribio.** Todos los archivos de la rama se comprobaron despues: **ninguno lleva CRLF**.

## 12. Verificacion final (lo que ES de esta ficha)

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | **limpio** |
| `pnpm lint` | **limpio** |
| `pnpm exec vitest run tests/unit/configuracion-ui tests/unit/navegacion tests/guards` | **88 archivos · 1231 pasan · 15 saltados · 0 rojos** |
| `pnpm test:guardias` | 30 archivos · 316 pasan · 4 saltados · **0 rojos** |
| `pnpm exec playwright test e2e/grupos-de-trabajo.spec.ts` | **2 passed** (chromium + webkit) |
| `pnpm e2e` (suite entera) | **49 / 23** — los 23 son ajenos y preexistentes (§10) |

Baseline de partida: 47 archivos · 726 pasan · 8 saltados.

**El gate largo (`./init.sh --rapido` y `./init.sh`) es del leader**, y no se corrio aqui.

## 13. Estado de las 15 tasks

**T1 a T14: cerradas.** **T15 queda a medias a proposito**: esta bitacora esta escrita y el diff
auditado, pero `./init.sh` completo **no lo corre el implementer**. El PR **no se abrio**, como se
pidio.

## 14. Mapa `R<n> -> test` - los 43, con nombres REALES de caso

Ruta corta: `grupos/` = `tests/unit/configuracion-ui/grupos/`. Lo que no lleva prefijo vive en `tests/unit/configuracion-ui/` o en `tests/guards/`. **Ningun requisito quedo sin test.**

| R | Test |
| --- | --- |
| R1 | `grupos/usuarios-tabs.test.ts` "USUARIOS_TABS son dos, distintas, y son personas y grupos" - "el parametro de la direccion es UNO y se nombra con TAB_PARAM" - `grupos/usuarios-tabs-switch.test.tsx` "es un tablist con exactamente dos tab, uno por constante" - `grupos/usuarios-page.test.tsx` "pinta la lista de grupos y NO la tabla de personas" |
| R2 | `grupos/usuarios-tabs.test.ts` "sin searchParams y sin el parametro, la pestana es la de personas" - "un valor que no es ninguno de los dos admitidos cae en personas y NO lanza" - `grupos/usuarios-page.test.tsx` "un tab desconocido tampoco rompe nada" |
| R3 | `grupos/usuarios-tabs-switch.test.tsx` "con el raton: de personas a grupos empuja usuariosTabHref(GROUPS_TAB)" - "con el teclado navega igual" - `grupos/usuarios-tabs.test.ts` "y el de grupos SI nombra la pestana: recargar o enlazar no vuelve a personas" |
| R4 | `grupos/alcance.test.ts` "ningun archivo de ruta nace bajo app/" - "el detector muerde: el mismo patron SI reconoce las paginas privadas que ya existen" - "lib/shared/routes.ts no cambia: ni USERS_ROUTE ni PRIVATE_ROUTE_PREFIXES" + `guard-rutas-privadas-cubiertas.test.ts` |
| R5 | `grupos/alcance.test.ts` "diff vacio en lib/shared/navigation/" - "el detector muerde: apuntado a la carpeta de la pantalla, NO sale vacio" - "ningun item del menu nombra la pestana de grupos" + `guard-nav-permisos-declarados` - `guard-nav-serializable` - `private-nav-usuarios.test.ts` |
| R6 | `grupos/usuarios-page.test.tsx` "monta la seccion de personas, su tabla y el conmutador, y nada de grupos" - "la lista se pide con los MISMOS parametros que el parser de siempre produce" |
| R7 | `grupos/usuarios-tabs.test.ts` "el href de grupos no arrastra pagina, tamano, orden, filtro ni busqueda" - `grupos/usuarios-page.test.tsx` "sin tab, la lista de GRUPOS no se consulta" |
| R8 | `grupos/usuarios-page.test.tsx` "llama a requirePagePermission una vez, con usuarios.consultar" - "y es la PRIMERA sentencia del cuerpo" - "no declara ningun codigo de permiso nuevo" - "sin usuarios.consultar responde 404 tambien con tab=grupos" |
| R9 | `grupos/work-group-table.test.tsx` "sin usuarios.modificar no se emite NINGUNA escritura en el arbol servido" - "tampoco hay ningun formulario ni boton suelto" - `grupos/work-group-columns.test.tsx` "sin canModify la celda queda VACIA" |
| R10 | `grupos/work-group-table.test.tsx` "su fuente no importa la composicion, ni Prisma, ni lee la sesion" - `grupos/work-group-list-section.test.tsx` "la seccion no lee la sesion" |
| R11 | `grupos/work-group-list-section.test.tsx` "con unauthorized se pinta el error y NI UN SOLO DATO de grupos" |
| R12 | `grupos/work-group-columns.test.tsx` "el objeto que la consulta devuelve no trae ninguna otra" - "la fila entera, renderizada, no contiene ni un solo digito" - `grupos/alcance.test.ts` "diff vacio en components/shared/data-table/" |
| R13 | `grupos/work-group-list-params.test.ts` "los dos tamanos son 10 y 25, y el de por defecto es el primero" - `grupos/work-group-table.test.tsx` "las opciones son exactamente dos" - "avanzar de pagina pide la lista de nuevo" |
| R14 | `grupos/work-group-table.test.tsx` "escribir un termino navega con ese termino en la URL" - "el termino NO filtra en cliente: las tres filas siguen pintadas" |
| R15 | `grupos/work-group-list-params.test.ts` "un campo que la lista blanca no declara es sin orden, no un error" - `grupos/work-group-table.test.tsx` "ordenar por la columna de acciones NO SE OFRECE" |
| R16 | `grupos/work-group-list-params.test.ts` "NO declara ningun campo filtrable" - `grupos/alcance.test.ts` "WORK_GROUP_QUERYABLE y WORK_GROUP_MEMBER_QUERYABLE no cambian" - "el detector muerde: SI encuentra el filtro de la pestana de personas" |
| R17 | `grupos/work-group-list-params.test.ts` "la entrada N se acota en vez de fallar" (20 entradas basura) - "una pagina invalida cae a la primera y un tamano invalido al de por defecto" |
| R18 | `grupos/work-group-list-empty.test.tsx` "con termino de busqueda se ofrece limpiarlo" - "con la pagina pedida mayor que el total se ofrece volver a la primera" |
| R19 | `grupos/work-group-list-skeleton.test.tsx` "tiene rol de estado, aria-busy y tantas filas como el tamano pedido" - `grupos/work-group-list-error.test.tsx` "NO pinta ninguna tabla: fallo no es no hay grupos" - "pulsarlo vuelve a pedir los datos" |
| R20 | `grupos/work-group-sheet.test.tsx` "lo que se monta es el primitivo del panel, anclado a un lado" - "abrirlo NO navega" - `grupos/work-group-table.test.tsx` "cerrar suelta el estado, y la lista de detras conserva sus parametros" |
| R21 | `grupos/work-group-form.test.tsx` "un nombre sin ninguna letra ni numero avisa MIENTRAS se escribe" - "y con ese nombre el boton NO invoca ninguna operacion" - **"el archivo NO escribe ninguna expresion propia de letra o numero"** |
| R22 | `grupos/work-group-form.test.tsx` "la FORMA la pone el esquema del modulo: vacio y tope de longitud" - "captura EXACTAMENTE un campo en el alta, y ninguna lista de miembros" |
| R23 | `grupos/work-group-form.test.tsx` "el alta invoca la creacion, con el nombre y nada mas" - "la edicion invoca el renombrado, con el identificador del grupo" - "y el renombrado NO altera los miembros" |
| R24 | `grupos/work-group-form.test.tsx` "el nombre duplicado se pinta EN LINEA, junto al campo" - "cualquier otro codigo va a la REGION de error" - "el rechazo del renombrado tampoco cierra el panel ni pierde lo escrito" |
| R25 | `grupos/work-group-members.test.tsx` "las filas se pintan en el ORDEN en que llegan" - "una respuesta tardia de OTRO grupo no pinta sus miembros" - `grupos/work-group-sheet.test.tsx` "y debajo del nombre, los miembros de ESE grupo" |
| R26 | `grupos/work-group-members.test.tsx` "indica pagina, total de paginas y total de personas" - "avanzar y retroceder vuelven a pedir la lista" - "en la primera no se retrocede, en la ultima no se avanza" |
| R27 | `grupos/work-group-members.test.tsx` "mientras la lista se obtiene se dice, y no se pinta ninguna fila" - "con error se dice por su codigo, y NO se pinta una lista vacia" |
| R28 | `grupos/work-group-members.test.tsx` "busca en el servidor sobre el conjunto entero, con rebote" - "elegir a una persona la mete DE A UNA, con los dos campos y ninguno mas" |
| R29 | `grupos/work-group-members.test.tsx` **"cada codigo produce una presentacion propia, y las cuatro son distintas"** - "el rechazo se queda DENTRO del panel y la lista no se toca" |
| R30 | `grupos/work-group-members.test.tsx` "meter a alguien vuelve a pedir la lista y pinta lo que devuelva" - "sacar a alguien tambien vuelve a pedir la lista" |
| R31 | `grupos/work-group-members.test.tsx` "de cada persona se pinta SOLO su nombre mostrable" - "su fuente no nombra ningun dato de credencial ni de estado de cuenta" |
| R32 | `grupos/work-group-members.test.tsx` "cada miembro tiene su accion de sacar" - "work_group_member_not_found se pinta por su codigo y NO retira la fila" |
| R33 | `grupos/delete-work-group-dialog.test.tsx` "el mensaje dice QUE grupo se va a borrar" - "abrir el dialogo NO invoca nada" - "confirmar SI la invoca" |
| R34 | `grupos/delete-work-group-dialog.test.tsx` "se pinta el error, el dialogo sigue abierto" - "un rechazo por autorizacion se distingue por su codigo" |
| R35 | `grupos/work-group-sheet.test.tsx` "el alta cierra el panel, avisa por toast y reejecuta la lista con la MISMA URL" - "ninguna pieza monta una segunda region de avisos" - `grupos/delete-work-group-dialog.test.tsx` "cierra el dialogo, avisa por toast" + `usuarios-convenciones.test.ts` "lo monta el layout privado, y nadie mas" |
| R36 | `grupos/alcance.test.ts` "diff vacio en lib/modules, db y lib/composition" - "cada operacion entra por su RUTA EXACTA" - "las ocho operaciones SE importan de verdad" - "ningun fetch a ruta propia" - "ni nace ningun route handler" + `usuarios-convenciones.test.ts` "ninguna de las CATORCE Server Actions se usa sin importarla por su ruta exacta" |
| R37 | `grupos/alcance.test.ts` "package.json y pnpm-lock.yaml no cambian" - "ninguna primitiva EXISTENTE de components/ui/ se modifica" - "el alta es EXACTAMENTE components/ui/tabs.tsx" + `guard-dependencias-aprobadas.test.ts` + `guard-primitivas-ui-usan-el-cn-del-repo.test.ts` |
| R38 | `usuarios-convenciones.test.ts` (tensada) "republica los VEINTISIETE componentes" - "no se deja fuera ningun nombre publico" - "page.tsx entra por el barrel" - "en la raiz de la ruta no hay mas que archivos del App Router" |
| R39 | `grupos/alcance.test.ts` "la unica guardia heredada que se modifica es la que esta ficha TENSA, nombrada" - **"y lo que esa guardia gana es un ALTA, no una asercion relajada: cero lineas borradas"** - "el unico alta en tests/guards/ es la guardia nueva de esta ficha" + `pnpm test:guardias` |
| R40 | `grupos/work-group-a11y.test.tsx`, 8 casos x 2 viewports: "NINGUN elemento usa 100vh" - "los controles tactiles miden al menos 44x44 px" - "el campo de busqueda tiene fuente de al menos 16 px" - "las acciones estan SIEMPRE en el DOM: nada depende de hover" - "el desbordamiento lo resuelve la TABLA" |
| R41 | `grupos/alcance.test.ts` "ninguno consulta por el TEXTO visible" - "el detector muerde: sobre una muestra con copy encuentra las TRES formas" - "cada literal afirmado como texto es un CODIGO ESTABLE del catalogo" + `configuracion-convenciones.test.ts` |
| R42 | `e2e/grupos-de-trabajo.spec.ts` - el recorrido completo, verde en chromium y webkit |
| R43 | `e2e/usuarios.spec.ts` y `e2e/permisos.spec.ts` sin cambios de guion; `git status e2e/` muestra **solo** el archivo nuevo; `grupos/alcance.test.ts` cubre el alta nombrada en E2E_ESPERADOS |



## 15. F2.3 — commits, merge con `origin/dev` y lo que destapo

El `reviewer` encontro lo que se nos paso a los dos: **nada estaba commiteado y la rama iba 31
commits por detras**. `HEAD` **era** la merge-base, asi que `git diff origin/dev...HEAD` salia vacio
y el `./init.sh --rapido` del leader imprimio «nada que relacionar»: **no corrio ni un solo test de
esta ficha**, solo las guardias. Aquel verde era vacio.

### Siete commits

| Commit | Que lleva |
| --- | --- |
| `docs(QC-85)` | el spec aprobado |
| `feat(QC-85)` | la primitiva de pestanas y la guardia del `cn`, con la edicion a mano razonada |
| `feat(QC-85)` | la pestana entera: 14 piezas, `page.tsx` y el barrel |
| `test(QC-85)` | los 16 unitarios, el centinela de alcance y el E2E |
| `test(QC-85)` | las listas cerradas tensadas y los tres tests heredados de QC-67 |
| `test(QC-39,QC-45)` | los tres centinelas ajenos curados |
| `docs(QC-85)` | bitacora y revision |

### El merge: 31 commits, un solo conflicto y no era ambiguo

Trae **QC-79** (alta sin contrasena y enlace: dos migraciones, `user-form.tsx` reescrito,
`lib/shared/routes.ts`, `resend` en `package.json`, `e2e/establecer-contrasena.spec.ts`,
`guard-envio-de-correo`) y **QC-49** (aislamiento por empresa en inventario: migracion,
`guard-ambito-empresa-inventario`, `e2e/aislamiento-inventario.spec.ts`).

**El unico conflicto**: `specs/QC-85-.../requirements.md`, add/add. `dev` traia el **esbozo** que
`/afinar-feature` sembro —45 lineas, «Pendiente: los escribe spec_author (F1.2)»—; esta rama trae el
spec **aprobado**, 345 lineas. Antes de resolver se comprobo que **las 13 decisiones cerradas del
humano coinciden palabra por palabra** en las dos versiones, asi que quedarse con la de esta rama no
pierde ninguna decision suya. No hizo falta preguntar.

`guard-identificador-de-request.test.ts` **automergeo limpio** y `E2E_ESPERADOS` conserva las **tres**
altas: `grupos-de-trabajo` (esta ficha), `establecer-contrasena` (QC-79) y `aislamiento-inventario`
(QC-49).

**Inmediatamente despues del merge**: `pnpm install --frozen-lockfile`, `prisma migrate deploy` —las
dos migraciones nuevas aplicadas— y `prisma generate`. Mas `next typegen`, que un worktree necesita
para que `tsc` vea `LayoutProps`.

### Cuatro rojos que solo podian aparecer con el trabajo commiteado

Ninguno era un fallo del producto; los cuatro eran centinelas midiendo mal. **Los cuatro se
TENSARON.**

**1 y 2 — `grupos/alcance.test.ts`, mio, y era FRAGIL.** Dos casos de R37 y dos de R39 partian la
pregunta en dos mitades: uno exigia `archivosCambiados === []` y el otro
`archivosSinSeguimiento === [el alta]`. **Se pusieron rojos el mismo dia en que el trabajo se
commiteo, sin que cambiara un byte**: `tabs.tsx` simplemente dejo de estar sin seguimiento y paso al
diff. Eso era fragilidad del METODO: R37 habla de QUE archivos toca la ficha, y eso no puede
depender de si ya se commitearon. Pasan a medir **lo APORTADO** —diff MAS sin seguimiento—, contra
la **misma lista cerrada**. No afloja y ademas **cierra el agujero simetrico**: antes, modificar una
primitiva existente y dejarla sin commitear se colaba por la rendija entre los dos casos. El caso de
las altas en `tests/guards/` pasa ademas a usar `--diff-filter=A`, para que «esto es un archivo
nuevo» sea un hecho de git y no una afirmacion del test.

**3 — `tests/unit/shared/data-table-alcance.test.ts` (QC-55).** Lista CERRADA de los E2E que pueden
referenciar la tabla compartida; el spec nuevo la hacia **ocho**. Se da de alta nombrandolo, con el
motivo —la lista de grupos ES la tabla compartida, consumida por su barrel sin abrir ni uno de sus
archivos—, siguiendo la forma de las cuatro ampliaciones anteriores. Un NOVENO spec vuelve a ponerla
roja.

**4 — `tests/unit/configuracion-ui/unidades-convenciones.test.ts` (QC-39): el SHA congelado, que
DEJO DE SER TEORICO.** En la seccion 4 se anoto como riesgo y se decidio no tocarlo porque estaba
verde. **El merge lo puso rojo**: QC-79 anadio `resend` a `package.json` en `dev`, y R45 empezo a
decir que «la feature de unidades toca el manifiesto» sin que QC-39 hubiera abierto un solo
intocable. Se cura igual que sus dos hermanas: **merge-base** en cada ejecucion y **precondicion de
rama conjuntiva** (`page.tsx` de unidades + `specs/QC-39-pantalla-de-unidades/`), copiando el idioma
de `data-table-intacta-unidades.test.ts` sin inventar una segunda forma. Fuera de la rama de QC-39
queda `skipped` con motivo, nunca verde.

Ya no queda **ningun** SHA congelado en uso en el repo.

### Verificacion tras el merge

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | **limpio** |
| `pnpm lint` | **limpio** |
| `pnpm exec vitest run tests/unit/configuracion-ui tests/unit/navegacion tests/guards tests/unit/shared` | **105 archivos · 1412 pasan · 17 saltados · 0 rojos** |
| `pnpm exec playwright test e2e/grupos-de-trabajo.spec.ts` | **2 passed** (chromium + webkit), 55.8s |

Y ahora el rango **existe**: `git diff origin/dev...HEAD` ya no esta vacio, asi que el
`./init.sh --rapido` del leader tiene de verdad que relacionar.
