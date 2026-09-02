# QC-30 — rediseno-login · bitacora de implementacion

> Fase 2 (F2.1–F2.4) de `AGENTS.md`. Escrita por el `implementer`. **No es una aprobacion**:
> el veredicto lo da el `reviewer`. Rama `feature/QC-30-rediseno-login`, worktree
> `.worktrees/QC-30-rediseno-login/`.
>
> Contrato: `specs/QC-30-rediseno-login/requirements.md` (26 requisitos EARS), `design.md` y
> `design-input-login.md` (los valores exactos). Las 14 decisiones cerradas no se reabrieron.

## Estado de las tasks

Las once tasks de `tasks.md` estan cerradas y marcadas `[x]`.

| Task | Que entro |
| --- | --- |
| T1 | Bloque delimitado de QC-30 al final de `app/globals.css`, con el comentario de por que va fuera de `@layer`, y los `:root` / `.dark` con las variables `--qc30-login-*` |
| T2 | Medidas acotadas a `[data-login='screen']`: 44 px de alto en campo y boton; 400 px / 18 px / 28 px en la tarjeta |
| T3 | Vidrio esmerilado como mejora progresiva dentro de `@supports`, con base opaca `var(--card)` y vuelta a opaco con `prefers-reduced-transparency` |
| T4 | Capa de burbujas, las tres burbujas por indice, `@keyframes` unico y `prefers-reduced-motion` con `display: none` |
| T5 | `login-background.tsx`: Server Component decorativo, reexportado por el barrel de la ruta |
| T6 | El `<main>` gana `data-login="screen"` y monta la capa como hermana de la `Card` |
| T7 | Nivel 1: contrato de texto del CSS |
| T8 | Nivel 2: contrato del marcado y no-regresion de `components/ui/` |
| T9 | Nivel 3: `e2e/login-skin.spec.ts` en Chromium y WebKit |
| T10 | Revision visual de los cuatro escenarios (ver abajo). **Cero retoques**: no hizo falta tocar el bloque |
| T11 | Esta bitacora + el gate completo |

## Archivos creados y modificados

Coinciden **exactamente** con la tabla de `design.md > 1`; no se abrio ningun archivo de mas.

**Creados**

- `app/(public)/login/components/login-background.tsx` — capa decorativa. Server Component sin
  `'use client'`: un `<div data-login="bubbles" aria-hidden="true">` con tres `<span>` vacios,
  sin `tabindex`, sin props y **sin valores en `style`** (una propiedad personalizada escrita en
  `style` ganaria a la media query movil y R22 no podria cumplirse).
- `tests/unit/login-skin.test.tsx` — niveles 1 y 2 de `design.md > 8`, en dos `describe`.
- `e2e/login-skin.spec.ts` — nivel 3. Sin fixtures de base de datos: navega a `/login` sin
  sesion y mide.

**Modificados**

- `app/globals.css` — **+273 lineas, 0 eliminadas**, todas en un bloque contiguo al final.
- `app/(public)/login/page.tsx` — `data-login="screen"` en el `<main>`, `<LoginBackground />`
  como hermano de la `Card` y antes que ella, y JSDoc ampliado. Sigue siendo Server Component.
- `app/(public)/login/components/index.ts` — un reexport.
- `specs/QC-30-rediseno-login/tasks.md` — las once casillas marcadas.

**Sin tocar, y es parte del encargo**: `components/ui/` (R19), `login-form.tsx` y
`submit-button.tsx` (R2–R4, R8, decision 4), `app/(public)/layout.tsx`, la Server Action,
`login-form-state.ts`, `e2e/login.spec.ts` (R26) y `tests/unit/login-form.test.tsx`.

## R25 — ninguna dependencia nueva

`git diff origin/dev...HEAD -- package.json pnpm-lock.yaml docs/dependencias.md` sale **vacio**.
No habia nada que aprobar: la ficha es CSS y composicion de componentes que ya existen
(regla 7 de `CLAUDE.md`, decision 14). La guardia
`tests/guards/guard-dependencias-aprobadas.test.ts` sigue verde.

## R24 — la convivencia con `feature/fix-ajuste-sidebar`

Esa rama **aterrizo en `dev` durante esta implementacion** y su cambio de `app/globals.css`
(+40 lineas: el elemento activo de la barra lateral, con su barra de acento y el submenu)
entro en el merge de F2.3 **sin un solo conflicto**. El acuerdo se cumplio por las dos partes:

- El bloque de QC-30 es contiguo y va **al final del archivo**, despues de `@layer base`; el de
  la barra lateral crece **antes** de `@layer base`. Los selectores son disjuntos: los de esta
  ficha cuelgan del atributo `data-login` y los de la otra, de los `data-slot` de la barra.
- `git diff origin/dev...HEAD -- app/globals.css` no muestra **ni una linea eliminada**: 273
  inserciones y nada mas. Nadie reordeno ni reindento nada de nadie.
- El test de nivel 1 afirma que las reglas del panel flotante siguen textualmente presentes,
  pero **de forma tolerante a que esa rama anada reglas nuevas**: comprueba presencia, nunca
  tamano del bloque ni exclusividad. Sobrevivio al merge sin tocarlo.

## Mapa `R<n> -> test`

Los 26 requisitos, cada uno con el test que lo hace ejecutable. `login-skin/1` = el `describe`
«nivel 1 · contrato de texto del CSS»; `login-skin/2` = «nivel 2 · contrato del marcado».

| R | Test que lo cubre |
| --- | --- |
| R1 | `login-form.test.tsx` > «muestra campo de usuario, campo de contrasena enmascarado y boton dentro de un form» + `login-skin/2` > «deja el enlace de recuperacion en el pie de la tarjeta y fuera del formulario» |
| R2 | `login-form.test.tsx` > «conserva el usuario escrito tras un intento rechazado» y «deja el campo de contrasena vacio tras un intento rechazado» (campos no controlados) |
| R3 | `login-form.test.tsx` > «deshabilita el boton mientras el envio esta en curso», «marca aria-busy mientras el envio esta en curso», «rehabilita el boton cuando el envio termina con error» |
| R4 | `login-form.test.tsx` > «conserva el usuario escrito tras un intento rechazado» + «deja el campo de contrasena vacio tras un intento rechazado» (el `errorSpy` del propio archivo vigila el aviso de consola) |
| R5 | `login-form.test.tsx` > «muestra el error de campo inline, marca aria-invalid y lo vincula con aria-describedby» y «emite un toast de error cuando las credenciales no son aceptadas» — ambos afirman sobre `REQUIRED_FIELD_ERROR` y `GENERIC_CREDENTIALS_ERROR`, nunca sobre literales |
| R6 | `login-form.test.tsx` > «emite un toast de error cuando las credenciales no son aceptadas», «no reemite el toast en un re-render del mismo intento», «emite un toast nuevo por cada intento rechazado, aunque la entrada sea identica» |
| R7 | `login-form.test.tsx` > «en estado inicial no muestra errores, no emite toast y los campos estan vacios» + «muestra el error de campo inline...» + los tres del estado «enviando» + el del toast |
| R8 | Los **18** tests de `login-form.test.tsx` siguen verdes **sin editarse** (esa es la prueba), mas `tests/integration/identity/login.int.test.ts` (13) y `e2e/login.spec.ts` (4) en verde |
| R9 | `login-skin/1` > «declara los valores del insumo para el vidrio y las burbujas en los dos modos» + «conserva el filo de 1px y el brillo interior en la sombra de la tarjeta, tambien con transparencia reducida» + revision visual de T10 (escenarios 1 y 2). **Reescrito tras el rechazo**: la primera version mapeaba aqui el test de R11, que no afirmaba ni un valor del insumo ni nada del modo oscuro (ver «Segunda vuelta») |
| R10 | `login-skin/1` > «declara el desenfoque de fondo con y sin prefijo, tambien en la condicion de soporte» |
| R11 | `login-skin/1` > «pinta la tarjeta opaca como base y el vidrio solo como mejora dentro de @supports» (incluye la vuelta a opaco con transparencia reducida) + T10 (escenario 4) |
| R12 | `login-skin/1` > «define exactamente tres burbujas, ni una mas» + «reparte las burbujas con retardos negativos y ciclos de 17, 18 y 19 segundos» + «transcribe opacidad, deriva, recorrido y escala de cada burbuja tal como los da el insumo» (menor-2) |
| R13 | `login-skin/2` > «monta las tres burbujas como capa decorativa e inalcanzable por teclado» + «coloca la capa de burbujas como hermana de la tarjeta y antes que ella» + `login-skin/1` > «deja la capa de burbujas sin capturar el puntero y por debajo de la tarjeta» (menor-3) |
| R14 | `login-skin/1` > «hace desaparecer la capa de burbujas con movimiento reducido» + `login-skin.spec.ts` > «oculta la capa de burbujas cuando el sistema pide movimiento reducido» **y** «pinta las tres burbujas cuando no hay preferencia de movimiento reducido» (el contraste evita que el primero pase tambien si alguien borra el componente) |
| R15 | `login-skin/2` > «expone un unico landmark main, que es el ambito del login» |
| R16 | `login-skin/1` > «fija 44px de alto en campo y boton, y 400px, 18px y 28px en la tarjeta del login» (cara positiva, menor-4: **es la que defiende el numero en el gate**) + «mantiene las medidas... dentro del ambito del login» (cara negativa) + `login-skin.spec.ts` > «presenta campos y boton con al menos 44 px de alto computado» y «no deja crecer la tarjeta mas alla de 400 px en escritorio» |
| R17 | `login-skin/1` > «no deja ninguna de esas medidas fuera del bloque de QC-30» + `login-skin/2` > «no altera las primitivas de components/ui» |
| R18 | `login-skin/1` > «declara el bloque de QC-30 fuera de toda capa de cascada» |
| R19 | `login-skin/2` > «no altera las primitivas de components/ui» (`h-8` en input y button, `rounded-xl` y el espaciado por defecto en card) |
| R20 | `login-skin/2` > «conserva el radio y el anillo de foco de campo y boton en las primitivas» (`rounded-lg`, `focus-visible:ring-3`) + `login-skin/1` > «no redeclara el radio de campo y boton, ni el anillo de foco, ni la tipografia» |
| R21 | `login-skin/1` > «solo declara variables propias con prefijo `--qc30-`, salvo el espaciado de la tarjeta» (muerde si alguien redefine un token de QC-29 dentro del bloque) |
| R22 | `login-skin/1` > «deja los valores moviles de las burbujas en la base y los de escritorio en la media query» + `login-skin.spec.ts` > «en viewport de telefono no provoca scroll horizontal y conserva 16 px de letra» |
| R23 | `login-skin/2` > «mide el alto de la pantalla con la unidad de viewport dinamica» (`min-h-svh`, y no `min-h-screen`) + `login-skin.spec.ts` > «en viewport de telefono...» (16 px de letra y 44 px de alto en navegador real) |
| R24 | `login-skin/1` > «encierra todo lo de QC-30 entre sus dos delimitadores de bloque», «declara el bloque de QC-30 fuera de toda capa de cascada» y «deja intactas y sin reindentar las reglas del panel flotante de la barra lateral» |
| R25 | `tests/guards/guard-dependencias-aprobadas.test.ts` + la evidencia de git de arriba (`package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` sin cambios frente a `origin/dev`) |
| R26 | `e2e/login-skin.spec.ts`, **10/10** en Chromium y WebKit, y `e2e/login.spec.ts` **4/4 sin una sola linea modificada** |

**Ningun requisito queda sin test.** Cuatro de ellos (R20, R21, R22, R23) no tenian asercion
propia en la primera pasada y se cerraron con cinco `it` nuevos antes de dar la feature por
cerrada; **ninguno salio rojo contra el codigo real**, o sea que cerraron un hueco de
verificacion, no un defecto.

## Salida real de los tests

### Gate completo — `./init.sh`

```
✓ regla max-2-por-zona respetada (in_progress=2)
✓ specs presentes para features sdd en vuelo
-> pnpm run typecheck   ✓ typecheck paso
-> pnpm run lint        ✓ lint paso
-> pnpm run test:json

 Test Files  65 passed (65)
      Tests  657 passed (657)

✓ tests: sin rojos nuevos (65 archivos ejecutados, baseline vacio)
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

Nota sobre el validador de fichas: corrido **desde la raiz del repo**
(`node scripts/validate-features.mjs`) sale limpio en sus cuatro comprobaciones. Es el modo
fiable: desde dentro de un worktree puede dar un falso rojo por como resuelve `.worktrees/`
contra el directorio de trabajo.

### E2E — `pnpm exec playwright test e2e/login-skin.spec.ts`

```
10 passed (1.0m)     # 5 tests x 2 proyectos (chromium + webkit)
```

`e2e/login.spec.ts` corre en verde (4/4) y **no se abrio**.

## T10 — la revision visual, y como se hizo

Los cuatro escenarios se miraron en Chromium real, con capturas tomadas por un spec temporal
que se **borro despues** (no queda ni en la rama ni en el arbol de trabajo). Las imagenes estan
fuera del repo, en el scratchpad de la sesion, por si el reviewer quiere verlas.

| Escenario | Resultado |
| --- | --- |
| Modo claro, escritorio | Tarjeta de vidrio legible, burbujas visibles sobre el fondo agua |
| Modo oscuro, escritorio | Idem; el filo de 1 px y el brillo superior separan la tarjeta del fondo |
| Ventana de telefono (390x844), claro y oscuro | Tarjeta a ancho fluido, sin desbordes ni scroll lateral |
| Desenfoque desactivado (rama opaca del `@supports`) | Tarjeta **opaca** y legible, con filo y sombra; **nunca** translucida-sin-desenfocar |
| Movimiento reducido | **No aparece ninguna burbuja**; la tarjeta se ve igual |
| Error de campo, claro y oscuro | `REQUIRED_FIELD_ERROR` legible bajo cada campo y anillo `aria-invalid` visible sobre el vidrio en los dos modos |

**Cero retoques**: no hizo falta cambiar nada del bloque despues de mirar.

El aviso de credenciales (toast) no se pudo disparar en esta revision sin credenciales validas
de la base; su color no lo toca esta ficha —lo aporta el tema de QC-29— y su cobertura funcional
esta en `login-form.test.tsx` y en `e2e/login.spec.ts`.

## Decisiones tomadas durante la implementacion

1. **Los colores del pie de la tarjeta.** El insumo no publica valores para el `CardFooter`, y
   el primitivo trae un fondo y un borde superior opacos que cortaban el vidrio en horizontal.
   Se re-coloreo con alfas nuevas sobre **las mismas ternas RGB del insumo**, en variables
   `--qc30-login-footer-*`. Bajo transparencia reducida vuelve a los tokens `--muted` y
   `--border` de QC-29, sin redefinirlos. **Es el unico punto de la ficha con numeros no
   dictados por el insumo**; se valido a ojo en T10 y queda senalado aqui para el reviewer.
2. **El radio de la cabecera y el pie de la tarjeta.** El primitivo los redondea a 14 px y la
   tarjeta pasa a 18 px. Se alinearon **dentro del ambito**. Es cosmetico —la tarjeta recorta su
   contenido— pero evitaba un filo a 14 px sobre una esquina de 18 px.
3. **El diametro de la burbuja 2 en escritorio es `44px`**, la misma cifra que el alto de campo
   y boton. Se declaro **dentro de un selector que ya cuelga de `[data-login='screen']`**, y el
   test de nivel 1 comprueba las medidas con un recorrido de declaraciones con pila de
   selectores en vez de con busqueda de texto plano, que no sabria distinguir los dos casos.
4. **`display: none` con movimiento reducido, no «quietas al 22%».** `design-input-login.md > 4`
   dice lo segundo y **esta superado**: manda la decision cerrada del humano, posterior, que
   `requirements.md` y `design.md > 5` ya recogen. Queda comentado **en el propio test** para
   que nadie lo «arregle» al reves.
5. **Ningun censo global en los tests.** Los unicos conteos son locales y semanticos: tres
   burbujas, un `main`, cero nodos enfocables. La asercion sobre el bloque del panel flotante
   comprueba **presencia**, nunca tamano ni exclusividad — por eso sobrevivio intacta a que
   `feature/fix-ajuste-sidebar` aterrizara en `dev` a mitad de la implementacion.

## Hallazgos que NO son de esta ficha

Ninguno se arreglo aqui: no entran en el alcance y tocarlos habria ensuciado el PR.

1. **`e2e/theme.spec.ts` (QC-29) es fragil en frio.** No sobrescribe el timeout por test, asi
   que se queda en los 30 s por defecto y la primera compilacion bajo demanda de `/login` en
   `next dev` se los come en la navegacion. Medido en este worktree: **en solitario 6 failed /
   2 passed**; junto a `login-skin.spec.ts` —que si fija un timeout propio— mejora a 4 failed /
   18 passed. **Es peor sin esta ficha que con ella**, o sea que no es una regresion de QC-30.
   La cura seria fijar el timeout en ese archivo, como ya hace `e2e/login.spec.ts`.
   El gate (`./init.sh`) **no corre E2E**, asi que esto no lo enrojece.
2. **Montar un worktree no deja el entorno listo.** Dos trampas que costaron tiempo y que
   `docs/worktrees.md` no menciona:
   - `.env` esta en `.gitignore`, asi que **no viaja al worktree**: sin copiarlo desde la raiz,
     los 6 archivos de integracion caen con «Environment variable not found: DATABASE_URL» y el
     gate acusa 6 rojos que no son de nadie.
   - Y no basta con copiarlo: **hay que volver a correr `pnpm exec prisma generate` DESPUES**,
     porque el cliente generado fija las rutas de `.env` en tiempo de generacion. Generado sin
     `.env`, sigue sin encontrar `DATABASE_URL` aunque el archivo ya exista.

   Podria valer una linea en `scripts/wt.sh` o en `docs/worktrees.md`; es una mejora del arnes,
   asi que va por `/afinar-regla` y no por aqui.
3. **Un rojo intermitente en `login-form.test.tsx`.** En **una** corrida de la suite completa
   fallo «deja el campo de contrasena vacio tras un intento rechazado» (R4). No se reprodujo:
   el archivo pasa 18/18 en solitario, 38/38 junto a `login-skin.test.tsx`, y la suite entera
   volvio a verde en las **tres** corridas siguientes. Parece una carrera de temporizacion
   bajo carga en el reseteo que React 19 hace del campo no controlado, no un defecto de esta
   ficha —que no toca ese archivo ni ese componente—. Se deja anotado porque un intermitente
   silenciado es peor que uno escrito.

## Segunda vuelta — respuesta al rechazo del reviewer

`progress/review_QC-30-rediseno-login.md` **RECHAZO** la feature: 1 bloqueante y 6 menores. El
bloqueante **no era un defecto de la piel** —el CSS estaba bien y el gate verde— sino un hueco
de trazabilidad. Se cerro **sin tocar una sola linea de `app/globals.css`**, que es exactamente
lo que el informe pedia.

### BLOQUEANTE-1 — R9 no mordia

El reviewer demostro que se podia **borrar el modo oscuro entero y recortar la sombra de la
tarjeta** con el gate en verde: `Tests 20 passed (20)`. La causa era real y no un descuido de
redaccion: el test que la tabla mapeaba a R9 («pinta la tarjeta opaca como base y el vidrio solo
como mejora dentro de `@supports`») verifica en realidad **R11**. De los valores de
`design-input-login.md > 3` no afirmaba nada, y del modo oscuro tampoco.

Dos `it` nuevos en el nivel 1 de `tests/unit/login-skin.test.tsx`:

- **«declara los valores del insumo para el vidrio y las burbujas en los dos modos» (R9)** —
  agrupa las declaraciones por selector y exige `:root` **y** `.dark` con los **siete** valores
  literales de cada modo (degradado, anillo, brillo interior, sombra, relleno/borde/halo de
  burbuja), comparando con los espacios normalizados y **sin ignorar un solo digito**. Los
  `--qc30-login-footer-*` solo se exigen presentes, no con valor: son la decision propia de la
  implementacion —alfas nuevas sobre ternas del insumo— y son la parte deliberadamente blanda
  del bloque.
- **«conserva el filo de 1px y el brillo interior en la sombra de la tarjeta, tambien con
  transparencia reducida» (R9)** — toda declaracion `box-shadow` bajo `[data-slot='card']` debe
  incluir las tres variables, y debe haber al menos una en la rama base **y** otra dentro de
  `@media (prefers-reduced-transparency: reduce)`. Es lo que el insumo llama «si se recorta algo,
  que no sea eso».

### La mutacion con la que se comprobo que R9 ahora SI muerde

Corrida por el `implementer`, no heredada del informe. Las **dos** mitades a la vez, que es como
las aplico el reviewer:

1. borrado integro del bloque `.dark { --qc30-login-* }` (los nueve valores del modo oscuro), y
2. `box-shadow` de `[data-slot='card']` reducido a solo `var(--qc30-login-shadow)` **en sus dos
   apariciones** (rama base y transparencia reducida), o sea sin filo y sin brillo interior.

Antes: **20 passed (20)** — verde. Ahora:

```
 × declara los valores del insumo para el vidrio y las burbujas en los dos modos
 × conserva el filo de 1px y el brillo interior en la sombra de la tarjeta, tambien con transparencia reducida

AssertionError: expected 0 to be greater than 0
AssertionError: expected 'box-shadow: var(--qc30-login-shadow)' to contain 'var(--qc30-login-ring)'

 Test Files  1 failed (1)
      Tests  2 failed | 24 passed (26)
```

Enrojecen **los dos `it` de R9 y solo esos**. `app/globals.css` se revirtio con
`git checkout --` y el diff frente a `origin/dev` sigue siendo **273 inserciones y cero
eliminaciones**.

### Los seis menores

| # | Que era | Como se cerro |
| --- | --- | --- |
| menor-1 | `design.md` no recogia la decision del pie de la tarjeta | Parrafo nuevo en `design.md > 6`: por que hizo falta (el pie opaco cortaba el vidrio), que **las ternas RGB son del insumo y solo las alfas son nuevas** (lo que R21 autoriza), la vuelta a `--muted` / `--border` con transparencia reducida, el realineado del radio a 18 px, y por que el test **no** afirma esos valores |
| menor-2 | R12 sin opacidades, derivas, recorrido ni escala | `it` que transcribe `0.30` / `0.34` / `0.26`, derivas `24` / `-20` / `18px` en la base movil y `30` / `-26` / `22px` en escritorio, recorrido 900/960 px y escala `0.86` a `1.06` |
| menor-3 | `pointer-events: none` de R13 no mordia | `it` que exige `pointer-events: none` y `z-index: 1` en la capa, y `z-index: 2` en la tarjeta. **Mutacion comprobada**: quitarlo enrojece con `expected [...] to include 'pointer-events: none'` |
| menor-4 | Los 44 px solo se defendian en E2E, y el gate no corre E2E | `it` con la cara **positiva** (existen las declaraciones `min-height: 44px` de campo y boton, y 400/18/28 px de la tarjeta, todas bajo el ambito). La cara negativa que ya existia **no se toco**: hacen falta las dos. **Mutacion comprobada**: bajar el campo a 32 px enrojece |
| menor-5 | La lista del anillo de foco de R20 no cubria `box-shadow` | Se anadio `box-shadow`, **acotado a las reglas que apuntan a `[data-slot='input']` o `[data-slot='button']`**. Prohibirlo en todo el bloque habria salido rojo contra el codigo bueno: la tarjeta declara `box-shadow` legitimamente, y es justo el filo + brillo + sombra del vidrio |
| menor-6 | `e2e/theme.spec.ts` fragil en frio | **Nada que arreglar.** El reviewer confirmo que sus 6 rojos son todos `page.goto: Test timeout` y ninguna asercion de estilo, y que no es regresion de QC-30. Queda como observacion, ya anotada mas arriba |

`tests/unit/login-skin.test.tsx` pasa de **20 a 26** tests. Ninguna asercion previa se modifico
ni se relajo, y ninguna de las nuevas salio roja contra el codigo real: cerraban huecos de
verificacion, no defectos.

### Gate tras la segunda vuelta

```
-> pnpm run typecheck   ✓ typecheck paso
-> pnpm run lint        ✓ lint paso

 Test Files  65 passed (65)
      Tests  663 passed (663)

✓ tests: sin rojos nuevos (65 archivos ejecutados, baseline vacio)
== init OK ==
```

Archivos tocados en esta vuelta: `tests/unit/login-skin.test.tsx` (+6 `it`),
`specs/QC-30-rediseno-login/design.md` (menor-1) y esta bitacora. **Cero cambios en codigo de
produccion**: `app/globals.css`, `page.tsx` y `login-background.tsx` estan byte a byte como los
reviso el reviewer.

## Lo que este documento NO dice

Que la feature este aprobada. El `implementer` no se autoaprueba: quedan la revision, el PR y
el merge, y el `reviewer` decide.
