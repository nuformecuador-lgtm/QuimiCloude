---
description: Interroga una mejora al arnes, detecta los ejes que omitiste y propone el parche exacto
argument-hint: <la mejora en bruto, en una frase>
---

Vas a convertir una mejora al arnes dicha en bruto en una regla completa y verificable.

Mejora en bruto: **$ARGUMENTS**

Alcance: **solo el arnes** — `.claude/agents/*.md`, `docs/*.md`, `CLAUDE.md`, `AGENTS.md`,
`CHECKPOINTS.md`, `.claude/settings.json`. Si lo que te pidieron es un requisito de producto
(una pantalla, un endpoint, un flujo de negocio), **no uses este comando**: eso entra por el
board de Jira → F0 → `spec_author` (`docs/specs.md`). Dilo y para — y di a donde: si la ficha ya
esta en el board, se acota con **`/afinar-feature`** antes del spec; si todavia no existe, se crea
primero en Jira.

## Paso 1 — Encuadre

Lee lo necesario para saber **donde vive hoy** lo que se quiere cambiar: `CLAUDE.md`,
`AGENTS.md`, el archivo de agente afectado y el `docs/*.md` relacionado. No asumas el destino:
"el front" es `.claude/agents/frontend_dev.md`; "el proceso" puede ser `AGENTS.md` o `docs/`.
Si no puedes determinar el destino leyendo, eso es un hueco mas (regla 6 de `CLAUDE.md`: no
inventes). Comprueba tambien si la regla **ya existe** en alguna forma: si existe, el trabajo
es afinarla, no duplicarla.

## Paso 2 — Checklist de ejes de omision

Recorre los nueve ejes. Para cada uno decide: **¿la frase original ya lo resuelve?** Si si, es
un eje resuelto y no se pregunta. Si no, es un hueco.

1. **Simetria / conjunto completo.** Se nombro un miembro de un grupo obvio: ¿y el resto?
   Android → iOS y web escritorio; `frontend_dev` → `backend_dev`; `create` → `update`/`delete`;
   `dev` → `main`. Este es el eje que mas huecos produce.
2. **Alcance por agente.** ¿Que subagentes heredan esto? ¿El `reviewer` tiene que conocerlo
   para poder rechazar? Una regla que solo vive en el agente que la ejecuta no se hace cumplir.
3. **Fuerza.** ¿Consejo, regla, o bloqueante? Sin esto no se aplica igual dos veces seguidas.
4. **Quien lo verifica.** Reviewer humano, agente `reviewer`, `./init.sh`, un hook de
   `.claude/settings.json`, o nadie. Una regla sin verificador es una nota — y hay que decirlo
   en voz alta (regla 5 de `CLAUDE.md`: verificacion ejecutable).
5. **Retroactividad.** ¿Solo codigo nuevo, o hay que arreglar lo ya escrito? Si es lo segundo,
   de aqui sale una feature para el board, no solo un parche de markdown.
6. **Donde vive.** Archivo de agente (instruccion operativa, corta, imperativa) · `docs/` (el
   porque y el detalle) · `CLAUDE.md` (solo si es no negociable). Si se cita en dos sitios: una
   es la fuente, la otra enlaza. Nunca dos copias del mismo texto.
7. **Excepciones.** ¿Hay salida de emergencia? ¿Como se documenta cuando alguien la usa?
8. **Coste implicito.** Que prohibe o encarece esta regla: librerias que quedan descartadas,
   trabajo extra por PR, tiempo de gate. Decirlo evita que se revierta en tres semanas.
9. **Ejemplo concreto.** ¿Que caso real habria evitado esta regla? Si no lo sabes y el humano
   no lo da, marcalo como no verificado; no lo inventes.

## Paso 3 — Preguntar

Pregunta **solo los huecos reales**, con `AskUserQuestion`, en tandas de hasta 4 preguntas.
Pon tu recomendacion como primera opcion y etiquetala `(Recomendado)`. No rellenes tandas con
preguntas de adorno: si solo hay un hueco, haz una pregunta.

Antes de preguntar, enumera en una linea los ejes que ya estaban resueltos, para que se vea que
no los ignoraste.

Si no queda ningun hueco, dilo y pasa directo al paso 4.

## Paso 4 — Proponer el parche, sin escribir

Devuelve, en este orden:

- **Requisito refinado** — 2 a 4 lineas, ya con las decisiones tomadas.
- **Parche propuesto** — por archivo: la ancla exacta (seccion, numero de regla siguiente) y el
  texto literal a insertar. Respeta el estilo del destino: numeracion continua, viñetas
  anidadas, imperativo en español, **sin tildes en `.claude/agents/*.md`**, con tildes en
  `docs/`, `CLAUDE.md` y `AGENTS.md`.
- **Efectos colaterales** — si el eje 4 dice que lo verifica el `reviewer`, el parche incluye
  tambien la linea en `.claude/agents/reviewer.md`; si es bloqueante, la mencion en `CLAUDE.md`;
  y **siempre** el espejo en `harnessConfig/` para cada archivo tocado que exista alli
  (`harnessConfig/` es la plantilla del arnes y debe quedar identica a la raiz).
- Si la regla nace de un incidente concreto, sigue la convencion ya usada en `AGENTS.md`
  (`## Regla del gate: quien corre que (2026-08-03)`): titulo fechado y el porque del incidente
  en `docs/`, instruccion corta en el archivo del agente.

**No escribas nada hasta un si explicito.** Cuando lo tengas, aplica el parche tal como lo
propusiste y termina listando los archivos modificados.
