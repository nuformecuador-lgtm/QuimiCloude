# QC-131 — prompts-en-vercel-y-revision-firmada · tasks.md

> **Ficha humana, solo catálogo** (`[D3]`). Las tareas `[HUMANO]` solo las ejecuta y marca una
> persona; **ningún agente puede marcar su casilla**. El único diff esperado fuera de `specs/` y
> `progress/` es el contenido que el humano añade a `docs/revision-de-prompts.md`. Todo lo de
> fórmula (antes T5-F) está en **QC-157**.

## T0 — Leer antes de actuar (bloquea todo)

- [ ] Leer `requirements.md` y `design.md` entero.
- **Hecho:** quien ejecute sabe qué entra (catálogo) y qué no (fórmula → QC-157).

## T1 — [HUMANO] (Opcional) Decidir el entorno de la pasada · depende de T0

- [ ] Pregunta abierta 4 (`[D5]`, no bloqueante): confirmar Production como entorno de la pasada, o
      verificar antes la configuración de Preview (`QSTASH_TARGET_URL`, `GEMINI_*`, base).
- **Archivos:** ninguno, salvo que la respuesta se anote en `requirements.md` como decisión fechada.
- **Hecho:** se sabe en qué despliegue se hará T5.

## T2 — [HUMANO] Revisar y ajustar el borrador · depende de T0

- [ ] Leer `borradores-de-prompts\catalogo.md` (raíz del repo principal, no versionado) contra
      `design.md > 3`; decidir los puntos anotados en el borrador.
- [ ] Redactar el texto **definitivo** **fuera del repo** (R9).
- **Archivos:** ninguno versionado. Si hay diff, algo se hizo mal.
- **Hecho:** el humano tiene el texto definitivo listo para pegar.

## T3 — [HUMANO] Poner `CATALOG_PROMPT` en Production y Preview · depende de T2

- [ ] Según `design.md > 4.1`, mismo texto en los dos entornos.
- **Archivos:** ninguno.
- **Hecho:** el panel muestra la variable en los dos entornos. Cubre **R5, R8, R9**.

## T4 — [HUMANO] Redesplegar · depende de T3

- [ ] Redeploy de Production (y de Preview si se va a usar) según `design.md > 4.2`; apuntar la hora.
- **Archivos:** ninguno.
- **Hecho:** existe un despliegue posterior al cambio de la variable. Cubre **R10**.

## T5 — [HUMANO] Pasada `catalogo` con un PDF real · depende de T1 y T4

- [ ] Subir un catálogo de proveedor real desde `/proveedores/<id>` (`design.md > 4.3`).
- [ ] Leer `document_files.extracted_text` (`design.md > 4.4`) y compararlo con el PDF.
- **Archivos:** ninguno todavía.
- **Hecho:** la fila terminó en «Listo» y el texto está a mano para T6.

## T6 — [HUMANO] Rellenar y firmar el registro · depende de T5

- [ ] Una **sección nueva** al final de `docs/revision-de-prompts.md`, con ficha, tabla `catalogo` y
      dos filas de cierre (`design.md > 4.5`). Nota en toda fila con **mal**.
- [ ] Sin texto del prompt en la sección; sin tocar la plantilla.
- [ ] Firmar (nombre + commit con autoría propia).
- **Archivos:** `docs/revision-de-prompts.md` (solo adiciones).
- **Hecho:** sección firmada. Cubre **R1, R3, R4, R6, R11, R14**.

## T7 — [HUMANO] Corregir y repetir si hubo algún «mal» · depende de T6

- [ ] Corregir el texto en Vercel (Production **y** Preview), volver a T4 y repetir en **sección
      nueva**. La sección firmada anterior no se edita.
- **Archivos:** `docs/revision-de-prompts.md` (solo adiciones).
- **Hecho:** la **última** sección de `catalogo` no tiene ningún **mal**. Cubre **R12, R13**.

## T8 — Trazabilidad (arnés) · depende de T6/T7

- [ ] `progress/impl_QC-131-prompts-en-vercel-y-revision-firmada.md` con el mapa `R1–R14 →
      evidencia` de `design.md > 6` (R2 marcado «va a QC-157»), apuntando a la sección firmada.
- [ ] Comprobar que `git diff dev --stat` solo trae `specs/QC-131-…/`, `progress/` y
      `docs/revision-de-prompts.md` (solo adiciones), y que ningún archivo versionado contiene texto
      de los borradores.
- **Archivos:** `progress/impl_QC-131-….md` (nuevo).
- **Hecho:** 14 filas sin huecos. Cubre **R7, R9, R14** (inspección).

## T9 — Gate completo (arnés) · depende de T8

- [ ] `./init.sh` completo antes del PR (regla 5 de `CLAUDE.md`).
- **Archivos:** ninguno.
- **Hecho:** verde, guardias incluidas.

---

### Orden corto

`T0 → ([H]T1 ‖ [H]T2) → [H]T3 → [H]T4 → [H]T5 → [H]T6 → [H]T7 (si hace falta) → T8 → T9`

### Mapa `R<n>` → tarea

| Requisito | Tareas |
|---|---|
| R1 | T5, T6 (humana) |
| R2 | **va a QC-157** |
| R3, R4 | T6 (humana) |
| R5 | T3 (humana) |
| R6 | T5, T6 (humana) |
| R7 | este spec + borrador no versionado; T8 |
| R8 | T3 (humana) |
| R9 | T2, T3 (humana); T8 |
| R10 | T4 (humana) |
| R11 | T6 (humana) |
| R12 | T7 (humana) |
| R13 | T7 (humana) |
| R14 | T6 (humana); T8 |
