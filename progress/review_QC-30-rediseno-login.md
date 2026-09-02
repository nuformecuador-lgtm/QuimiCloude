# QC-30 — rediseno-login · revision (F2.2)

> Escrita por el `reviewer`. Rama `feature/QC-30-rediseno-login`, HEAD `24a4555`, worktree
> `.worktrees/QC-30-rediseno-login/`. Contrato: `specs/QC-30-rediseno-login/` (requirements,
> design, tasks) mas `design-input-login.md`, `docs/architecture.md`, `docs/conventions.md` y
> `CHECKPOINTS.md`. El reviewer **no edita codigo**: lo que sigue es un veredicto.

## Veredicto

**RECHAZADO.** 1 hallazgo BLOQUEANTE y 6 menores. El bloqueante **no es un defecto de la piel**
—la pantalla esta bien construida y el gate esta verde—: es un hueco de **trazabilidad**
demostrado por mutacion. Se cierra anadiendo aserciones a `tests/unit/login-skin.test.tsx`; no
hace falta tocar `app/globals.css` ni el marcado.

## Como se verifico (no se confio en la bitacora)

- `./init.sh` completo, corrido por el reviewer en este worktree: **verde**.
  `Test Files 65 passed (65)` · `Tests 657 passed (657)` · typecheck, lint, migraciones y `.env` OK.
- `pnpm exec playwright test e2e/login-skin.spec.ts`: **10/10** (5 x chromium + webkit). Confirmado.
- `pnpm exec playwright test e2e/login.spec.ts`: 4/4 con el servidor caliente (los 2 rojos de webkit
  de la primera corrida en frio son `page.goto` agotando el timeout durante la compilacion bajo
  demanda; al repetir, 2/2 en 11 s). **No es regresion de QC-30**.
- **Mutaciones dirigidas** sobre el codigo (aplicadas y revertidas; arbol limpio al terminar), para
  distinguir un test que verifica de uno escrito a la medida del codigo. Resultados en el punto 2.
- Diff real contra `dev`: 10 archivos. El diff acotado a `package.json`, `pnpm-lock.yaml`, `docs/`,
  `components/`, `login-form.tsx`, `submit-button.tsx`, `e2e/login.spec.ts` y
  `tests/unit/login-form.test.tsx` sale **vacio**.

## Checklist de CHECKPOINTS.md

### Especificacion
- [x] `requirements.md` con 26 requisitos EARS numerados.
- [x] `design.md` con siete alternativas descartadas y su porque (A1 a A7).
- [x] `tasks.md` con las **11** tasks marcadas `[x]` (T1 a T11).

### Trazabilidad
- [~] Cada `R<n>` mapea a un test. **26/26 mapeados en la tabla, pero R9 no tiene ningun test que
  muerda** (ver BLOQUEANTE-1); R12 y R13 quedan cubiertos solo en parte.
- [x] `progress/impl_QC-30-rediseno-login.md` contiene el mapa `R<n> -> test` completo.

### Calidad de codigo
- [x] `pnpm run typecheck` verde · [x] `pnpm run lint` verde · [x] `pnpm test` 657/657.
- [x] Flujo critico (autenticacion): `e2e/login.spec.ts` sigue existiendo **sin una linea
  modificada** y pasa; la ficha no cambia comportamiento.
- [x] Multiplataforma (`docs/architecture.md > Componentes`): `min-h-svh` y **ningun `100vh`** en el
  diff; `font-size` del campo mayor o igual a 16 px verificado en navegador real (E2E, viewport
  390x844); alto computado mayor o igual a 44 px de campo, campo de contrasena y boton, y ancho del
  boton mayor o igual a 44 px, en Chromium **y WebKit**; ninguna interaccion nueva que dependa de
  `:hover`; `-webkit-backdrop-filter` declarado junto al estandar y en la condicion del `@supports`.
  Sin excepcion que declarar.
- [x] Dependencias: **cero** anadidas. `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md`
  identicos a `dev`. No hay utilidad escrita a mano que ya resuelva una libreria del stack: es CSS.

### Datos y seguridad
- [x] **No aplica y esta bien que no aplique**: cero tablas, cero migraciones, cero RLS, cero
  endpoints, cero webhooks, cero Server Actions nuevas. Ningun secreto ni contexto hardcodeado; la
  unica constante de ruta del E2E (`/login`) esta justificada en el propio archivo.

### Modulos hexagonales / Permisos / Configuracion
- [x] No aplica: la feature no toca `lib/`. El marcado nuevo es un Server Component sin props ni
  logica y se exporta por el barrel de la ruta, como pide `docs/architecture.md > Componentes`.

### Verificacion final
- [x] `./init.sh` verde. — [ ] Veredicto OK (es RECHAZADO). — [ ] `progress/history.md` y desmontaje
  del worktree: pendientes de la fase que corresponda.

## Los cinco puntos pedidos con lupa

### 1. Los colores del pie de la tarjeta (`--qc30-login-footer-*`) -> **menor, no es inventar diseno**

Es cierto que es el unico punto de la ficha con numeros que el insumo no dicta, y el implementer lo
declaro en vez de esconderlo. Pero **las ternas RGB salen todas del insumo** (`255,255,255` y
`83,144,145` en claro; `9,26,28` y `204,234,232` en oscuro): lo nuevo son tres alfas. Eso es
exactamente lo que R21 permite —«las variables propias del login **derivan de los valores del
insumo**»—: no hay token de QC-29 redefinido ni paleta nueva. El disparador es real: el primitivo
trae `bg-muted/50` y un `border-t` opacos que cortarian el vidrio en horizontal, y bajo
`prefers-reduced-transparency` el pie vuelve a `var(--muted)` y `var(--border)`. Dentro del alcance,
proporcionado y reversible en dos lineas.

Lo que si falta: **`design.md` no menciona el pie de la tarjeta en ningun sitio**. La decision vive
solo en un comentario del CSS y en la bitacora, asi que el spec y el codigo ya no dicen lo mismo
(menor-1).

### 2. R20, R21, R22 y R23: verifican, o estan escritos para pasar? -> **verifican**

No me fie de leerlos: mute el codigo y comprobe que enrojecen. Cinco mutaciones, cinco rojos, cada
uno **el test que corresponde y solo ese**:

| Mutacion aplicada al codigo real | Resultado |
| --- | --- |
| `border-radius: 12px` anadido a `[data-slot='input']` dentro del ambito | rojo: «no redeclara el radio de campo y boton...» (R20) |
| `--card: oklch(...)` anadido al `:root` del bloque de QC-30 | rojo: «solo declara variables propias con prefijo `--qc30-`...» (R21) |
| Valores de escritorio puestos como base de la burbuja 1 | rojo: «deja los valores moviles... en la base...» (R22) |
| `min-h-svh` -> `min-h-screen` en `page.tsx` | rojo: «mide el alto de la pantalla con la unidad de viewport dinamica» (R23) |
| Bloque entero envuelto en `@layer base` | rojo: «declara el bloque de QC-30 fuera de toda capa de cascada» (R18) |

Ninguno es una tautologia y ninguno afirma sobre si mismo: R20 se comprueba **por recorrido de
declaraciones con pila de selectores**, no por busqueda de texto —que confundiria el `border-radius`
legitimo de la tarjeta con uno del campo—, y R21 recorre propiedades personalizadas en vez de buscar
cadenas. La preocupacion del encargo esta atendida: **son tests que muerden**.

### 3. La mecanica del formulario -> **intacta, verificado en el diff**

`git diff dev...HEAD` no incluye `login-form.tsx`, `submit-button.tsx`, ningun archivo de
`components/ui/`, `e2e/login.spec.ts` ni `tests/unit/login-form.test.tsx`. Sus 18 tests pasan **sin
editarse**, que es la prueba de R2 a R8. `<form action>`, campos no controlados, `useFormStatus`, el
`key` del campo de usuario y el copy desde `GENERIC_CREDENTIALS_ERROR` y `REQUIRED_FIELD_ERROR`
siguen donde estaban. La piel entro **desde fuera**, por `data-login="screen"` y CSS de ambito, justo
como prometia `design.md > 2`.

### 4. Las reglas de `app/globals.css` -> **correctas**

- **Fuera de `@layer`**: verificado por mutacion (fila 5 de la tabla de arriba).
- **Acotadas**: toda regla cuelga de `[data-login='screen']`. El test recorre declaraciones y exige
  que 44/400/18/28 px solo aparezcan bajo ese ambito, con una unica excepcion **preexistente y
  afirmada por selector** (`[data-slot='sidebar-menu-button']`, de QC-29).
- **Sin desplazar nada ajeno**: el diff del archivo es `@@ -206,3 +206,276 @@`, **273 inserciones y
  cero eliminaciones**, todo despues del `@layer base`. La rama `feature/fix-ajuste-sidebar` ya
  aterrizo en `dev` y el merge entro sin conflicto; el test del panel flotante afirma **presencia**,
  nunca exclusividad ni tamano, asi que no se rompe cuando esa rama crece.

### 5. Movimiento reducido -> **correcto: las burbujas desaparecen**

`@media (prefers-reduced-motion: reduce)` con `display: none` sobre `[data-login='bubbles']`. El
codigo hace lo que ratifico el humano, **no lo del insumo** (22% de opacidad), y la discrepancia esta
escrita en tres sitios: `design.md > 5`, el comentario del CSS y —lo que mas importa— el comentario
del propio test, que avisa de que «arreglarlo» hacia la opacidad seria invertir la decision. Ademas
sustituir el `display: none` por `animation: none; opacity: 0.22` pone el test en rojo (mutacion
comprobada), y el E2E lo mide en navegador con `emulateMedia` en los dos motores, con un segundo test
de contraste para que «oculto» no se confunda con «borrado».

### Extras pedidos

- **Burbujas inertes**: `aria-hidden="true"` en la capa, tres `<span>` vacios sin `tabindex`, cero
  nodos enfocables (afirmado), y `pointer-events: none` en el CSS. Ver menor-3 sobre su verificacion.
- **Un solo landmark**: `getAllByRole('main')` con longitud 1 y el atributo de ambito encima. La capa
  es un `div`, no un elemento seccionador.
- **Sin dependencias nuevas**: confirmado por diff vacio de `package.json` y `pnpm-lock.yaml`.
- **Sin censos globales**: los unicos conteos son locales y semanticos —tres burbujas, un `main`,
  cero nodos enfocables, tres indices distintos—. No hay «exactamente N archivos» ni «estas N
  migraciones». El test del panel flotante esta escrito a proposito para no ser un censo. **Este repo
  se salvo aqui del quinto incidente de la serie.**

## Hallazgos

### BLOQUEANTE-1 — R9 no tiene ningun test que muerda: el modo oscuro y el filo/brillo de la tarjeta pueden borrarse enteros con el gate en verde

R9 exige pintar la tarjeta translucida y desenfocada **con el filo de 1 px y el brillo interior
superior**, con los valores de `design-input-login.md > 3` **para el modo claro y para el modo
oscuro**. El test mapeado («pinta la tarjeta opaca como base y el vidrio solo como mejora dentro de
`@supports`») verifica en realidad **R11**: base opaca, existencia del `@supports` y vuelta a opaco.
De los valores de R9 no afirma nada.

Demostrado por mutacion, no por lectura. Aplique **a la vez**:

1. borrar **el bloque `.dark` con las variables `--qc30-login-*` entero** (los nueve valores del modo
   oscuro: degradado, anillo, brillo, sombra, relleno/borde/halo de burbuja), y
2. reducir el `box-shadow` de la tarjeta a `var(--qc30-login-shadow)`, es decir **quitar el filo de
   1 px y el brillo interior** — literalmente lo que el insumo llama «si se recorta algo, que no sea
   eso» y `design.md > 4` llama «lo que NO se recorta bajo ningun concepto».

Resultado: `Tests 20 passed (20)`. **Verde con la mitad oscura de la feature borrada.** Es el mismo
patron de falso verde contra el que `design.md > 6` y `> 10` avisan, solo que en otra propiedad: el
riesgo «un valor del insumo se copia mal al CSS» se mitigo para las burbujas (posiciones y diametros
transcritos en el test) y **se olvido para la tarjeta y para todo el modo oscuro**.

Que falta para cumplirlo (solo en `tests/unit/login-skin.test.tsx`, sin tocar el CSS):

- afirmar que el bloque declara `:root` **y** `.dark` con las variables `--qc30-login-*`, y que sus
  valores son literalmente los de `design-input-login.md > 3` y `> 4` en cada modo (degradado,
  anillo, brillo interior, sombra, relleno/borde/halo de burbuja); y
- afirmar que el `box-shadow` de `[data-slot='card']` dentro del ambito incluye
  `var(--qc30-login-ring)` **y** `var(--qc30-login-inner-glow)`, tanto en la rama base como en la de
  `prefers-reduced-transparency`.

Con eso R9 y la mitad oscura de R12 y R21 pasan a estar verificadas de verdad.

### menor-1 — `design.md` no recoge la decision del pie de la tarjeta
Las variables `--qc30-login-footer-*` y el realineado del radio de cabecera y pie (18 px) se
decidieron durante la implementacion y solo constan en el CSS y en la bitacora. `design.md > 6`
enumera lo que contiene el bloque y no las menciona. No cambia el veredicto, pero deja el spec
desalineado con el codigo para quien lo lea manana.

### menor-2 — R12 se verifica a medias
El test cubre el **numero** de burbujas, los retardos negativos y las duraciones 17/18/19 s, y el de
R22 cubre posiciones y diametros. **No se afirman** las opacidades (0.30 / 0.34 / 0.26), las derivas,
el recorrido (900/960 px) ni la escala 0.86 a 1.06, que R12 tambien cita del insumo. Estan bien en el
CSS; simplemente nadie los defiende.

### menor-3 — la clausula «sin capturar eventos de puntero» de R13 no esta verificada
Quitar `pointer-events: none` de `[data-login='bubbles']` deja los 20 tests en verde (mutacion
comprobada). El E2E tampoco lo afirma: cuenta y mide visibilidad. Las otras dos clausulas de R13
—`aria-hidden` y no alcanzable por tabulacion— si estan bien cubiertas, por eso es menor y no
bloqueante. Una linea en el test de nivel 1 lo cierra.

### menor-4 — el gate no defiende los 44 px del campo
Bajar `min-height` de `[data-slot='input']` a 32 px deja los 20 tests unitarios en verde: el test de
medidas afirma «toda declaracion que use 44px cuelga del ambito», no «el campo mide 44». El numero si
esta defendido en `e2e/login-skin.spec.ts` con alto computado en Chromium y WebKit —que corri y pasa
10/10— pero **el gate no ejecuta E2E**, asi que en la practica una regresion de altura llegaria al
merge sin ponerse roja. Es coherente con `design.md > 8` (jsdom no computa cascada) y por eso no es
bloqueante, pero conviene que el test de nivel 1 afirme ademas que existen las declaraciones
`min-height: 44px` para `[data-slot='input']` y `[data-slot='button']`.

### menor-5 — el «anillo de foco» de R20 se comprueba por lista de propiedades
La lista enumera `outline`, `outline-width`, `outline-color`, `--ring` y `ring-width`. El bloque **si**
declara `box-shadow` sobre la tarjeta, que es otra via posible de pisar un anillo de foco; ahi el test
no llegaria. Riesgo bajo (ninguna regla del bloque toca campo ni boton mas alla del `min-height`), se
anota por si alguien amplia el bloque.

### menor-6 — observacion de entorno, ajena a esta ficha
Confirmo lo que reporta la bitacora: `e2e/theme.spec.ts` (QC-29) **es fragil en frio y no es regresion
de QC-30**. Corrido en solitario: 6 failed / 2 passed, y **los seis rojos son `page.goto: Test timeout
of 30000ms exceeded`** —ninguna asercion de estilo falla—; los dos que corren cuando el servidor ya
esta caliente pasan en 2,5 s. Ese archivo no fija timeout propio, a diferencia de `e2e/login.spec.ts`
y del nuevo `login-skin.spec.ts`. Le paso lo mismo a `e2e/login.spec.ts` en su primera corrida en frio
(2 rojos de webkit por `goto`), y al repetir en caliente da 2/2. El gate no corre E2E, asi que nada de
esto lo enrojece. La cura —fijar el timeout en `theme.spec.ts`— es de otra ficha. Vale tambien la
deuda que anota el implementer sobre montar un worktree (`.env` no viaja y hay que repetir `prisma
generate`): es mejora del arnes, por `/afinar-regla`.

## Trazabilidad `R<n> -> test`

`skin/1` = `tests/unit/login-skin.test.tsx` > «nivel 1 · contrato de texto del CSS»; `skin/2` =
«nivel 2 · contrato del marcado»; `e2e` = `e2e/login-skin.spec.ts`; `form` =
`tests/unit/login-form.test.tsx` (no editado). Columna **Muerde**: si el requisito enrojece cuando el
codigo se rompe.

| R | Test | Muerde |
| --- | --- | --- |
| R1 | `form` > «muestra campo de usuario, campo de contrasena enmascarado y boton dentro de un form» + `skin/2` > «deja el enlace de recuperacion en el pie de la tarjeta y fuera del formulario» | si |
| R2 | `form` > «conserva el usuario escrito tras un intento rechazado», «deja el campo de contrasena vacio...» | si |
| R3 | `form` > «deshabilita el boton...», «marca aria-busy...», «rehabilita el boton...» | si |
| R4 | `form` > los dos de re-render tras intento rechazado (+ su vigilancia de avisos de consola) | si |
| R5 | `form` > «muestra el error de campo inline...» y «emite un toast de error...» (afirman sobre las constantes) | si |
| R6 | `form` > «emite un toast...», «no reemite el toast...», «emite un toast nuevo por cada intento...» | si |
| R7 | `form` > estado inicial + error de campo + los tres de «enviando» + el del toast | si |
| R8 | los 18 de `form` verdes **sin editarse**, `login.int.test.ts` (13) y `e2e/login.spec.ts` (4) | si |
| **R9** | `skin/1` > «pinta la tarjeta opaca como base...» | **NO — BLOQUEANTE-1** |
| R10 | `skin/1` > «declara el desenfoque de fondo con y sin prefijo, tambien en la condicion de soporte» | si |
| R11 | `skin/1` > «pinta la tarjeta opaca como base y el vidrio solo como mejora dentro de `@supports`» | si |
| R12 | `skin/1` > «define exactamente tres burbujas, ni una mas» + «reparte las burbujas con retardos negativos y ciclos de 17, 18 y 19 s» | parcial (menor-2) |
| R13 | `skin/2` > «monta las tres burbujas como capa decorativa e inalcanzable por teclado» + «coloca la capa... antes que ella» | parcial (menor-3) |
| R14 | `skin/1` > «hace desaparecer la capa... con movimiento reducido» + `e2e` > «oculta la capa...» **y** «pinta las tres burbujas cuando no hay preferencia...» | si |
| R15 | `skin/2` > «expone un unico landmark main, que es el ambito del login» | si |
| R16 | `skin/1` > «mantiene las medidas de 44px, 400px, 18px y 28px dentro del ambito del login» + `e2e` > «presenta campos y boton con al menos 44 px de alto computado» y «no deja crecer la tarjeta mas alla de 400 px» | si en E2E; debil en el gate (menor-4) |
| R17 | `skin/1` > «no deja ninguna de esas medidas fuera del bloque de QC-30» + `skin/2` > «no altera las primitivas de components/ui» | si |
| R18 | `skin/1` > «declara el bloque de QC-30 fuera de toda capa de cascada» | si |
| R19 | `skin/2` > «no altera las primitivas de components/ui» | si |
| R20 | `skin/1` > «no redeclara el radio de campo y boton, ni el anillo de foco, ni la tipografia» + `skin/2` > «conserva el radio y el anillo de foco... en las primitivas» | si (matiz menor-5) |
| R21 | `skin/1` > «solo declara variables propias con prefijo `--qc30-`, salvo el espaciado de la tarjeta» | si |
| R22 | `skin/1` > «deja los valores moviles... en la base y los de escritorio en la media query» + `e2e` > «en viewport de telefono no provoca scroll horizontal...» | si |
| R23 | `skin/2` > «mide el alto de la pantalla con la unidad de viewport dinamica» + `e2e` > «...conserva 16 px de letra» (+ 44 px en angosto) | si |
| R24 | `skin/1` > «encierra todo lo de QC-30 entre sus dos delimitadores», «...fuera de toda capa...», «deja intactas y sin reindentar las reglas del panel flotante» | si; ademas el diff no borra ni una linea |
| R25 | `tests/guards/guard-dependencias-aprobadas.test.ts` + diff vacio de `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` verificado por el reviewer | si |
| R26 | `e2e/login-skin.spec.ts` 10/10 en chromium y webkit + `e2e/login.spec.ts` 4/4 sin editar, ambos corridos por el reviewer | si |

**25 de 26 requisitos verificados de verdad. Uno, R9, no.**

## Que falta para pasar a OK

Solo el BLOQUEANTE-1, y se cierra **sin tocar codigo de produccion**: anadir a
`tests/unit/login-skin.test.tsx` las aserciones de los valores de `design-input-login.md > 3` y `> 4`
en `:root` **y** `.dark`, y la del `box-shadow` de la tarjeta con el filo y el brillo interior.
Recomendado —no exigido— cerrar de paso menor-2, menor-3 y menor-4 en el mismo test, y anadir a
`design.md` un parrafo con la decision del pie de la tarjeta (menor-1). Vuelve al `implementer`.

---

# Ronda 2 — verificacion del arreglo (HEAD `d5ae346`)

> La ronda 1 (arriba) queda como esta: es el registro de por que se rechazo. Esto es lo que se
> comprobo despues, con el mismo metodo —mutar el codigo y ver si el test enrojece—, no leyendo la
> bitacora.

## Veredicto de la ronda 2

**OK.** Cero bloqueantes, cero menores abiertos. El bloqueante esta cerrado y los cinco menores
accionables tambien. Queda una sola observacion de entorno, ajena a la ficha (menor-6).

## 1. La mutacion del bloqueante, repetida por el reviewer

Aplique **exactamente la misma** de la ronda 1, las dos mitades a la vez: borrar el bloque `.dark`
con las variables `--qc30-login-*` entero **y** recortar el `box-shadow` de la tarjeta a solo
`var(--qc30-login-shadow)`. Salida:

    × declara los valores del insumo para el vidrio y las burbujas en los dos modos
    × conserva el filo de 1px y el brillo interior en la sombra de la tarjeta, tambien con
      transparencia reducida
      Tests  2 failed | 24 passed (26)

**Ahora sale rojo, y el rojo es el correcto**: los dos `it` nuevos y solo esos. Coincide con lo
transcrito en la bitacora. Revertido despues; arbol limpio.

Vale la pena senalar como esta escrito el primero: compara **valor por valor contra la regla real**
(`declaracionesDe` agrupa por selector, se normalizan solo los espacios) y falla con un mensaje que
dice que variable y en que modo. Cambiar **un solo digito** —`rgba(255,255,255,0.82)` a `0.83`— lo
pone en rojo (mutacion propia). Es justo la mitigacion que `design.md > 10` prometia para el riesgo
«un valor del insumo se copia mal al CSS» y que en la ronda 1 solo existia para las burbujas.

**BLOQUEANTE-1: cerrado.**

## 2. Cero cambios de produccion, verificado con el diff

- El diff desde `24a4555` acotado a `app/`, `components/`, `e2e/`, `lib/` y `package.json` sale
  **vacio**.
- El diff total desde `24a4555` son **cuatro archivos**: `tests/unit/login-skin.test.tsx` (+222),
  `specs/QC-30-rediseno-login/design.md` (+22), `progress/impl_*.md` y `progress/review_*.md`.
- `app/globals.css` contra `dev` sigue en **273 inserciones y 0 eliminaciones**.

Nada de lo aprobado en la ronda 1 vuelve a estar en juego: el CSS, el marcado y el E2E son byte a
byte los que revise. `login-skin.test.tsx` pasa de 20 a 26 tests.

## 3. Los seis tests nuevos no son tautologias

Una mutacion por test, cada una contra el codigo real, cada una con **un solo rojo y el que toca**:

| Mutacion | Rojo obtenido |
| --- | --- |
| `rgba(255,255,255,0.82)` -> `0.83` (un digito del insumo) | «declara los valores del insumo... en los dos modos» (R9) |
| `.dark` borrado + `box-shadow` recortado | esos dos (R9): 2 failed / 24 passed |
| `--qc30-bubble-opacity: 0.30` -> `0.31` y `scale-to: 1.06` -> `1.10` | «transcribe opacidad, deriva, recorrido y escala...» (R12) |
| `pointer-events: none` fuera y `z-index: 2` de la tarjeta fuera | «deja la capa de burbujas sin capturar el puntero y por debajo de la tarjeta» (R13) |
| `min-height` del campo 44px -> 32px | «fija 44px de alto en campo y boton...» (R16) |
| `box-shadow: 0 0 0 4px red` anadido al campo | «tampoco pisa el anillo de foco... por la via del box-shadow» (R20) |

Los seis muerden. Ninguno afirma sobre si mismo ni sobre el resultado de una funcion del propio
test: todos leen `app/globals.css` y comparan contra valores **transcritos del insumo dentro del
test**, que es la unica forma de que una cifra mal copiada al CSS se note. La mutacion de la fila 5
cierra la puerta que en la ronda 1 dejaba pasar una regresion de altura hasta el merge con el gate
en verde.

## 4. El acotamiento de R20 a campo y boton: **correcto, no lo deja sin fuerza**

Su argumento es cierto y ademas es el unico posible: la `box-shadow` de la tarjeta **es** el filo de
1 px, el brillo interior y la sombra del vidrio, o sea es exactamente lo que R9 obliga a conservar y
lo que el otro test nuevo defiende. Una prohibicion global de `box-shadow` dentro del ambito habria
salido roja contra codigo bueno —un test que hay que relajar el dia que alguien lo lee es peor que
no tenerlo—.

Y el acotamiento **no encoge el requisito**: R20 habla literalmente de «el radio de campo y boton
(10 px), el grosor de 3 px del anillo de foco visible y la familia tipografica». El sujeto es el
campo y el boton, no la tarjeta. La prohibicion cubre ahora todas las vias practicables de tapar el
anillo del primitivo desde la hoja —`outline`, `outline-width`, `outline-color`, `--ring`,
`ring-width` y `box-shadow`— sobre los dos selectores que R20 nombra. La mutacion de la fila 6 lo
confirma: una sombra sobre el campo enrojece.

## 5. El resto del gate, corrido de nuevo

- `./init.sh` completo: **verde**. `Test Files 65 passed (65)` · `Tests 663 passed (663)` (los 6
  nuevos, ni uno mas ni uno menos). Typecheck, lint, migraciones y `.env` OK.
- `design.md > 6` recoge ya la decision del pie de la tarjeta: el disparador (`bg-muted/50` opaco
  cortando el vidrio), que las ternas RGB salen del insumo y solo las alfas son nuevas, la vuelta a
  `var(--muted)` y `var(--border)` bajo transparencia reducida, y el realineado del radio a 18 px.
  Anota ademas, con criterio, que el test **no** afirma los valores del pie por ser la parte blanda
  del bloque. **menor-1: cerrado.**
- No hace falta repetir el E2E: `e2e/login-skin.spec.ts` no cambio (10/10 en Chromium y WebKit en la
  ronda 1) y `e2e/login.spec.ts` sigue sin abrirse.
- Sigue sin haber censos globales, sin dependencias nuevas y sin nada tocado en `components/ui/`,
  `login-form.tsx` ni `submit-button.tsx`.

## Estado final de los hallazgos

| Hallazgo | Estado |
| --- | --- |
| BLOQUEANTE-1 — R9 sin test que muerda | **cerrado** (dos `it`, mutacion repetida por el reviewer) |
| menor-1 — el pie de la tarjeta fuera de `design.md` | **cerrado** (`design.md > 6`) |
| menor-2 — R12 a medias | **cerrado** (opacidades, derivas, recorrido y escala) |
| menor-3 — `pointer-events` de R13 sin defender | **cerrado** (mas el apilado `z-index` 1 contra 2) |
| menor-4 — los 44 px no defendidos en el gate | **cerrado** (asercion positiva en unitario) |
| menor-5 — el anillo de foco por la via del `box-shadow` | **cerrado**, acotado a campo y boton con motivo |
| menor-6 — `e2e/theme.spec.ts` fragil en frio | **abierto a proposito**: no es de esta ficha. Los seis rojos son `page.goto` agotando 30 s en la compilacion bajo demanda; el gate no corre E2E. Curarlo (fijar timeout en ese archivo) es otra ficha |

## Trazabilidad final `R<n> -> test`

Cambia solo lo que la ronda 2 movio; el resto de la tabla de la ronda 1 sigue vigente.

| R | Test | Muerde |
| --- | --- | --- |
| R9 | `skin/1` > «declara los valores del insumo para el vidrio y las burbujas en los dos modos» + «conserva el filo de 1px y el brillo interior en la sombra de la tarjeta, tambien con transparencia reducida» | **si** (mutacion propia: `.dark` borrado mas sombra recortada -> 2 rojos; y un digito cambiado -> 1 rojo) |
| R12 | los dos de la ronda 1 + `skin/1` > «transcribe opacidad, deriva, recorrido y escala de cada burbuja tal como los da el insumo» | si |
| R13 | los dos de la ronda 1 + `skin/1` > «deja la capa de burbujas sin capturar el puntero y por debajo de la tarjeta» | si |
| R16 | los de la ronda 1 + `skin/1` > «fija 44px de alto en campo y boton, y 400px, 18px y 28px en la tarjeta del login» | si, **ahora tambien en el gate** |
| R20 | los dos de la ronda 1 + `skin/1` > «tampoco pisa el anillo de foco de campo y boton por la via del box-shadow» | si |

**26 de 26 requisitos verificados de verdad, cada uno por un test que enrojece si el codigo se
rompe.** `CHECKPOINTS.md > Trazabilidad` satisfecho.

## VEREDICTO: OK

Aprobada. Puede seguir el flujo de `AGENTS.md` (PR y merge), recordando la regla 5 de `CLAUDE.md`:
`./init.sh` completo **antes del PR** —corrido aqui, verde, 663/663—. Al cerrar quedan la entrada en
`progress/history.md` y el desmontaje del worktree.
