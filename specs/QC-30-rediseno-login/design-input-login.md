# QC-30 — Insumo de diseño (no es el spec)

> Lo escribe el **leader**. No es `requirements.md` ni `design.md`: es el material de entrada
> para que `spec_author` no invente valores ni re-abra lo que el humano ya cerró. Si algo de
> aquí contradice `docs/`, manda `docs/`.
>
> Origen: canvas de diseño aprobado por el humano el 2026-09-02
> (https://claude.ai/code/artifact/c4ed8cf9-649c-487b-a967-1cca4a83ff86), artboards
> «Login · modo oscuro», «Login · modo claro», «Login · móvil» y «Estados y medidas».
>
> **Esta ficha está bloqueada por QC-29** (`depends_on`). No arranca hasta que QC-29 esté
> `done`: se pinta con los tokens que esa ficha define, en los dos modos, y escribir su spec
> antes de que esos tokens existan sería especificar sobre arena.

## 1. Lo que NO cambia (y es la mitad del encargo)

El rediseño es de piel. El comportamiento del formulario está congelado desde QC-7 y esta
ficha **no lo toca**:

- La anatomía: tarjeta centrada en `min-h-svh`, campos Usuario y Contraseña, botón de envío,
  y el enlace de recuperación **en el pie de la tarjeta y fuera del `<form>`** (QC-7 R22).
  Meterlo dentro rompería el orden de tabulación entre la contraseña y el botón.
- El copy, que sale de constantes exportadas y nunca de literales:
  `GENERIC_CREDENTIALS_ERROR`, `REQUIRED_FIELD_ERROR`, `PASSWORD_TOO_LONG_ERROR`
  (`lib/modules/identity/adapters/driving/login-form-state.ts`). Los tests afirman sobre las
  constantes; el diseño solo cambia dónde y con qué color se pintan.
- Los cuatro estados que el formulario ya distingue: `idle`, `invalid` (error bajo el campo),
  `error` (credenciales, por toast) y el `pending` de `useFormStatus`.
- El campo **no controlado** y el `key={usernameFieldKey}` del campo de usuario: hay un
  comentario largo en `login-form.tsx` explicando por qué. **No lo conviertas en controlado**
  para pintar un estado visual; el prototipo del canvas sí lo hace, pero es un prototipo.
- La Server Action, el contrato `LoginFormState` y la lógica de autenticación.

## 2. Decisiones ya cerradas por el humano

| Decisión | Valor | Cuándo |
| --- | --- | --- |
| Vidrio esmerilado en la tarjeta | sí | 2026-09-02 |
| Fondo con burbujas ascendentes | sí | 2026-09-02 |
| Cuántas burbujas | **3**, grandes | 2026-09-02 |
| Velocidad | **media**: 17–19 s por ciclo | 2026-09-02 |
| Altura de campos y botón | 44 px | 2026-09-02 |

## 3. Vidrio esmerilado — valores del diseño

La tarjeta pasa de opaca a translúcida sobre el fondo animado. El degradado sigue siendo el
mismo 166° de la barra lateral, pero expresado en alfas:

| | Oscuro | Claro |
| --- | --- | --- |
| Fondo | `linear-gradient(166deg, rgba(27,59,57,0.74), rgba(19,48,50,0.66) 34%, rgba(15,36,38,0.62) 68%, rgba(9,26,28,0.58))` | `linear-gradient(166deg, rgba(255,255,255,0.82), rgba(246,252,251,0.72) 34%, rgba(236,247,245,0.66) 68%, rgba(223,239,237,0.60))` |
| Desenfoque | `backdrop-filter: blur(22px) saturate(150%)` | igual |
| Anillo | `0 0 0 1px rgba(168,220,217,0.16)` | `0 0 0 1px rgba(83,144,145,0.18)` |
| Brillo interior | `inset 0 1px 0 rgba(204,234,232,0.22)` y `inset 0 -1px 0 rgba(0,0,0,0.25)` | `inset 0 1px 0 rgba(255,255,255,0.90)` |
| Sombra | `0 34px 70px -24px rgba(0,0,0,0.80)` | `0 30px 60px -26px rgba(20,60,60,0.36)` |

**El filo de 1 px y el brillo interior superior no son decoración**: son lo que hace que se
lea como vidrio y no como una tarjeta a media opacidad. Si se recorta algo, que no sea eso.

`-webkit-backdrop-filter` va junto al estándar: sin él, Safari no aplica el desenfoque y la
tarjeta se ve translúcida y sucia, que es peor que opaca.

## 4. Burbujas — valores del diseño

Tres por pantalla, `position: absolute`, en una capa propia bajo la tarjeta
(`z-index` 1 contra 2) y con `pointer-events: none`.

| # | Escritorio | Móvil |
| --- | --- | --- |
| 1 | izq. 14%, Ø 54 px, 17 s, deriva +30 px, opacidad 0.30 | izq. 10%, Ø 46 px, 17 s, +24 px, 0.30 |
| 2 | izq. 52%, Ø 44 px, 19 s, deriva −26 px, opacidad 0.34 | izq. 48%, Ø 38 px, 19 s, −20 px, 0.34 |
| 3 | izq. 83%, Ø 60 px, 18 s, deriva +22 px, opacidad 0.26 | izq. 78%, Ø 52 px, 18 s, +18 px, 0.26 |

Relleno (oscuro): `radial-gradient(circle at 30% 27%, rgba(230,250,247,0.60), rgba(104,195,183,0.17) 44%, rgba(104,195,183,0.05) 72%)`,
borde `1px solid rgba(204,234,232,0.30)`, y las tres sombras que le dan volumen:
`inset -2px -3px 7px rgba(0,0,0,0.10), inset 3px 4px 8px rgba(255,255,255,0.16), 0 0 14px rgba(104,195,183,0.18)`.

En **claro** cambia el relleno, y no es opcional: burbujas blancas sobre fondo blanco no se
ven. `radial-gradient(circle at 30% 27%, rgba(255,255,255,0.92), rgba(104,195,183,0.34) 46%, rgba(83,144,145,0.13) 74%)`,
borde `rgba(83,144,145,0.24)`, halo `rgba(83,144,145,0.12)`.

Animación: suben desde `bottom: -60px` hasta −960 px (−900 en móvil), con la deriva lateral
aplicada al 55% a mitad de recorrido, escala de 0.86 a 1.06, y opacidad que entra al 12% y
sale al 82% del ciclo. **Los retardos son negativos** (0, −7 s, −13 s): al abrir la pantalla
ya hay movimiento repartido en toda la altura, en vez de tres burbujas saliendo del suelo a
la vez.

**`prefers-reduced-motion: reduce` las deja quietas al 22% de opacidad, no las borra.** Un
fondo que desaparece del todo cambia la composición para quien reduce movimiento; uno quieto
la conserva. Esto es requisito, no detalle.

## 5. Medidas — el punto que el spec tiene que decidir

Cinco filas difieren de lo que hay hoy, y **todas viven en `components/ui/`**, que es shadcn
sin editar:

| Qué | Diseño | Hoy | Dónde |
| --- | --- | --- | --- |
| Alto del campo | 44 px | `h-8` · 32 px | `components/ui/input.tsx` |
| Alto del botón | 44 px | `h-8` · 32 px | `components/ui/button.tsx` |
| Ancho de la tarjeta | 400 px | `max-w-sm` · 384 px | la página |
| Radio de la tarjeta | 18 px | `rounded-xl` · 14 px | `components/ui/card.tsx` |
| Padding interior | 28 px | `--card-spacing` · 16 px | `components/ui/card.tsx` |

Lo que **coincide** y no hay que tocar: radio de campo y botón (`rounded-lg`, 10 px), anillo
de foco de 3 px (`focus-visible:ring-3`), y la tipografía (Geist).

**QC-29 ya resolvió este mismo problema para la barra lateral** y su decisión es el
precedente que este spec debe seguir o contradecir explícitamente: subir alturas **sin editar
`components/ui/`**, con reglas en `globals.css` fuera de `@layer` (dentro de `@layer base`
pierden contra las utilidades y el test sale verde en falso). Léelo en
`specs/QC-29-tema-claro-oscuro/design.md` antes de decidir.

Y el aviso que importa: subir el input a 44 px por CSS global **cambia todos los inputs de la
aplicación**, no solo los del login. Si eso no se quiere, la alternativa es acotar la regla a
la pantalla de login. El spec elige, pero lo dice.

## 6. Lo que NO entra

- **Mostrar/ocultar contraseña, «recordarme», ilustración lateral.** No existen hoy. El
  diseño no los dibujó a propósito: añadirlos es alcance nuevo y lo pide el humano o no entra.
- **Cerrar el hueco de accesibilidad del toast.** `app/(public)/layout.tsx` deja escrito que
  el toast es el único canal del error de credenciales y que su duración de 8 s lo *mitiga*,
  no lo cierra. Este rediseño lo re-colorea. Cerrarlo —una región `aria-live` en la tarjeta—
  es otra ficha.
- Tocar la Server Action, el contrato de estados o la verificación de credenciales.

## 7. Trampas conocidas

- El prototipo del canvas usa campos **controlados** y un `setTimeout` para simular el envío.
  Es un prototipo: el repo usa `<form action>` con campos no controlados y `useFormStatus`.
  No copies la mecánica, copia la piel.
- `backdrop-filter` sobre una capa animada obliga al navegador a recomponer cada fotograma.
  Se bajó de 16 burbujas a 3 justamente por eso. Si el spec propone más, que diga por qué.
- El `<main>` de la página de login es el único landmark `main` de la zona pública: la
  composición nueva no puede introducir un segundo.
- Las burbujas son decorativas: no deben ser alcanzables por lector de pantalla ni por
  tabulación (`aria-hidden`, `pointer-events: none`).
