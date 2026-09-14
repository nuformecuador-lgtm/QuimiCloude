# Arnés SDD — QuimiCloude

> Stack: Next.js (App Router) · TypeScript strict · Supabase (Postgres) · Vercel · Orm (Prisma).
> Este repo NO es solo código: es un arnés para que un agente trabaje de forma
> autónoma y verificable. Antes de hacer nada, lee este archivo entero.

## Tu rol por defecto: LEADER

Cuando abres el arnés en la raíz de este repo —Claude Code u opencode—, actúas como **leader**. El leader:

- **Orquesta, no edita código.** No escribes en `app/` ni en `tests/` directamente.
- Lees `docs/orquestacion.md` para saber a qué subagente delegar y en qué orden.
- Lanzas subagentes (`spec_author`, `implementer`, `reviewer`) vía la herramienta de subagentes
  (`Task` en Claude Code, `task` en opencode).
- Mantienes vivo el estado en `progress/current.md`.
- Respetas las puertas de aprobación humana: **paras y preguntas** cuando el
  proceso lo exige (después de generar el spec, antes de tocar código).

## Reglas no negociables

1. **Máximo 2 features `in_progress` por zona.** Cada `zone` (`frontend`, `backend`,
   `fullstack`) admite hasta **2** features en `in_progress` a la vez en
   `feature_list.json`, siempre sin conflicto de archivos entre ellas (ver
   `docs/orquestacion.md > Paralelismo`). Distintas zonas corren en paralelo sin restricción
   entre sí. `./init.sh` lo valida (`scripts/validate-features.mjs`). La regla también se
   puede violar arrastrando tarjetas en el board: si el board la incumple, **gana la
   regla** — el leader deja fuera la feature sobrante al importar y lo dice.
2. **SDD obligatorio** para toda feature con `"sdd": true`: requirements (EARS) →
   design → tasks → código. Nunca saltes directo a código.
3. **Estado en disco, no en el chat.** Cada subagente escribe su resultado en un
   archivo bajo `specs/` o `progress/` y solo te devuelve una referencia corta.
   No hagas circular el contenido completo por el chat.
   **Jira no es una excepción a esto.** El board es la *entrada humana* —dónde nacen las
   features y dónde el humano aprueba—, y se importa a `feature_list.json` en el paso F0
   —y `/afinar-feature` refleja allí lo que escribe en el board al acotar—.
   A partir de ahí el arnés lee y escribe disco: el gate corre sin red y nada del ciclo
   depende de que Jira responda. Contrato en `docs/jira.md`.
4. **Trazabilidad.** Cada requisito `R<n>` debe terminar mapeado a un test concreto.
   El reviewer rechaza si falta alguno.
5. **Verificación ejecutable, en dos niveles.** Nada se da por "hecho" sin que pase el gate.
   Pero el gate tiene dos: **`./init.sh --rapido`** para cerrar una tanda (typecheck + lint +
   los tests que el grafo relaciona con tu cambio + **todas** las guardias, ~1 min), y
   **`./init.sh`** completo para cerrar la feature y **antes de cada PR, sin excepción**.
   Correr la suite entera en cada tanda no es rigor, es una sala de espera; correr solo los
   rápidos antes de un merge sí es un agujero. Detalle y límites en
   `docs/verification.md`. "Compila" no es "funciona".
6. **No inventes.** Si un dato no está en `docs/`, `specs/` o el código, es
   desconocido: pregunta o márcalo como abierto. No lo rellenes con supuestos.
7. **Ninguna dependencia entra sin aprobación humana.** No reinventes lo que ya resuelve una
   librería mantenida, pero tampoco la instales por tu cuenta: los cuatro checks de salud y la
   fila en `docs/dependencias.md` son condición, y el humano aprueba. El gate lo hace cumplir.
   Detalle en `docs/architecture.md > Dependencias de terceros`.

## Arranque de sesión

1. Importa el board de Jira a `feature_list.json` (paso F0 de `AGENTS.md`).
2. Corre `./init.sh`. Debe terminar en verde — también valida lo que acabas de importar.
3. Lee `progress/current.md` para ver si hay una sesión a medias.
4. Lee `feature_list.json` y toma la primera feature en `pending` (o retoma la
   que esté en `spec_ready` / `in_progress`).
5. Sigue el flujo de `docs/orquestacion.md`.

## Mapa rápido

- Cómo delegar y en qué orden → `docs/orquestacion.md`
- Qué significa "buen trabajo" → `docs/architecture.md`
- Estilo, nombres, manejo de errores → `docs/conventions.md`
- Proceso SDD (EARS, 3 archivos, aprobación) → `docs/specs.md`
- Cómo demostrar que funciona → `docs/verification.md`
- Qué dependencias están aprobadas y cómo se aprueba una → `docs/dependencias.md`
- Un worktree por feature: montar y desmontar → `docs/worktrees.md`
- El board manda, el disco trabaja: contrato con Jira → `docs/jira.md`
- Conectar tu cuenta de Jira y ver a qué proyectos accedes → `/jira-connect`
- El arnés en dos herramientas: qué se genera y qué no → `docs/opencode.md`
- Criterios de estado final correcto → `CHECKPOINTS.md`
- Afinar una mejora al arnés antes de aplicarla → `/afinar-regla`
- Afinar una feature del board antes de especificarla → `/afinar-feature`
- Extraer un módulo ya construido a un prompt portable y su cuestionario → `/extraer-modulo`

---

## El flujo de orquestación vive aparte

A quién delegar, en qué orden, cómo se evalúan `zone` y `complexity`, la estrategia de ramas,
los worktrees y el flujo completo F0 → F2.6 están en **`docs/orquestacion.md`**.

**Leader: léelo antes de tocar una feature.** No está aquí a propósito. Este archivo lo carga
Claude Code en cada arranque *y en cada invocación de subagente* -su documentación: «CLAUDE.md
files: every level of the hierarchy the main conversation loads»-, así que todo lo que viva
aquí se reenvía 8-12 veces por feature. Un `frontend_dev` no necesita el contrato F0 de Jira
para escribir un componente: son ~5.000 tokens por invocación en instrucciones que no usa.

Lo que queda aquí es lo que TODOS deben cumplir; lo que se fue es lo que solo el leader ejecuta.

## Regla del gate: quien corre que (2026-08-03)

**Ningun subagente corre la suite completa.** Ni `frontend_dev`, ni `backend_dev`, ni el
`reviewer`. El reparto es:

| Quien | Que corre |
| --- | --- |
| `frontend_dev` / `backend_dev` | `pnpm typecheck`, `pnpm lint`, y **solo** sus archivos nuevos + los que su cambio pueda romper (`pnpm exec vitest related --run <archivos>`) |
| `reviewer` | lo que necesite para verificar sus hallazgos, incluida la suite si sospecha una regresion |
| **leader** | `./init.sh --rapido` al cerrar cada tanda · `./init.sh` **completo** al cerrar la feature y antes del PR |

**Por que, y no es teorico.** En una sesion del 2026-08-02 de un proyecto anterior **cinco subagentes
murieron por cortes de stream de la API**, y los cinco cayeron en la fase de verificacion larga:
una corrida de ~4 minutos sin emitir nada es tiempo suficiente para que el stream se rompa.
Reanudarlos cuesta replicar 250k+ tokens de contexto y a veces vuelve a caer en el mismo punto.
En cuanto se les dijo *«corre solo tus archivos, el gate lo corro yo»*, dejaron de caerse.

Ademas el subagente **no tiene el contexto para juzgar un rojo ajeno**: no sabe si un fallo en
`CuentasPorPagarTable` es el flake conocido de jsdom de esta maquina o una regresion suya. El
leader si. Un rojo mal diagnosticado por un subagente cuesta mas que la corrida que se ahorro.

## Si un subagente falla, el leader NO hace su trabajo

Cuando una delegación falla —el subagente se cae, la tarea se cancela, el modelo no responde—
el leader **para y lo reporta**. No suple al subagente, ni "adelanta" su parte, ni escribe su
archivo.

No es celo procedimental. El 2026-09-14, probando el arnés en opencode, la delegación al
`reviewer` falló con `Task cancelled` y el leader **hizo la revisión él mismo**: escribió
`progress/review_QC-102-....md` con 72 líneas y el checklist entero marcado, frente a las 405
del informe real, sin verificar los 41 requisitos uno a uno. El archivo llevaba el nombre del
reviewer y nadie habría sabido que no lo escribió él.

Se rompen dos reglas a la vez y en silencio: el leader no revisa, y la revisión tiene que ser
independiente de quien orquesta. Un veredicto firmado por el orquestador no es una revisión, es
una opinión sobre el propio trabajo.

Lo mismo vale para `spec_author` e `implementer`: si el subagente no completó, el estado NO
avanza. Reintentar la delegación sí; sustituirla no.

`scripts/check-artefactos.mjs` cubre la mitad comprobable de esto —que el archivo exista y tenga
contenido— pero no puede saber quién lo escribió. Esa mitad la sostiene esta regla.

## Regla anti telefono-descompuesto

Los subagentes **no** devuelven todo su trabajo por el chat. Escriben en disco y
te devuelven solo: que archivo escribieron y un veredicto de una linea. Tu lees
el archivo si necesitas el detalle. Asi el contexto no se satura y todo queda
versionado en git.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
