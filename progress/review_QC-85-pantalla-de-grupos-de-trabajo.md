# QC-85 — pantalla-de-grupos-de-trabajo · review

> Revisor: `reviewer`. Fecha: 2026-09-12. Rama `feature/QC-85-pantalla-de-grupos-de-trabajo`,
> worktree `.worktrees/QC-85-pantalla-de-grupos-de-trabajo/`.
>
> **Método.** No se editó código. Todo lo que aquí se afirma se midió en este worktree: la suite
> completa se corrió de nuevo (no se confió en la bitácora), el alcance se auditó contra el árbol
> de trabajo, y **ocho aserciones se mutaron una a una para comprobar que caen**. Las restauraciones
> se verificaron con `git status` después de cada mutación.
>
> **Veredicto: APROBADO con condiciones.** 2 mayores (ninguno es un defecto del código entregado;
> los dos son condiciones de cierre), 4 menores, 8 mutaciones probadas y las 8 muerden.

---

## 1. Checklist

### Especificación
- [x] `requirements.md` con 43 requisitos EARS numerados `R1`–`R43` y las 13 decisiones cerradas.
- [x] `design.md` con alternativas descartadas y su porqué (seis: A–F, § 11).
- [~] `tasks.md` con 15 tasks. **T1–T14 marcadas `[x]`; T15 NO.** Declarado a propósito en la
      bitácora § 13 (el gate completo no lo corre el implementer). Ver menor-1.

### Trazabilidad
- [x] **Los 43 `R<n>` mapean a un test concreto**, y el mapa de la bitácora § 14 usa nombres reales
      de caso, no previstos. Se abrieron los 16 archivos de `tests/unit/configuracion-ui/grupos/`
      más el E2E.
- [x] **Ningún test hueco.** Barrido completo: 211 `it(...)` y 507 `expect(...)` en la carpeta
      `grupos/` (media 2.4 aserciones por caso); cero `it.skip`, cero `it.todo`, cero cuerpos
      vacíos, cero `expect(true)`. El E2E aporta 65 `expect` más.
- [x] `progress/impl_QC-85-pantalla-de-grupos-de-trabajo.md` contiene el mapa `R<n> -> test`.

### Verificación ejecutable (corrida por el revisor, no leída)
- [x] `pnpm exec vitest run tests/unit/configuracion-ui tests/unit/navegacion tests/guards`
      → **88 archivos · 1231 pasan · 15 saltados · 0 rojos**. Coincide con la bitácora § 12.
- [x] `./init.sh --rapido` → `== init OK ==`. **Con una salvedad que es el mayor-1**: su selección
      por grafo imprimió que el diff vs origin/dev no toca código con tests y no había nada que
      relacionar, así que **el gate corto no ejecutó ni un solo test de esta ficha** — solo las 30
      guardias.
- [x] E2E propio: aceptado del leader (`e2e/grupos-de-trabajo.spec.ts`, 2 verdes en chromium y
      webkit). Se leyó el archivo: un solo `test`, el recorrido entero, 65 aserciones, verificación
      en Postgres en los pasos de escritura, selectores por `data-testid` / `data-*` y **ningún
      assert sobre copy**. R42 cumplido de verdad.
- [x] Los 23 fallos de `pnpm e2e` completo: **confirmados ajenos**. `git status --porcelain` sobre
      `db/`, `scripts/` y `lib/` sale vacío, así que ni el seed ni el catálogo de permisos de QC-74
      los tocó esta rama. **No se contabilizan como hallazgo de esta ficha.**

### Alcance (lo que se pidió verificar sin concesiones)
- [x] **`lib/modules/**` intacto.** `git status --porcelain` sobre `lib/modules`, `db`,
      `lib/composition`, `lib/shared`, `components/shared`, `package.json`, `pnpm-lock.yaml`,
      `scripts` y `components.json` sale **vacío**.
- [x] **`PRIVATE_NAV_ITEMS` no se toca.** `git diff --stat` sobre `lib/shared/navigation/` y
      `lib/shared/routes.ts`: vacío. R4 y R5 cumplidos.
- [x] **Ninguna dependencia nueva.** Los únicos paquetes que importan los archivos de la rama son
      `react`, `react-dom`, `next/*`, `lucide-react`, `sonner`, `class-variance-authority` y
      `@base-ui/react` — todos ya declarados. `cn` no aparece **ni en `package.json` ni en
      `pnpm-lock.yaml`**, y los dos tienen diff vacío.
- [x] **Ningún `e2e/*.spec.ts` existente tocado**: `git status -- e2e` muestra solo el archivo
      nuevo. R43 cumplido.
- [~] `tests/guards/**` figura en la lista de archivos que NO se tocan de `tasks.md` y sin embargo
      la ficha modifica uno y añade otro. Está bien hecho y R39 lo manda; es `tasks.md` el que
      quedó incoherente. Ver menor-2.

### Calidad, seguridad y plataforma
- [x] `pnpm typecheck` y `pnpm lint` limpios (dentro de `./init.sh --rapido`).
- [x] **Sin backend**: cero tablas, cero columnas, cero migraciones, cero RLS que revisar. El
      checkpoint de aislamiento por empresa **no aplica**: `db/schema.prisma` no cambia y toda
      lectura/escritura pasa por los casos de uso de QC-84, que ya lo ejercen.
- [x] **Sin secretos, sin contexto hardcodeado.** La empresa y la sesión no se leen en la pantalla:
      `page.tsx` baja `canModify` por props (R10) y las actions resuelven el actor.
- [x] **Capas separadas**: los componentes de cliente no importan `lib/composition` ni Prisma
      (probado por `work-group-table.test.tsx` y `work-group-list-section.test.tsx`).
- [x] **Multiplataforma (R40, `docs/architecture.md > Componentes`)**: `work-group-a11y.test.tsx`,
      8 casos × 2 viewports, comprueba sin `100vh`, sin hover-only, `min-h-11 min-w-11` en los
      controles táctiles y fuente >= 16 px en los campos. **Ninguna excepción de escritorio
      declarada, y no hace falta ninguna.** Mutado y muerde (mutación 6).

### Las dos preguntas abiertas
- [x] **Siguen las dos abiertas**, y el comportamiento es el documentado en `design.md > 10`.
      1. El actor no aparece entre los candidatos: sale de `listUsersAction`, que lo excluye
         (QC-66 dec. 12). **No se abrió ninguna vía alternativa** — habría sido backend. El E2E lo
         convierte en aserción: el buscador devuelve **un solo** candidato.
      2. El buscador no muestra el estado de cuenta: pinado por dos tests, uno sobre el DOM
         (arroba, `pending`, `active`, `inactive`, `blocked` no aparecen) y otro sobre la fuente
         (`accountStatus`, `email`, `documentNumber`, `username` no se nombran).

---

## 2. Las cinco cosas que el implementer declaró, juzgadas una a una

### 2.1 `components/ui/tabs.tsx` editado a mano — **CORRECTO**

**Lo que se comprobó, no lo que se leyó.**

- El archivo es **estilísticamente el de la CLI**, no uno escrito a mano: comillas dobles en todo
  el archivo (el código propio del repo usa simples), `data-slot`, `cva` con `defaultVariants`,
  cadenas de Tailwind de varias líneas con `group-data-*` y `after:*`, y el bloque `export { ... }`
  al final — exactamente la forma de sus hermanas (`sheet.tsx` abre igual). La **única** línea que
  discrepa de sus hermanas en origen es la del `cn`, y está en `@/lib/utils`, que es donde las
  otras 21 la tienen.
- **Cero dependencia.** `git diff HEAD -- package.json pnpm-lock.yaml` vacío; `cn` no aparece en
  ninguno de los dos. Verificado por grep, no por confianza.
- **La guardia anti-reincidencia dispara.** **Mutación 1**: se cambió la línea para traer `cn` del
  paquete y `guard-primitivas-ui-usan-el-cn-del-repo.test.ts` pasó a **1 fallo / 2 pasan**,
  nombrando el archivo culpable. Restaurado y verificado.
- La guardia además trae su propia ancla de no-vacuidad (>= 20 primitivas barridas y >= 20 que
  importan `cn`), así que no puede volverse verde por dejar de mirar. Y no duplica a
  `guard-dependencias-aprobadas`: una vigila el manifiesto, ésta el import.

**Dictamen.** La letra de R37 prohíbe editar a mano archivos de `components/ui/` y esa letra se
incumple en una línea. Pero R37 prohíbe **también** toda dependencia de terceros nueva, y las dos
mitades no podían cumplirse a la vez. La decisión humana escogió la mitad que la **regla 7 de
`CLAUDE.md`** protege, que pesa más que una preferencia de estilo, y el resultado **acerca** el
archivo a la convención del repo en lugar de apartarlo. Además se dejó una guardia que no existía
antes. **No es hallazgo. Está bien resuelto y bien documentado.**

### 2.2 R35 contra `design.md > 5.3` — **NO es el diseño incumplido: es el requisito contradictorio, y la lectura elegida es la correcta**

Se pidió un dictamen con esas palabras, y éste es:

**El implementer NO incumplió el diseño. Cumplió `design.md > 5.3` al pie de la letra e incumplió
la letra de R35 en dos de sus cinco operaciones — porque R35 y R30 se contradicen entre sí dentro
del propio `requirements.md`, y sólo una de las dos lecturas deja algo observable.**

El choque es literal y está en el mismo archivo:

- **R35**: cuando una operación de creación, renombrado, borrado, **alta o baja de miembro**
  termine con éxito, el sistema DEBE **cerrar el panel** o el diálogo abierto.
- **R30**: cuando meter o sacar a una persona termine con éxito, el sistema DEBE volver a pedir la
  lista de miembros al servidor **y presentar lo que ésta devuelva**.

Sobre un panel cerrado, R30 no tiene superficie donde presentar nada: la lista de miembros vive
**dentro** del panel y en ningún otro sitio. Y la **decisión cerrada 4** —humana, no reabrible—
fija que los miembros se gestionan en el panel lateral, con buscador para añadir y acción para
sacar, **sin salir de la tabla**, que describe un flujo iterativo: cerrar el panel tras cada alta
obligaría a reabrirlo para meter a la segunda persona. La lectura literal de R35 mata R30 y riñe
con la decisión 4; la lectura implementada no mata nada.

**Y lo demás de R35 sí se cumple entero también en las operaciones de miembro**, comprobado en la
fuente y en los tests: hay `toast.success` en `addMember` y en `removeMember`
(`work-group-members.tsx:239` y `:257`), y el test lo afirma —una llamada exacta al toast en meter
y en sacar, y ninguna cuando la operación se rechaza—; la actualización es sin recargar la
pantalla; no se monta una segunda región de avisos; y no se pierde ni la pestaña ni los parámetros
de lista. Lo único que no ocurre es el cierre.

**Dictamen final.** Comportamiento correcto, razonado en el JSDoc y declarado en la bitácora antes
de que nadie preguntara. **Lo que queda mal no es el código sino el texto de R35**, que enumera la
alta y la baja de miembro sin advertir que eso vacía a R30. **Mayor-2: el humano debe zanjar la
redacción** — lo esperable es acotar R35 a creación, renombrado y borrado, y dejar el cierre del
panel fuera de las operaciones de miembro. Hasta que se zanje, R35 está cubierto por test en 3 de
sus 5 operaciones y la rama del miembro no está pinada por ninguna aserción de «sigue abierto».

### 2.3 Los tres tests heredados de QC-67 — **CIERTO, y no había salida. Verificado por reversión.**

- **Medido**: `git diff --numstat` da **25 añadidas / 0 borradas** en los tres
  (`user-list-section.test.tsx`, `usuarios-page.test.tsx`, `usuarios-viewport.test.tsx`).
  **Cero líneas borradas es prueba estructural de que ninguna aserción existente se cambió**: una
  edición sobre una línea viva aparecería como borrado. Además se filtraron todas las líneas
  añadidas buscando `it(`, `test(`, `describe(` o `expect(`: **ninguna**. Lo añadido es sólo el
  preámbulo de mocks.
- **La necesidad es real, no una excusa.** `work-group-actions.ts:57` evalúa
  `createErrorStateTranslator(IdentityError, observabilidad.readRequestIdHeader)` **en ámbito de
  módulo**, o sea al importarse. **Mutación 3**: se revirtió `usuarios-viewport.test.tsx` a su
  versión de QC-67 y el archivo murió antes de correr un solo caso, con el error de que
  `observabilidad` no está exportado en el doble de `@/lib/composition`. Restaurado. No es
  opinable: sin el mock, el archivo no arranca.
- **Tensa, no relaja**: los siete dobles **lanzan** si se los llama, así que ahora los tres
  archivos afirman algo que antes nadie afirmaba — que la pestaña de personas no toca nada de
  grupos (R6).

**Dictamen.** Es una desviación del encargo literal, pero es la única salida disponible sin violar
R36 (importar por ruta exacta), R38 (barrel) y la guardia que prohíbe rutas profundas en tests.
Está medida, declarada y va en la dirección correcta. **Menor-3, aceptada. No revertir.**

### 2.4 El centinela que cazó la conversión a CRLF — **CIERTO, y el centinela muerde**

- **Ningún archivo de la rama lleva CRLF.** Se barrieron los **47** archivos que la rama toca o
  añade (union de `git diff --name-only HEAD` y `git ls-files --others --exclude-standard`)
  buscando retornos de carro: **cero**. (El repo sí tiene unos 40 archivos con CRLF heredados de
  fichas anteriores, ninguno de ellos tocado aquí.)
- **Mutación 2**: se reconvirtió `tests/guards/guard-identificador-de-request.test.ts` a CRLF.
  `git diff --numstat` pasó de `7 0` a **`963 956`** —el número exacto que la bitácora reporta— y
  `alcance.test.ts` se puso **rojo** en el caso de que lo que la guardia gana es un alta y no una
  aserción relajada, con cero líneas borradas. Restaurado: vuelve a `7 0`.

**Dictamen.** El incidente es real, la medida es la correcta y el caso que lo caza no es
decorativo. Sin él, un alta de 7 líneas en una guardia habría entrado en el diff indistinguible de
una reescritura completa de esa guardia. **Bien.**

### 2.5 Las dos guardias con SHA congelado que no tocó — **abstención CORRECTA, pero la premisa está mal en una de las dos**

- **`tests/unit/configuracion-ui/unidades-convenciones.test.ts`**: el agujero es **real**.
  `const RAMA_BASE = '516e9c0'` se usa de verdad en cuatro sitios (líneas 648–670) para comparar
  `package.json` contra un árbol congelado. Medido aquí: `git diff --name-only 516e9c0 -- .`
  devuelve hoy **566 archivos**, así que esa guardia mide contra un tronco que `dev` dejó atrás.
- **`tests/unit/unidades/modulo-intacto.test.ts`**: **la premisa es falsa.** Ese archivo **ya usa
  `merge-base`** (`mergeBaseConDev()`, líneas 87–89, usada en 149 y 223). El `516e9c0` sólo aparece
  en un comentario histórico que explica **por qué se dejó de usar**, con fecha 2026-09-08. **No
  tiene el agujero.**
- Los dos están sin tocar: `git status --porcelain` sobre ambos sale vacío. Confirmado.

**Dictamen sobre la abstención: es correcta, y por el motivo que él da.** Los dos archivos son de
QC-39, están verdes, no los rompió esta ficha y arreglarlos es exactamente el cambio ancho y no
pedido que un reviewer rechaza. Escalarlo al leader en lugar de tocarlo de paso es lo que manda el
arnés. **Esta ficha no debía cerrar ese agujero.** Queda **menor-4**: la bitácora § 4 afirma que
son dos y es uno; conviene corregir el texto antes de que alguien abra una ficha para arreglar algo
que ya está arreglado.

---

## 3. Las ocho mutaciones probadas

Todas cayeron. Todas restauradas y verificadas.

| # | Mutación | Qué se esperaba | Resultado |
| --- | --- | --- | --- |
| 1 | `tabs.tsx`: traer `cn` del paquete en vez de `@/lib/utils` | guardia anti-reincidencia roja | **cae** — 1 fallo, nombra el archivo |
| 2 | `guard-identificador-de-request.test.ts` a CRLF | centinela de cero líneas borradas rojo | **cae** — numstat `963 956` |
| 3 | `work-group-columns.tsx`: celda con «(3 de 5)» | R12, ningún conteo | **cae** — 2 fallos, «ni un solo dígito» |
| 4 | `work-group-form.tsx`: expresión propia de letra-o-número | R21, sin expresión propia | **cae** — 1 fallo |
| 5 | `work-group-table.tsx`: ignorar `canModify` | R9, cero escrituras sin permiso | **cae** — 2 fallos |
| 6 | `work-group-columns.tsx`: `min-h-11` a `min-h-8` | R40, 44x44 px | **cae** — 2 fallos, los 2 viewports |
| 7 | `work-group-members.tsx`: `fetch` a ruta propia | R36, sin rutas propias | **cae** — 1 fallo en `alcance` |
| 8 | `work-group-members.tsx`: quitar la recarga tras meter | R30, nada optimista | **cae** — 1 fallo |

Las mutaciones se eligieron sobre los requisitos con mayor riesgo de aserción decorativa: los
**prohibitivos** (R9, R12, R21, R36), los que se cumplen por omisión (R40) y el que tiene el modo
de fallo más sutil (R30). Ninguno resultó vacío.

---

## 4. Hallazgos

### MAYOR-1 — Nada está commiteado y la rama está 31 commits por detrás de `origin/dev`

`git status -sb` dice `behind 31`, y `git merge-base origin/dev HEAD` devuelve **el propio `HEAD`**
(`ebf97df`): los 47 archivos de la ficha viven sólo en el árbol de trabajo, ninguno en un commit.
Tres consecuencias medidas:

1. **`git diff origin/dev...HEAD --stat` sale vacío.** El alcance no es auditable por el comando
   que el encargo pedía; hubo que auditarlo contra el árbol de trabajo (`git status --porcelain` y
   `git diff HEAD`). El resultado es limpio, pero la vía normal de verificación no funciona.
2. **El gate corto quedó vacío para esta ficha.** `./init.sh --rapido` imprimió que el diff vs
   `origin/dev` no toca código con tests y que no había nada que relacionar, y corrió **sólo las 30
   guardias**. Su `== init OK ==` **no es evidencia sobre esta ficha**. Lo que sí lo es: la corrida
   completa que hizo este revisor (88 archivos, 1231 pasan).
3. **Toda la evidencia se midió sobre un árbol sin 31 commits de `dev`.** Los unitarios y el E2E
   son correctos sobre *este* árbol; no dicen nada sobre el resultado fusionado.

**Qué falta para cumplirlo** (es del leader, T15): commitear el trabajo, `git merge origin/dev`,
repetir `prisma migrate deploy` y `prisma generate` —la propia bitácora § 0 avisa de que omitirlo
costó dos corridas de gate en QC-86— y **volver a correr `./init.sh` completo sobre el árbol
fusionado**. No se cierra T15 con el gate que ya se corrió.

### MAYOR-2 — R35 enumera la alta y la baja de miembro, y eso vacía a R30

Desarrollado en § 2.2. **No es un defecto de implementación**: es una contradicción interna de
`requirements.md` que el `design.md > 5.3` ya había resuelto y que el implementer siguió. Decide el
humano, porque sólo él puede tocar un requisito. Lo esperable es acotar R35 a creación, renombrado
y borrado. Mientras tanto, R35 está cubierto por test en 3 de sus 5 operaciones y el comportamiento
de «el panel sigue abierto» no está pinado por ninguna aserción — si se confirma la lectura
implementada, conviene añadir ese caso para que no se «arregle» solo el día de mañana.

### menor-1 — T15 sin marcar `[x]`

`CHECKPOINTS.md > Especificación` exige todas las tasks marcadas. T15 es la única sin marcar y está
declarado a propósito (bitácora § 13): el gate completo y el PR son del leader. **No se cierra la
ficha a `done` hasta que T15 se marque**, y sólo se marca después de resolver el mayor-1.

### menor-2 — `tasks.md` se contradice sobre `tests/guards/**`

Su lista de archivos que no se tocan incluye `tests/guards/**` y el criterio de hecho de T13 pide
`git diff tests/guards/` **vacío**. La ficha modifica `guard-identificador-de-request.test.ts`
(alta en lista cerrada, 7/0) y añade `guard-primitivas-ui-usan-el-cn-del-repo.test.ts`. **Lo hecho
está bien y R39 lo manda expresamente**: toda lista CERRADA cuyo punto de extensión por diseño sea
darse de alta en ella debe tensarse. Lo que quedó mal es el criterio de hecho de T13, que nunca
podía cumplirse a la vez que R39 y R42. Corregir el texto de `tasks.md`, no el código.

### menor-3 — Los tres tests heredados de QC-67 se tocaron

Desarrollado en § 2.3. Desviación del encargo literal, verificada como inevitable, con 0 líneas
borradas y ninguna aserción alterada, y que endurece en lugar de relajar. **Aceptada. No revertir.**

### menor-4 — La bitácora § 4 se equivoca sobre uno de los dos centinelas congelados

`tests/unit/unidades/modulo-intacto.test.ts` **ya usa `merge-base`** desde el 2026-09-08; el
`516e9c0` sólo sobrevive en un comentario histórico. El agujero real es únicamente el de
`unidades-convenciones.test.ts`. Corregir el párrafo para que la ficha que el leader abra apunte a
un archivo y no a dos.

---

## 5. Lo que se comprobó y NO produjo hallazgo

- **La tabla no pinta ningún conteo de miembros.** `WORK_GROUP_COLUMNS` tiene exactamente dos ids
  (`name`, `actions`), `WorkGroupRow` tiene exactamente `id` y `name` congelados por test, y una
  aserción renderiza la fila entera y exige que **no contenga ni un solo dígito**. Mutado con un
  «(3 de 5)» y cae. QC-100 sigue siendo QC-100.
- **`page.tsx`**: el corte `requirePagePermission('usuarios.consultar')` sigue siendo la **primera**
  sentencia del cuerpo y la única; la pestaña se resuelve después; se monta **una sola** sección; la
  pestaña de personas conserva su parser y su enlace canónico sin `tab`. R6 y R8 intactos.
- **Los 23 fallos de `pnpm e2e`**: ajenos y preexistentes, causa confirmada (el rol Operador no
  tiene `dashboard.consultar`) y diff vacío en `db/`, `scripts/` y `lib/`. **No cuentan contra
  QC-85.**
- **Los tres centinelas ajenos retensados** (`configuracion-convenciones`, `data-table-intacta`,
  `data-table-intacta-unidades`): se revisaron las líneas borradas una a una. Son firmas de
  función y el `import` de vitest, no aserciones. Las listas `INTOCABLES` **no se tocaron** y
  **`tabs.tsx` no entró en ninguna lista de excepciones** (grep de `tabs`, `EXCEP`, `allowlist`:
  sin resultados). Fuera de su rama quedan `skipped` con motivo, nunca verdes por vacuidad.

---

## Veredicto

**APROBADO con condiciones** — 2 mayores, 4 menores, 8 mutaciones probadas y las 8 muerden.

La implementación es correcta y está verificada: 43/43 requisitos con test real, alcance limpio
(`lib/modules/**`, `db/**`, `package.json` y `PRIVATE_NAV_ITEMS` sin tocar), cero dependencias
nuevas, cero conteo de miembros, las dos preguntas abiertas siguen abiertas con su comportamiento
por defecto medido, y multiplataforma cumplido sin excepciones.

**No pasa a `done` hasta cerrar los dos mayores**, y ninguno de los dos vuelve al implementer:

1. **Mayor-1 → leader (T15):** commitear, fusionar `origin/dev`, `prisma migrate deploy` y
   `prisma generate`, y correr `./init.sh` completo **sobre el árbol fusionado**. El `== init OK ==`
   del gate corto no vale como evidencia para esta ficha: no ejecutó ni uno de sus tests.
2. **Mayor-2 → humano:** zanjar la redacción de R35 frente a R30 y a la decisión cerrada 4. Si se
   confirma la lectura implementada —que es la que este revisor recomienda—, acotar R35 a
   creación, renombrado y borrado y pedir un caso que fije que el panel sigue abierto en alta y
   baja de miembro.
