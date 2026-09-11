# QC-71 — identificador-de-request · tasks.md

> 11 tasks. Cada una declara **los archivos que toca** (es lo que lee la validación de
> paralelismo) y su criterio de **hecho**. `[P]` = paralelizable con las que compartan el mismo
> bloque. Nada empieza antes de T1.

## Archivos que esta ficha toca (lista completa)

1. `lib/modules/observabilidad/index.ts` *(nuevo)*
2. `lib/modules/observabilidad/domain/request-id.ts` *(nuevo)*
3. `lib/composition/edge.ts`
4. `lib/modules/identity/adapters/driving/route-guard-middleware.ts`
5. El archivo del **traductor único** de QC-70 y el del **tipo del estado de error** (rutas exactas:
   T1)
6. `components/shared/unexpected-error-notice.tsx` *(nuevo)*
7. Los componentes de las **siete pantallas** que pintan la región de error genérica (lista cerrada
   en T8, dentro de `app/(private)/**/components/**`)
8. `tests/unit/observabilidad/request-id.test.ts`, `tests/unit/observabilidad/error-state.test.ts`,
   `tests/unit/observabilidad/error-state-types.test-d.ts`,
   `tests/unit/identity/route-guard-request-id.test.ts`,
   `tests/unit/shared-ui/unexpected-error-notice.test.tsx` *(nuevos)*
9. `tests/guards/guard-identificador-de-request.test.ts` *(nuevo)* y
   `tests/guards/guard-middleware-edge.test.ts` *(solo se le añade una aserción; no se relaja
   ninguna)*
10. `progress/impl_QC-71-identificador-de-request.md`, `progress/current.md` *(bitácora, no código)*

**Archivos que NO toca, y es intencional:** `middleware.ts` (§1 del `design.md`),
`tests/unit/middleware-root-contract.test.ts`, `db/schema.prisma`, `db/migrations/**` (R19),
`package.json`, `docs/dependencias.md` (R20), `e2e/**` (R21), `lib/modules/*/domain/**`,
`lib/modules/*/ports/**` (R9), `lib/shared/**`.

> **Paralelismo con QC-66 y QC-78 (`in_progress`, zona `backend`): anotado en
> `design.md > 8`, no se vuelve a decidir aquí.** Las dos nombran `middleware.ts` en su
> `tasks.md`, y las dos lo nombran **en su lista de archivos que NO tocan**
> (`QC-66/tasks.md:23`, `QC-78/tasks.md:50`); QC-78 declara además `identity/adapters/driving/**`
> fuera. La intersección con la lista de arriba es **vacía**. **Quien decide si QC-71 arranca es
> el leader en F2.0**, releyendo esas dos declaraciones; si alguna cambió, se para. Precedente de
> QC-47 (`progress/current.md`).

---

## Bloque 0 — el suelo

### T1. Leer lo que QC-70 dejó y fijar los nombres
- **Toca:** `progress/impl_QC-71-identificador-de-request.md` (solo bitácora).
- **Depende de:** nada. **Bloquea a todas.**
- Con `origin/dev` ya traído: localizar y anotar (a) el módulo y archivo del **catálogo**, (b) el
  tipo `ErrorCode` cerrado, (c) el **código del error genérico**, (d) el archivo del **traductor
  único** y su firma, (e) el archivo donde vive el **tipo del estado de error**.
- **Hecho:** los cinco nombres, con ruta y línea, escritos en la bitácora, y una frase que confirme
  que **todo** error no catalogado pasa por un único punto. Si no pasa por uno solo → **se para y
  decide el leader** (`design.md > 9`).

---

## Bloque 1 — la generación (no depende de QC-70)

### T2. [P] Módulo `observabilidad`: `newRequestId` y el nombre de la cabecera
- **Toca:** `lib/modules/observabilidad/domain/request-id.ts`, `lib/modules/observabilidad/index.ts`.
- **Depende de:** T1.
- `newRequestId(): string` con el global `crypto.randomUUID()` y **cero `import`**;
  `REQUEST_ID_HEADER = 'x-request-id'`. El barrel solo reexporta de `./domain`.
- **Hecho:** R1, R2. `tests/unit/observabilidad/request-id.test.ts` en verde: formato UUID
  canónico, dos llamadas distintas, y una aserción sobre el **texto** del archivo de que no declara
  ningún `import`.

### T3. [P] Cablear la fachada edge-safe
- **Toca:** `lib/composition/edge.ts`.
- **Depende de:** T2.
- Añade `observabilidadEdge = { newRequestId, requestIdHeader }`. No importa nada de Node ni Prisma.
- **Hecho:** `pnpm run typecheck` verde y `pnpm run test:guardias` verde (incluida
  `guard-arquitectura-modulos`).

### T4. Enganchar el id en el portero del borde
- **Toca:** `lib/modules/identity/adapters/driving/route-guard-middleware.ts`.
- **Depende de:** T3.
- En el camino `allow`: clonar `request.headers`, `set(REQUEST_ID_HEADER, newRequestId())` y
  devolver `NextResponse.next({ request: { headers } })`. El `redirect` no cambia. Comentario en
  cabecera explicando por qué el id no va en la respuesta (R6).
- **Hecho:** R4, R5, R6 con `tests/unit/identity/route-guard-request-id.test.ts` en verde, incluido
  el caso con `x-request-id` entrante (sale otro valor) y `response.headers.get('x-request-id')` ===
  `null`.

### T5. Guardias del borde: que sigan mordiendo
- **Toca:** `tests/guards/guard-middleware-edge.test.ts` (añadir, no relajar),
  `tests/guards/guard-identificador-de-request.test.ts` *(nuevo)*.
- **Depende de:** T4.
- A la guardia existente: aserción de que el cierre alcanza
  `lib/modules/observabilidad/domain/request-id.ts` (prueba que el recorrido mira de verdad). En la
  nueva: centinela de versión de `next` (`design.md > 3.2`), `e2e/` sin archivos nuevos, `db/` sin
  migración nueva, `package.json` sin dependencias nuevas, y ninguna mención al identificador en
  `lib/modules/*/domain/**` ni `*/ports/**`.
- **Hecho:** R3, R9, R19, R20, R21. Cada validación nueva probada **con su caso rojo**, no solo con
  el verde (`docs/verification.md > Probar que muerde`).

---

## Bloque 2 — la recogida y el log (depende de QC-70)

### T6. Tipo cerrado del estado de error
- **Toca:** el archivo del tipo del estado de error (T1).
- **Depende de:** T1.
- Partir la unión en dos ramas discriminadas por el código genérico, con `requestId: string`
  **obligatorio** solo en la inesperada (`design.md > 4`).
- **Hecho:** R16. `tests/unit/observabilidad/error-state-types.test-d.ts` afirma que las dos formas
  prohibidas **no compilan**, y `pnpm run typecheck` sigue verde en el resto del repo.

### T7. El traductor: resolver id, escribir la línea, devolverla
- **Toca:** el archivo del traductor único (T1), `tests/unit/observabilidad/error-state.test.ts`.
- **Depende de:** T6, T2.
- Lee `x-request-id` con `headers()`; si falta, respaldo con `newRequestId()` y `origen=respaldo`.
  Un `console.error` con el formato de `design.md > 5` **solo** en el camino no catalogado.
- **Hecho:** R7, R8, R10, R11, R12, R13, R14, R15 con sus casos: cabecera presente, cabecera
  ausente, error del catálogo (cero `console.*` y sin id), camino feliz (cero `console.*`), y que el
  id del estado y el de la línea coincidan.

---

## Bloque 3 — la vuelta al navegador

### T8. [P] Componente compartido del error inesperado
- **Toca:** `components/shared/unexpected-error-notice.tsx`,
  `tests/unit/shared-ui/unexpected-error-notice.test.tsx`.
- **Depende de:** T6.
- Mensaje neutro + identificador como texto seleccionable con etiqueta. Sin `:hover` como única
  vía, sin `100vh`, sin librería nueva.
- **Hecho:** R17. Test que comprueba que el uuid aparece como texto y que con un error del catálogo
  no se pinta identificador (R18).

### T9. Adoptarlo en las siete pantallas
- **Toca:** los componentes de error de las siete pantallas dentro de `app/(private)/**/components/**`
  (lista cerrada al empezar la task y anotada en la bitácora).
- **Depende de:** T8, T7.
- **Hecho:** R17, R18 en cada pantalla; `pnpm run typecheck` verde —el estrechamiento del tipo
  cerrado obliga a tocarlas todas, así que un olvido no compila— y los tests de UI existentes de
  esas pantallas siguen verdes sin relajar ninguna aserción.

---

## Bloque 4 — cierre

### T10. Comprobación manual del cruce, con evidencia
- **Toca:** `progress/impl_QC-71-identificador-de-request.md`.
- **Depende de:** T9.
- `pnpm build && pnpm start`, provocar un error inesperado, comparar el id de la pantalla con el de
  la línea del log.
- **Hecho:** R21. Las dos cadenas pegadas en la bitácora, iguales, y la línea diciendo
  `origen=borde`. **Sin esto la ficha no se cierra**: es lo que sustituye al E2E diferido.

### T11. Gate completo y trazabilidad
- **Toca:** `progress/impl_QC-71-identificador-de-request.md`, `progress/current.md`.
- **Depende de:** T10.
- **Hecho:** `./init.sh` completo con salida pegada, sin ningún archivo rojo fuera de
  `tests/baseline-rojos.json`, y la tabla `R1..R21 → test` completa en la bitácora
  (`docs/verification.md`). Un requisito sin test es un fallo de la feature.

---

## Estado de las tasks (lo cierra el implementer, F2.1)

Las 11, hechas. Evidencia, mapa `R<n>` -> test y salida real del gate en
`progress/impl_QC-71-identificador-de-request.md`.

- [x] **T1** — los cinco nombres de QC-70 fijados con ruta y linea. **La parada NO se disparo**:
      todo error no catalogado pasa por un unico punto (`error-state.ts:69-74` antes del cambio).
      Salieron cinco hallazgos que el spec no podia conocer, cada uno con su decision.
- [x] **T2** — `lib/modules/observabilidad/domain/request-id.ts` (cero `import`) y su barrel.
- [x] **T3** — `observabilidadEdge` en `lib/composition/edge.ts`.
- [x] **T4** — el id se engancha en `route-guard-middleware.ts`. `middleware.ts` **no se toco**.
- [x] **T5** — `guard-middleware-edge` **ampliada, no relajada**; `guard-identificador-de-request`
      nueva, con el centinela de version de `next` y cada comprobacion con su caso rojo.
- [x] **T6** — `ErrorState` es una **union cerrada**. R16 probado por mutacion en los dos sentidos.
- [x] **T7** — el traductor resuelve el id (cabecera o respaldo con `origen=respaldo`), escribe
      **una** linea con el formato de `design.md > 5` y devuelve `reference`.
- [x] **T8** — `components/shared/unexpected-error-notice.tsx` + su test.
- [x] **T9** — adoptado en las siete pantallas, 24 componentes de UI + 3 `page.tsx` que delato el
      compilador. Lista cerrada y motivos de exclusion, en la bitacora.
- [x] **T10** — **comprobacion manual EJECUTADA** sobre `next build` + `next start`: el uuid que
      pinta la pantalla y el de la linea del log son el mismo, y la linea dice `origen=borde`.
      Las dos cadenas, pegadas en la bitacora. La sonda temporal se retiro.
- [x] **T11** — `./init.sh` completo en verde: **302 archivos, 3883 tests, 0 rojos, exit 0**.
      Los 21 requisitos mapeados a un test ejecutado.
