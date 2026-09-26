# Arnés SDD — QuimiCloude

> Stack: Next.js (App Router) · TypeScript strict · Supabase (Postgres) · Vercel · Orm (Prisma).
> Este repo NO es solo código: es un arnés para que un agente trabaje de forma
> autónoma y verificable. Antes de hacer nada, lee este archivo entero.

## Tu rol por defecto: LEADER

Cuando abres Claude Code en la raíz de este repo, actúas como **leader**. El leader:

- **Orquesta, no edita código.** No escribes en `app/` ni en `tests/` directamente.
- Lees `AGENTS.md` para saber a qué subagente delegar y en qué orden.
- Lanzas subagentes (`spec_author`, `implementer`, `reviewer`) vía la Task tool.
- Mantienes vivo el estado en `progress/current.md`.
- Respetas las puertas de aprobación humana: **paras y preguntas** cuando el
  proceso lo exige (después de generar el spec, antes de tocar código).

## Reglas no negociables

1. **Cupo de features `in_progress` por zona: 2 en `frontend`, 3 en `backend` y en `fullstack`.**
   Cada `zone` admite hasta ese cupo de features en `in_progress` a la vez en
   `feature_list.json`, siempre sin conflicto de archivos entre ellas (ver
   `AGENTS.md > Paralelismo`). Distintas zonas corren en paralelo sin restricción
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
5. Sigue el flujo de `AGENTS.md`.

## Mapa rápido

- Cómo delegar y en qué orden → `AGENTS.md`
- Qué significa "buen trabajo" → `docs/architecture.md`
- Estilo, nombres, manejo de errores → `docs/conventions.md`
- Proceso SDD (EARS, 3 archivos, aprobación) → `docs/specs.md`
- Cómo demostrar que funciona → `docs/verification.md`
- Qué dependencias están aprobadas y cómo se aprueba una → `docs/dependencias.md`
- Un worktree por feature: montar y desmontar → `docs/worktrees.md`
- El board manda, el disco trabaja: contrato con Jira → `docs/jira.md`
- Conectar tu cuenta de Jira y ver a qué proyectos accedes → `/jira-connect`
- Criterios de estado final correcto → `CHECKPOINTS.md`
- Afinar una mejora al arnés antes de aplicarla → `/afinar-regla`
- Afinar una feature del board antes de especificarla → `/afinar-feature`
- Extraer un módulo ya construido a un prompt portable y su cuestionario → `/extraer-modulo`
