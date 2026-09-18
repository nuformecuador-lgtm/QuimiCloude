# QC-114 — tabla-compartida-en-iphone-real · tasks.md

> **Lee esto antes de tomar una task.** Esta ficha no tiene código de producción. Las tasks se
> reparten en dos grupos y el grupo manda sobre quién las ejecuta:
>
> - **[AGENTE]** — preparación y registro. Las puede hacer un agente.
> - **🧍 [SOLO HUMANO]** — **ningún agente puede ejecutarlas ni darlas por hechas.** Requieren una
>   persona con un **iPhone físico** en la mano. Un agente que marque `[x]` una de estas está
>   mintiendo en el registro; si llega hasta aquí, **para y devuelve al leader**.
>
> Ninguna task de esta ficha arregla nada. Si algo sale rojo, el arreglo es **ficha nueva**
> (R16, R17, D9).
>
> `[P]` = paralelizable con las demás `[P]` de su mismo nivel de dependencias.

## Bloqueos previos

**B1.** Las preguntas abiertas **3** (con qué cuenta se entra al preview) y **4** (quién siembra y
contra qué base) de `requirements.md` se responden al aprobar el spec. **T3 y T5 no arrancan sin
esa respuesta.**

---

## Preparación — las hace un agente

### [ ] T1 [AGENTE] — Crear la plantilla del registro de evidencia
- **Depende de**: nada.
- **Qué**: crear `docs/verificacion-ios/QC-114.md` con la estructura de `design.md > 4`: cabecera
  (dispositivo, versión de iOS, navegador, URL del preview, fecha, verificador), la nota de Android
  sin comprobar, la tabla con **nueve filas** —una por vista de `design.md > 2`, en ese orden y con
  su ruta— y las secciones «Mapa `R<n>` -> evidencia» y «Hallazgos».
- **Criterio**: R1, R12, R14.
- **Hecho cuando**: el archivo existe, tiene nueve filas con las nueve rutas escritas, las 27
  casillas A/B/C están **vacías** (la plantilla no inventa veredictos) y la cabecera tiene los
  campos en blanco a rellenar.

### [ ] T2 [AGENTE] [P] — Escribir el mapa de trazabilidad dentro del registro
- **Depende de**: T1.
- **Qué**: copiar la tabla `R<n> -> evidencia` de `design.md > 6` a la sección «Mapa» del registro,
  y dejar el mismo mapa en `progress/impl_QC-114-tabla-compartida-en-iphone-real.md`.
- **Criterio**: R15; regla 4 de `CLAUDE.md`; `CHECKPOINTS.md > Trazabilidad`.
- **Hecho cuando**: los 18 requisitos (R1–R18) aparecen en el mapa, ninguno sin casilla asociada, y
  el mapa está en los dos archivos.

### [ ] T3 [AGENTE] — Sembrar datos hasta que las nueve tablas desborden
- **Depende de**: **B1** (pregunta abierta 4).
- **Qué**: ejecutar `pnpm db:seed` contra la base que use el preview y añadir filas hasta que cada
  una de las nueve vistas tenga **más columnas que ancho de pantalla y más filas que alto** en un
  iPhone. Anotar en el registro (sección «Hallazgos», como nota previa) qué vistas necesitaron
  siembra manual.
- **Criterio**: R6.
- **Hecho cuando**: para cada una de las nueve vistas está anotado el número de filas disponibles y
  ninguna queda por debajo del tamaño de página mínimo (10); si alguna vista no puede llenarse,
  queda escrito el motivo **antes** de la pasada, para que T5 la marque «no concluyente» y no verde.

### [ ] T4 [AGENTE] — Dejar el PR con preview vivo
- **Depende de**: T1.
- **Qué**: abrir el PR de `feature/QC-114-tabla-compartida-en-iphone-real` con la plantilla dentro,
  y comprobar que Vercel publicó el preview. Correr `./init.sh` completo antes del PR (regla 5).
- **Criterio**: R4, R12.
- **Hecho cuando**: el PR está abierto, el gate completo salió en verde y la URL `https://…` del
  preview está escrita en la cabecera del registro.

---

## La pasada — SOLO LA HACE UNA PERSONA

### [ ] T5 🧍 [SOLO HUMANO] — Pasada en el iPhone sobre las nueve vistas
- **Depende de**: T3, T4, **B1** (pregunta abierta 3).
- **Quién**: una persona con un **iPhone físico**, iOS >= 16, Safari de iOS. **Ningún agente.**
- **Qué**: ejecutar los siete pasos de `design.md > 3` en cada una de las nueve vistas, en orden:
  abrir el preview, comprobar desbordamiento en ambas direcciones, fijar una columna, y observar
  **A** (la columna fijada no se mueve, también durante la inercia), **B** (el scroll es de la tabla
  y no del `body`, horizontal y vertical) y **C** (el menú de cabecera se abre y se opera por
  toque).
- **Criterio**: R5, R7, R8, R9, R10, R11.
- **Hecho cuando**: las **27** casillas A/B/C tienen veredicto (`verde`, `rojo` o `no concluyente`
  con motivo), ninguna vacía ni remitida a otra fila.

### [ ] T6 🧍 [SOLO HUMANO] — Cerrar la cabecera y capturar los rojos
- **Depende de**: T5.
- **Quién**: la misma persona, durante la misma pasada.
- **Qué**: rellenar modelo de iPhone, versión de iOS, fecha y verificador; y para **cada** veredicto
  rojo, adjuntar captura o vídeo de lo observado y enlazarlo en su fila. Los verdes no llevan imagen.
- **Criterio**: R12, R13.
- **Hecho cuando**: la cabecera está completa y **no queda ningún `rojo` sin imagen**.

---

## Cierre — las hace un agente

### [ ] T7 [AGENTE] — Abrir una ficha por hallazgo
- **Depende de**: T6.
- **Qué**: por cada veredicto rojo, crear una ficha nueva en el board (`docs/jira.md`) **bloqueada
  por QC-114**, con la vista, el punto (A/B/C) y el enlace a la imagen; escribir su clave en la fila
  del registro y resumirlas en «Hallazgos». **Ninguna ficha de arreglo se implementa aquí.**
- **Criterio**: R16, R17.
- **Hecho cuando**: cada rojo tiene su clave escrita en la fila, y `docs/verificacion-ios/QC-114.md`
  dice si la ficha cierra «probado, sin hallazgos» o «probado, con hallazgos».

### [ ] T8 [AGENTE] [P] — Guardia de alcance sobre el diff
- **Depende de**: T6.
- **Qué**: revisar `git diff --name-only origin/dev...HEAD`.
- **Criterio**: R18, R3.
- **Hecho cuando**: el diff **sólo** lista `docs/verificacion-ios/QC-114.md`,
  `specs/QC-114-tabla-compartida-en-iphone-real/**` y `progress/**`; no toca
  `components/shared/data-table/**`, ninguna de las nueve pantallas, `package.json` ni `tests/**`.

### [ ] T9 [AGENTE] — Gate completo y cierre
- **Depende de**: T7, T8.
- **Qué**: correr `./init.sh` completo (regla 5, y obligatorio antes del merge) y contrastar la
  ficha contra `CHECKPOINTS.md`.
- **Criterio**: `CHECKPOINTS.md > Especificación` y `> Trazabilidad`.
- **Hecho cuando**: el gate sale en verde, las nueve filas del registro están cerradas, el mapa
  `R<n> -> evidencia` está en `progress/impl_QC-114-*.md` y todas las tasks de este archivo están
  `[x]` — **sin que ningún agente haya marcado T5 ni T6**.

---

## Resumen de responsabilidad

| Task | Ejecuta |
|---|---|
| T1, T2, T3, T4 | Agente |
| **T5, T6** | **🧍 Sólo humano con iPhone físico** |
| T7, T8, T9 | Agente |
