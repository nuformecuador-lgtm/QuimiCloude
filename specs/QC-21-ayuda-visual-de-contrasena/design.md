# QC-21 — ayuda-visual-de-contrasena · design.md

> Escrito el 2026-09-02 sobre el `requirements.md` sembrado por `/afinar-feature` ese mismo día.
> **La tabla de decisiones cerradas de ese archivo manda sobre este**: donde algo de aquí la
> contradijera, gana la tabla.
>
> **Esta ficha no tiene consumidor.** Hoy ninguna pantalla del producto fija o cambia una
> contraseña —el login solo verifica—. El primero será **QC-36 (`cambiar-mi-contrasena`)**, que
> aún no existe. Todo lo que este diseño dice sobre QC-36 es **contrato**, no lectura de su
> código: no hay código suyo que leer. Cómo se prueba algo que ninguna pantalla monta está en
> `> 8`, y es la pregunta que más condiciona el diseño.

## 1. Estado de partida (verificado en esta rama, no supuesto)

```
lib/modules/identity/index.ts                          # contrato: exporta CREDENTIAL_RULES,
                                                       # CredentialRule, evaluateCredentialRules,
                                                       # CREDENTIAL_MIN_LENGTH, CREDENTIAL_MAX_LENGTH
lib/modules/identity/domain/credential-policy.ts       # QC-19, mergeada. Pura y sincrona.
components/ui/{input,label,button,card}.tsx            # shadcn, sin editar
components.json · lib/utils.ts (`cn`) · Tailwind v4    # QC-10
vitest.config.mts · tests/setup.ts · Testing Library    # QC-10/QC-11
tests/guards/guard-password-never-plaintext.test.ts    # exporta findPlaintextPasswordDeclarations
```

Verificado leyendo los archivos, no asumido:

- `CREDENTIAL_RULES` son **siete** códigos en este orden exacto: `min_length`, `max_length`,
  `no_uppercase`, `no_lowercase`, `no_digit`, `no_symbol`, `breached`. Ese orden **es** el orden de
  presentación (R1); QC-19 lo declaró estable a propósito.
- `evaluateCredentialRules(candidate)` devuelve `{ ok, unmet }` **síncrono**, recorre el catálogo
  **saltándose `breached`** y no toca ningún puerto. Es lo que lo hace usable en el navegador (R2,
  R6).
- El barrel `lib/modules/identity/index.ts` solo reexporta de `./domain`: importarlo desde un
  componente de cliente **no arrastra servidor**, y hay un test de QC-19
  (`tests/unit/identity/credential-policy-contract.test.ts`) que ya lo vigila. R6 se apoya en eso.
- `components/ui/input.tsx` es `h-8` con `text-base md:text-sm`: **16 px en móvil**, así que el
  zoom de iOS no aplica; la altura de 44 px sigue pendiente de QC-29/QC-30 (pregunta abierta 4).
- **`components/shared/` no existe todavía.** Esta feature la crea; está declarada en
  `docs/architecture.md > Estructura de carpetas`.

Lo que **no** existe y este diseño no da por hecho: ninguna pantalla de cambio de contraseña,
ningún endpoint de cambio, ninguna Server Action que fije credenciales. Nada de QC-36.

## 2. Qué se construye

```
components/shared/credential-rule-labels.ts        # NUEVO — copy en una sola fuente (R15)
components/shared/credential-requirements.tsx      # NUEVO — la lista de siete (R1, R4, R7, R16)
components/shared/credential-field.tsx             # NUEVO — campo + lista + aviso al form (R10)
tests/unit/credential-requirements.test.tsx        # NUEVO
tests/unit/credential-field.test.tsx               # NUEVO — incluye el formulario de prueba
tests/unit/credential-help-contract.test.ts        # NUEVO — centinelas de texto (R2, R19, R21, R22)
```

**Ni rutas, ni páginas, ni layouts, ni Server Actions, ni tablas, ni migraciones, ni RLS, ni
variables de entorno, ni dependencias nuevas** (R19). Nada de `db/`, nada de `app/`, nada de
`lib/`.

### 2.1 Dónde vive: `components/shared/`, y por qué no en `app/`

`docs/architecture.md > Componentes` dice que un componente se promueve a `shared/` cuando **dos**
features lo necesitan. Aquí lo necesitan **cero**, y aun así va a `shared/`: la fila 1 de la tabla
de decisiones cerradas pide explícitamente «solo el componente reutilizable», y la alternativa
—`app/<ruta>/components/`— exigiría inventar una ruta que es alcance de QC-36. Se elige la única
ubicación que no obliga a crear producto que nadie aprobó. Está anotado como deuda consciente en
`> 10`.

**Efecto lateral que hay que decir en voz alta:** `guard-password-never-plaintext` barre `db/`,
`lib/`, `app/` y `scripts/` — **no barre `components/`**. Es decir, la guardia **no** vigilaría un
prop llamado `password` en estos archivos. Por eso R22 no confía en la guardia: el test de
contrato (`> 8.3`) **importa `findPlaintextPasswordDeclarations` de la propia guardia** y la aplica
a los archivos nuevos. Se reutiliza el criterio, no se copia: si la guardia cambia de criterio,
este test cambia con ella. Los nombres del módulo dicen `credential` y el parámetro se llama
`candidate`, igual que en QC-19: **se adaptan los nombres, no se relaja la guardia.**

## 3. Contratos de entrada/salida

### 3.1 Estado de una regla — tres valores, no dos

```ts
// components/shared/credential-requirements.tsx
export type CredentialRuleState = 'met' | 'unmet' | 'unknown';
```

`'unknown'` es el estado neutro de R7/R8 y **es el valor por defecto de `breached`**, no `'unmet'`.
La diferencia no es estética: mostrar la séptima en rojo antes de preguntar al servidor acusa a
quien escribe de algo que nadie ha comprobado, y mostrarla en verde promete algo que nadie ha
comprobado. Neutro es lo único cierto.

**El tipo vive en la UI, no en el dominio.** QC-19 está `done` y su `CredentialPolicyResult` no
tiene concepto de «pendiente»: `unmet` es una lista de códigos incumplidos, y punto. Meter
`'unknown'` en `lib/modules/identity` sería contaminar el dominio con un estado que solo existe
porque hay una pantalla intermedia.

### 3.2 `CredentialRequirements` — presentacional puro

```ts
type CredentialRequirementsProps = {
  readonly candidate: string;
  /** Veredicto del servidor sobre la septima. Por defecto: 'unknown' (R8). */
  readonly breachedState?: CredentialRuleState;
  readonly labels?: Partial<Record<CredentialRule, string>>;
  readonly id?: string;
};
```

- Sin `useState`, sin `useEffect`, sin `fetch`. Deriva todo en el render:
  `const { unmet } = evaluateCredentialRules(candidate)`.
- Recorre **`CREDENTIAL_RULES` importado** (R1, R3): `rule === 'breached' ? breachedState :
  unmet.includes(rule) ? 'unmet' : 'met'`.
- Marcado: `<ul>` con un `<li data-rule={rule} data-state={state}>` por regla, y dentro un texto de
  estado accesible además del icono (R16 — **no solo color**; `docs/architecture.md` prohíbe que
  `:hover` o el color sean el único canal).
- No recibe la candidata para mostrarla: la usa solo como argumento de la función pura y **no la
  escribe en ningún atributo ni texto** (R21).

### 3.3 `CredentialField` — el que compone y avisa al formulario

```ts
type CredentialFieldProps = {
  readonly name: string;            // clave en el FormData; la elige el consumidor
  readonly label: string;
  readonly id?: string;
  readonly autoComplete?: 'new-password';
  readonly breachedState?: CredentialRuleState;
  readonly labels?: Partial<Record<CredentialRule, string>>;
  /** Se invoca al montar y cada vez que cambia si las SEIS se cumplen (R10). */
  readonly onOwnRulesMetChange?: (met: boolean) => void;
};
```

- `<Input type="password">` (R17), **no controlado por el consumidor**: el componente guarda la
  candidata en un `useState` propio, alimentado desde el `onChange` del input. El input conserva su
  `name`, así que el `<form action>` lo envía como siempre y el consumidor **nunca toca el texto en
  claro** — que es exactamente lo que se quiere de un valor sensible: que tenga un solo dueño.
- `onOwnRulesMetChange` se invoca desde un `useEffect` con dependencia en el booleano derivado, no
  en el texto: se dispara al montar (con `false`, campo vacío) y solo cuando el veredicto cambia,
  no en cada pulsación. Sin eso, el consumidor tendría que **adivinar** el estado inicial, y
  adivinar «habilitado» es exactamente el fallo que R11 quiere impedir.
- **No ofrece mostrar/ocultar** (R17) mientras la pregunta abierta 2 siga abierta. QC-30 lo dejó
  fuera de su alcance por escrito (`design-input-login.md > 6`), así que tampoco hay dónde
  heredarlo.
- `aria-describedby` del input apunta al `id` de la lista: al enfocar el campo, un lector de
  pantalla lee los requisitos (ver `> 6`).

### 3.4 El copy (R15)

```ts
// components/shared/credential-rule-labels.ts
export const CREDENTIAL_RULE_LABELS: Readonly<Record<CredentialRule, string>> = { /* … */ };
```

Un único mapa exportado, indexado por código, **sustituible entera o parcialmente por el prop
`labels`**. Los tests afirman contra la constante, nunca contra un literal — es el precedente que
QC-7 fijó con `GENERIC_CREDENTIALS_ERROR` y que QC-30 recuerda (`design-input-login.md > 1`).

**El texto concreto sigue siendo pregunta abierta 1**, y este diseño no la cierra: decide el
**mecanismo** (una fuente, indexada por código, sustituible), no la **redacción** ni si el producto
será multi-idioma. El archivo lleva en cabecera que la redacción es provisional y que cambiarla es
un cambio de una línea sin tocar componentes ni tests de comportamiento. Si mañana entra i18n, este
mapa es el punto exacto donde se enchufa.

## 4. El bloqueo del envío es parcial — y es la conducta correcta

Secuencia completa, con los tres estados que el formulario consumidor atraviesa:

| # | Situación | Las seis | La séptima | Control de envío |
| --- | --- | --- | --- | --- |
| 1 | Campo vacío o incompleto | alguna `unmet` | `unknown` | **deshabilitado** (R11) |
| 2 | Las seis en verde, sin enviar todavía | todas `met` | `unknown` | **habilitado** (R12) |
| 3 | Enviado y rechazado por filtrada | todas `met` | `unmet` | **habilitado** (R13) |

La fila 2 es el estado que la ficha obliga a describir: **el botón se activa aunque la contraseña
esté filtrada**. No es un agujero, es la consecuencia aceptada de no consultar al servidor por
pulsación (fila 2 de la tabla de decisiones). El rechazo llega del servidor y aterriza en la fila 3.

La fila 3 deja el botón habilitado a propósito: deshabilitarlo dejaría al usuario delante de un
formulario muerto, y la candidata **sigue cumpliendo las seis** — lo que ha cambiado es un hecho
sobre esa cadena, no sobre las reglas locales. Reintentar con la misma cadena volverá a fallar en
el servidor, que es donde debe fallar.

**Quién decide, en una frase:** el componente **informa**; el formulario consumidor **decide**. El
componente no renderiza el botón de envío ni lo deshabilita —no es suyo—, y por eso R11/R12 se
verifican contra un formulario, no contra el componente aislado (`> 8.2`).

## 5. Lo que el componente NO hace, y su prueba negativa

- **No consulta al servidor mientras se escribe** (R6). El diccionario de filtradas pesa 1,63 MiB y
  vive en el adaptador driven; el componente no lo importa ni directa ni transitivamente. Prueba:
  el test de contrato comprueba que ningún archivo nuevo importa `@/lib/composition`,
  `adapters/driven/**` ni `next/headers`, y el test de comportamiento espía `globalThis.fetch` y
  exige **cero llamadas** tras escribir.
- **No puntúa fuerza** (R20). Sin barra, sin «débil/fuerte», sin porcentaje. Heredado de QC-19.
- **No re-declara reglas** (R2). Prueba: los archivos nuevos no contienen ningún literal numérico
  de longitud ni ninguna expresión regular de composición, y el estado mostrado coincide, para una
  tabla de candidatas, con lo que devuelve `evaluateCredentialRules`.
- **No emite la candidata** (R21). Sin `console.*`, sin `defaultValue`, sin `value` reflejado en
  atributos de la lista, sin la candidata en los textos.

## 6. Accesibilidad: posición provisional y declarada (pregunta abierta 3)

Lo que se hace: `<ul>`/`<li>` reales, `aria-describedby` del input hacia la lista, y estado por
`data-state` **más** un texto accesible por entrada, nunca solo por color o icono.

Lo que **no** se hace, y por qué se dice aquí en vez de descubrirlo en la review: **no se añade
región `aria-live`**. Una lista de siete entradas que cambia de estado en cada pulsación dentro de
una región viva es precisamente el «puede volverse ruidosa» de la pregunta abierta 3, y el repo no
tiene precedente que copiar. Elegir el silencio es reversible en una línea; elegir el ruido obliga
a rediseñar el anuncio. **La pregunta sigue abierta**: falta decidir si hace falta anuncio, con qué
granularidad y con qué retardo.

**Multiplataforma** (`docs/architecture.md > Regla: multiplataforma`): la lista es **siempre
visible**, no un tooltip ni un `:hover` (R5) — un tooltip sería inalcanzable en táctil; no hay
ningún control interactivo nuevo, así que la regla de 44x44 px no aplica a esta feature salvo por
el propio input, que es shadcn sin editar (pregunta abierta 4). **No se declara ninguna excepción
de escritorio**: no hace falta.

## 7. Dependencias de terceros: **ninguna**

Esta feature **no añade ninguna dependencia**. Todo lo que necesita ya está aprobado y en
`docs/dependencias.md`: React, Testing Library, Tailwind, shadcn/ui y el módulo `identity` del
propio repo. Los cuatro checks de `docs/architecture.md > Dependencias de terceros` **no aplican
porque no hay nada que proponer** — se dice explícitamente para que la ausencia no se lea como
olvido. `@zxcvbn-ts/language-common` ya está instalado por QC-19 y **este componente no lo importa**
(R6): entra por el adaptador de servidor y solo por ahí.

## 8. Verificación — cómo se prueba algo que ninguna pantalla monta

Es la pregunta central de la ficha. Tres niveles, ninguno en navegador (fila 4 de la tabla:
**E2E diferido con motivo, no se reabre**).

### 8.1 Componente aislado — `credential-requirements.test.tsx`

Render directo con `candidate` y `breachedState` como props. Cubre el catálogo y su orden (R1, R3),
el marcado en vivo (R4, R5), los tres estados (R7, R8, R9, R16), el copy desde la constante y su
sustitución (R15) y las negativas (R20, R21). El test **itera `CREDENTIAL_RULES` importado**: si
QC-19 añade una regla, el test lo exige sin editarse (R3).

### 8.2 El formulario de prueba — `credential-field.test.tsx`

R11, R12 y R13 hablan del **formulario consumidor**, que hoy no existe. Se prueban con un
`<form>` mínimo **declarado dentro del propio archivo de test**: monta `<CredentialField>`, guarda
en estado lo que llega por `onOwnRulesMetChange` y lo aplica al `disabled` de un botón de envío. Es
literalmente el cableado que QC-36 tendrá que escribir, así que el test es a la vez verificación y
**documentación ejecutable del contrato de integración**.

**Vive en el test, no en `app/`.** Un formulario de demostración en producción sería una pantalla
que nadie aprobó, sin ruta, sin permisos y sin Server Action — y la fila 1 de la tabla dice
«solo el componente reutilizable». Lo que no se puede es probar R11–R13 sin formulario alguno: el
bloqueo del envío no es observable en un componente que no renderiza el botón.

Interacciones con `@testing-library/user-event` (precedente de QC-11 T16), no con `fireEvent`.

### 8.3 Centinelas de texto — `credential-help-contract.test.ts`

Al estilo de `tests/unit/identity/credential-policy-contract.test.ts`: lee los archivos nuevos y
afirma sobre lo que **declaran**, no sobre lo que hacen.

- R2: sin regex de composición ni literales de longitud propios.
- R6: sin `@/lib/composition`, sin `adapters/driven/**`, sin `next/headers`, sin `'use server'`.
- R19: la feature no añadió nada bajo `app/`, `db/` ni `lib/` (diff de archivos nuevos).
- R21: sin `console.` en los archivos nuevos.
- R22: `findPlaintextPasswordDeclarations` —**importada de la guardia**— devuelve vacío para cada
  archivo nuevo.

### 8.4 Lo que estos tests NO demuestran

Que la ayuda **se entienda**. jsdom verifica estructura y estado, no si una persona lee la lista y
sabe qué le falta. Eso lo dirá la primera revisión visual real, que es de QC-36. Dicho aquí y no
descubierto en la review.

## 9. Alternativas descartadas

**(a) Re-declarar las reglas en el componente (un `zod` o un array local con sus mensajes).** Es lo
más rápido: un array de `{ test, mensaje }` y a pintar. **Descartado por la fila 5 de la tabla de
decisiones**, y con la razón que QC-19 dejó escrita: sería una segunda copia de la política, que se
desincroniza el día que cambie el mínimo de 8 caracteres, y el desfase lo descubriría un usuario al
ver «cumple» en verde y recibir un rechazo del servidor. `evaluateCredentialRules` es pura y
síncrona **precisamente para esto**.

**(b) Consultar `breached` al servidor según se escribe (debounce + Server Action).** Daría las
siete reglas en vivo y un bloqueo total en vez de parcial. Descartado por la fila 2 de la tabla:
mete red en el camino de teclear, expone una candidata parcial en cada petición, y obliga a decidir
qué hacer cuando la red falla —o bloqueas por algo que no comprobaste, o abres la mano en silencio,
que es el fail-open que QC-19 rechazó explícitamente—. La alternativa de bajar el diccionario al
navegador es peor: 1,63 MiB al bundle para una comprobación que el servidor repite igualmente.

**(c) Mostrar `breached` como cumplida hasta que el servidor diga lo contrario (dos estados en vez
de tres).** Simplifica el tipo y el marcado. Descartado: sería una promesa falsa —verde significa
«comprobado y correcto»— y además haría **indistinguible** el caso «aún no se sabe» del caso «se
comprobó y está bien», que es justo la información que el usuario necesita para entender por qué el
envío puede fallar. La fila 2 de la tabla pide «estado neutro» de forma literal.

**(d) Que el componente controle también el botón de envío (renderizarlo él, o recibirlo como
`children`).** Cerraría R11–R13 sin formulario de prueba. Descartado: convertiría una ayuda visual
en un mini-formulario con opinión sobre el envío, y QC-36 dejaría de poder decidir su propio
layout, su `pending` de `useFormStatus` y su manejo de errores. El componente informa; el formulario
decide (`> 4`).

**(e) Campo controlado desde el consumidor (`value` + `onChange` por props).** Es el patrón React
más común. Descartado por dos motivos: obligaría a QC-36 a tener el texto en claro en el estado de
su página —más sitios donde vive un secreto, más sitios donde puede filtrarse a un log— y va contra
el precedente del repo, que usa campos **no controlados** dentro de `<form action>` (QC-7,
`login-form.tsx`). Aquí el `useState` interno es inevitable —el marcado en vivo necesita el valor en
cada pulsación—, pero se queda **dentro** del componente y el input sigue enviándose por `name`.

**(f) Una pantalla de demostración en `app/(private)/` para poder verlo.** Tentador, porque el
componente no lo ve nadie hasta QC-36. Descartado por la fila 1 de la tabla: sería producto no
aprobado, sin permisos y sin Server Action, y habría que borrarlo al llegar QC-36. La deuda —que
nadie lo vea— está aceptada por escrito y es la misma que arrastran los 5 ítems del sidebar de
QC-11.

**(g) Meter `'unknown'` en `CredentialPolicyResult`, en el dominio.** Unificaría el vocabulario.
Descartado: QC-19 está `done`, y «pendiente de comprobar» es un estado de una interfaz que
pregunta por partes, no de una política que responde entera. El dominio no debe conocer que existe
una pantalla intermedia.

## 10. Riesgos y deudas que esta feature deja anotadas

- **Nadie ve el componente hasta QC-36.** Deuda aceptada en la fila 1 de la tabla. Riesgo real: un
  componente sin uso real puede tener una API incómoda que solo se descubre al integrarlo. Se
  mitiga con el formulario de prueba de `> 8.2`, que es el cableado real, pero no se elimina.
- **Sin E2E** (fila 4). Cuando exista QC-36, el E2E del flujo de cambio es de esa ficha.
- **`components/shared/` se estrena con un componente que usa una sola feature futura**, contra la
  regla «se promueve cuando dos lo necesitan». Declarado en `> 2.1`, no silenciado.
- **`guard-password-never-plaintext` no barre `components/`** (`> 2.1`). R22 lo cubre con un test
  propio, pero **solo para los archivos de esta feature**: cualquier otro componente del repo sigue
  fuera del barrido. Ampliar la guardia es una mejora del arnés (`/afinar-regla`), no de esta ficha.
- **La redacción del copy es provisional** (pregunta abierta 1) y la conducta de anuncio accesible
  también (pregunta abierta 3). Ambas están acotadas a un archivo y a un atributo, respectivamente.
- **Las medidas del campo dependen de QC-29/QC-30** (pregunta abierta 4).
