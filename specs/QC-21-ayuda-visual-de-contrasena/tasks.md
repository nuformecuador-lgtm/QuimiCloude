# QC-21 — ayuda-visual-de-contrasena · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica sus
dependencias y su **criterio de hecho** (verificable, no «parece bien»). Un commit por task,
formato `docs/conventions.md > Commits`.

**Recordatorio de gate** (`docs/verification.md` + `AGENTS.md > Regla del gate`): el subagente de
implementación corre **solo** `pnpm run typecheck`, `pnpm run lint` y
`pnpm exec vitest related --run <sus archivos>`. **No corre la suite completa.**
`./init.sh --rapido` lo corre el **leader** al cerrar cada tanda; `./init.sh` **completo**, al
cerrar la feature y **antes del PR, sin excepción**.

**Esta feature no toca `app/`, `db/`, `lib/` ni `components/ui/`.** Si una task parece necesitarlo,
está mal entendida: parar y avisar al leader.

---

## Bloque 0 — Precondiciones heredadas

### [x] T0 — Verificar lo heredado de QC-10, QC-11 y QC-19 (BLOQUEA TODO)
- **Depende de**: nada. Es la primera.
- **Qué**: comprobar, uno por uno, que existen en este worktree y **no re-crearlos**:
  1. `components.json` (shadcn inicializado) y `lib/utils.ts` exportando `cn`.
  2. `components/ui/input.tsx`, `label.tsx` y `button.tsx`.
  3. `vitest.config.mts` + `tests/setup.ts` con Testing Library, y `pnpm test` arrancando en verde.
  4. `lib/modules/identity/index.ts` exportando **`CREDENTIAL_RULES`**, **`CredentialRule`** y
     **`evaluateCredentialRules`**; `CREDENTIAL_RULES` con **siete** códigos en el orden
     `min_length, max_length, no_uppercase, no_lowercase, no_digit, no_symbol, breached`.
  5. `tests/guards/guard-password-never-plaintext.test.ts` exportando
     **`findPlaintextPasswordDeclarations`** (lo usa T7).
- **Si falta cualquiera de los cinco: PARAR y avisar al leader.** No se «arregla» corriendo
  `shadcn init`, montando Vitest ni copiando reglas de QC-19: duplicar eso es exactamente lo que
  `design.md > 9(a)` descarta.
- **Hecho cuando**: los cinco puntos están verificados y anotados con su evidencia en
  `progress/impl_QC-21-ayuda-visual-de-contrasena.md`.

---

## Bloque 1 — Componentes

### [x] T1 — `components/shared/credential-rule-labels.ts` (copy en una sola fuente)
- **Depende de**: T0.
- **Qué**: `CREDENTIAL_RULE_LABELS: Readonly<Record<CredentialRule, string>>`, indexado por los
  siete códigos importados del contrato de `identity` (R15). Cabecera obligatoria: la **redacción
  es provisional** y es la **pregunta abierta 1** de `requirements.md`; cambiarla es un cambio de
  una línea que no toca componentes ni tests de comportamiento.
- **Hecho cuando**: `pnpm run typecheck` pasa, el tipo obliga a cubrir **los siete** códigos
  (quitar uno no compila — verificación deliberada, se revierte) y el archivo **no** contiene
  ninguna regla, umbral ni expresión regular.

### [x] T2 — `components/shared/credential-requirements.tsx` (la lista)
- **Depende de**: T1.
- **Qué**: componente `'use client'` según `design.md > 3.2`. Exporta `CredentialRuleState`
  (`'met' | 'unmet' | 'unknown'`). Recorre **`CREDENTIAL_RULES` importado** (R1, R3), deriva las
  seis de `evaluateCredentialRules(candidate)` (R2, R4) y pinta la séptima con `breachedState`,
  **por defecto `'unknown'`** (R7, R8, R9). `<ul>`/`<li>` con `data-rule`, `data-state` y **texto de
  estado accesible además del icono** (R16). Sin `useState`, sin `useEffect`, sin `fetch`, sin
  puntuación de fuerza (R20).
- **Hecho cuando**: typecheck y lint limpios; el archivo **no contiene** ningún literal numérico de
  longitud, ninguna expresión regular, ningún `console.`, ninguna importación de
  `@/lib/composition`, `adapters/driven/**` ni `next/*`, y **no escribe la candidata** en ningún
  atributo ni texto (grep explícito antes de commitear).

### [x] T3 — `components/shared/credential-field.tsx` (campo + aviso al formulario)
- **Depende de**: T2.
- **Qué**: componente `'use client'` según `design.md > 3.3`. `<Label>` + `<Input type="password">`
  con `name` recibido por props (R17), `useState` **interno** con la candidata —el consumidor nunca
  la ve (`design.md > 9(e)`)—, `<CredentialRequirements>` debajo, `aria-describedby` del input hacia
  el `id` de la lista (`design.md > 6`), y `onOwnRulesMetChange` invocado **al montar y solo cuando
  cambia** el booleano derivado (R10). **Sin** control de mostrar/ocultar (R17, pregunta abierta 2).
- **Hecho cuando**: typecheck y lint limpios; el efecto depende del **booleano**, no del texto
  (verificado leyendo el array de dependencias); el componente **no** renderiza ningún botón de
  envío (`design.md > 9(d)`); sin `console.`, sin `defaultValue`, sin `fetch`.

---

## Bloque 2 — Tests

### [x] T4 — [P] `tests/unit/credential-requirements.test.tsx`
- **Depende de**: T2.
- **Qué**: render directo con props. **Itera `CREDENTIAL_RULES` importado**, nunca una lista
  escrita en el test (R1, R3). Cubre: orden del catálogo; campo vacío (R5); tabla de candidatas
  cuyo estado mostrado se compara **contra `evaluateCredentialRules`** y no contra estados escritos
  a mano (R2, R4) — salvo el caso de la cadena vacía, que desde la corrección de R5 del 2026-09-02
  se afirma contra un **mapa literal** de estados esperados, que es el segundo oráculo que ese
  requisito permite (m-5 de la review); la séptima neutra por defecto (R7, R8) e incumplida cuando llega el veredicto
  (R9); tres estados distinguibles sin color (R16); copy desde `CREDENTIAL_RULE_LABELS` y su
  sustitución por el prop `labels` (R15); negativas de fuerza (R20) y de emisión de la candidata
  (R21).
- **Hecho cuando**: cubre R1–R5, R7–R9, R15, R16, R20, R21 y
  `pnpm exec vitest related --run components/shared/credential-requirements.tsx` sale verde.
- **Nota**: los asserts van sobre `data-rule`, `data-state`, roles ARIA y **constantes exportadas**,
  nunca sobre literales de copy (precedente QC-11 T15, QC-30 §1).

### [x] T5 — `tests/unit/credential-field.test.tsx` (incluye el formulario de prueba)
- **Depende de**: T3.
- **Qué**: declarar **dentro del propio archivo de test** el formulario mínimo de
  `design.md > 8.2` —`<CredentialField>` + botón de envío cuyo `disabled` sale de
  `onOwnRulesMetChange`— y recorrer con `@testing-library/user-event` (no `fireEvent`) las tres
  filas de la tabla de `design.md > 4`:
  1. candidata incompleta → envío **deshabilitado** (R11);
  2. las seis en verde → envío **habilitado con la séptima neutra** (R12);
  3. veredicto de filtrada → séptima incumplida, seis intactas, envío **sigue habilitado** (R13).
  Además: aviso al montar y solo al cambiar (R10); espía de `globalThis.fetch` con **cero llamadas**
  tras escribir (R6); el input oculta el texto y no hay control de mostrar/ocultar (R17); nada del
  servidor entra por otra vía que props (R14); el flujo completo corre en jsdom sin red, sin
  navegador y sin base (R18).
- **Hecho cuando**: cubre R6, R10–R14, R17, R18 y
  `pnpm exec vitest related --run components/shared/credential-field.tsx` sale verde.
- **El formulario de prueba NO se mueve a `app/`** bajo ningún concepto (`design.md > 9(f)`).

### [x] T6 — [P] `tests/unit/credential-help-contract.test.ts` (centinelas de texto)
- **Depende de**: T1, T2, T3.
- **Qué**: al estilo de `tests/unit/identity/credential-policy-contract.test.ts`, leer los archivos
  nuevos y afirmar sobre lo que **declaran**:
  - R2: sin regex de composición ni literales de longitud propios;
  - R6/R14: sin `@/lib/composition`, sin `adapters/driven/**`, sin `next/headers`, sin `'use server'`;
  - R19: la feature no añadió **nada** bajo `app/`, `db/` ni `lib/`, ni ninguna migración;
  - R21: sin `console.` en ningún archivo nuevo;
  - R22: `findPlaintextPasswordDeclarations` —**importada de la guardia**, no copiada— devuelve
    vacío para cada archivo nuevo.
- **Hecho cuando**: cubre R2, R6, R14, R19, R21, R22 y pasa en verde. El test **falla** si se le
  añade a mano un archivo de prueba con un prop `password` (verificación deliberada, se revierte).

---

## Bloque 3 — Cierre

### [x] T7 — Mapa de trazabilidad `R<n> → test`
- **Depende de**: T4, T5, T6.
- **Qué**: volcar la tabla de abajo, ya con los nombres reales de los tests, en
  `progress/impl_QC-21-ayuda-visual-de-contrasena.md`, junto con los archivos tocados y la salida
  real de los tests.
- **Hecho cuando**: **los 22 requisitos (R1–R22)** tienen al menos un test nombrado. Un hueco es
  hallazgo bloqueante del reviewer (`CHECKPOINTS.md > Trazabilidad`).

### T8 — Gate completo y PR
- **Depende de**: T7.
- **Hecho cuando**: `./init.sh` (completo, sin flags) termina en verde —**lo corre el leader**—,
  `progress/impl_QC-21-ayuda-visual-de-contrasena.md` tiene el mapa `R<n> → test` y la salida real
  de los tests, y el PR está abierto contra `dev` con título
  `feat(QC-21-ayuda-visual-de-contrasena): …`.

---

## Mapa de trazabilidad previsto (`R<n> → test`)

| Req | Test previsto | Archivo |
| --- | --- | --- |
| R1 | `renderiza una entrada por cada codigo de CREDENTIAL_RULES y en su orden` | credential-requirements.test.tsx |
| R2 | `el estado mostrado de las seis coincide con evaluateCredentialRules para cada candidata` + `no declara ninguna regla ni umbral propio` | credential-requirements.test.tsx + credential-help-contract.test.ts |
| R3 | `la lista sale del catalogo importado, no de una copia local` | credential-requirements.test.tsx |
| R4 | `al cambiar la candidata cada una de las seis pasa a cumplida o incumplida` | credential-requirements.test.tsx |
| R5 | `con la candidata vacia la lista es visible sin interaccion y muestra cinco incumplidas con max_length cumplida` | credential-requirements.test.tsx |
| R6 | `escribir no dispara ninguna peticion de red` + `no importa composicion, adaptadores ni servidor` | credential-field.test.tsx + credential-help-contract.test.ts |
| R7 | `la regla de filtradas arranca en estado neutro` | credential-requirements.test.tsx |
| R8 | `sin veredicto del servidor la regla de filtradas nunca sale cumplida ni incumplida` | credential-requirements.test.tsx |
| R9 | `con el veredicto de filtrada la septima sale incumplida y las seis no cambian` | credential-requirements.test.tsx |
| R10 | `avisa al montar y solo cuando cambia si las seis se cumplen` | credential-field.test.tsx |
| R11 | `mientras falte alguna de las seis el control de envio esta deshabilitado` | credential-field.test.tsx |
| R12 | `con las seis en verde el envio se habilita aunque la septima siga neutra` | credential-field.test.tsx |
| R13 | `tras el rechazo por filtrada las seis siguen en verde y el envio sigue habilitado` | credential-field.test.tsx |
| R14 | `el veredicto del servidor solo entra por props` + `no hay ninguna via de lectura de servidor` | credential-field.test.tsx + credential-help-contract.test.ts |
| R15 | `el texto de cada regla sale de CREDENTIAL_RULE_LABELS` + `el prop labels sustituye el texto de una regla` | credential-requirements.test.tsx |
| R16 | `cada entrada expone su estado de forma consultable y con texto, no solo por color` | credential-requirements.test.tsx |
| R17 | `el campo oculta la candidata y no ofrece control de mostrar u ocultar` | credential-field.test.tsx |
| R18 | `el flujo completo se ejercita en un formulario de prueba sin red ni servidor` | credential-field.test.tsx |
| R19 | `la feature no anade rutas, paginas, acciones ni migraciones` | credential-help-contract.test.ts |
| R20 | `no muestra ninguna puntuacion ni barra de fuerza` | credential-requirements.test.tsx |
| R21 | `no emite la candidata en ningun atributo ni texto` + `ningun archivo nuevo usa console` | credential-requirements.test.tsx + credential-help-contract.test.ts |
| R22 | `ningun identificador nuevo nombra la contrasena sin acabar en hash` | credential-help-contract.test.ts |

Ningún requisito queda huérfano: R1–R22, sin saltos.

---

## Checklist de `CHECKPOINTS.md`: qué aplica «no aplica» (declararlo, no omitirlo)

- **Datos y seguridad (Supabase)** — tablas, RLS + `FORCE`, migraciones con `down.sql`,
  `db:rollback`, acceso solo por Prisma, secretos por entorno, webhooks: **NO APLICA**. La feature
  no crea ni consulta ninguna tabla y no añade ninguna variable de entorno (R19).
- **Autorización validada en el service con su test**: **NO APLICA**. No hay service, ni permiso, ni
  dato de nadie que leer: el único dato es el que la persona está escribiendo en su propio campo.
- **Módulos hexagonales**: aplica solo en la dirección de entrada — los componentes importan el
  **barrel** `@/lib/modules/identity`, nunca ruta profunda, nunca `lib/composition` ni un adaptador
  driven (`docs/architecture.md > La regla de dependencias`, fila `components/**`). Lo vigilan
  `guard-arquitectura-modulos` y T6.
- **Componentes `private/` reciben datos por props**: **APLICA POR ANALOGÍA** y es requisito duro
  (R14), aunque el componente viva en `components/shared/` (`design.md > 2.1`): no fetchea nada.
- **Mutaciones internas usan Server Actions**: **NO APLICA**, esta feature no muta nada (R19).
- **E2E de flujo crítico**: **NO APLICA**, diferido con motivo escrito en la fila 4 de la tabla de
  decisiones cerradas. **No se reabre.** El E2E del cambio de contraseña es de QC-36.
- **Multiplataforma (web, iOS, Android)**: **SÍ APLICA** y se cumple sin excepción declarada
  (`design.md > 6`): lista siempre visible, nada dependiente de `:hover`, sin controles nuevos, sin
  editar `components/ui/`.
- **Dependencias**: **NO APLICA**, la feature no añade ninguna (`design.md > 7`).

## Deudas y notas que esta feature deja registradas (no silenciosas)

- **Nadie ve el componente hasta QC-36** (fila 1 de la tabla). Que el leader lo anote en
  `progress/current.md > Deudas y cosas abiertas`, igual que los 5 ítems del sidebar de QC-11.
- **Sin E2E** (fila 4), diferido con motivo.
- **`components/shared/` se estrena con un componente que hoy usa cero features**
  (`design.md > 2.1`).
- **`guard-password-never-plaintext` no barre `components/`**: R22 lo cubre solo para los archivos
  de esta feature. Ampliar la guardia es material de `/afinar-regla`, no de esta ficha.
- **Cuatro preguntas abiertas** en `requirements.md`: copy y multi-idioma (1), mostrar/ocultar (2),
  anuncio a lector de pantalla (3) y medidas del campo (4). Las tres primeras vienen de la
  acotación; la cuarta la abre el diseño. **Si al implementar aparece una ambigüedad nueva, el
  subagente para y la reporta al leader**; no la rellena con supuestos (regla 6 de `CLAUDE.md`).
