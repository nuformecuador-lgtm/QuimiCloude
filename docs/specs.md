# docs/specs.md — Proceso Spec Driven Development

Toda feature con `"sdd": true` pasa por este proceso ANTES de tocar código.
Produce tres archivos en `specs/<key>-<slug>/`, dentro del worktree de la feature (son de su
rama, `docs/equipo.md > Qué estado es de quién`). Hay una puerta de aprobación humana
entre la especificación y la implementación.

## Los tres archivos

### 1. requirements.md — el QUÉ, en EARS
Requisitos numerados (`R1`, `R2`…), sin detalles de implementación. Usa notación
EARS para que sean testeables y sin ambigüedad:

- **Ubicuo:** El sistema DEBE `<comportamiento>`.
- **Por evento:** CUANDO `<disparador>`, el sistema DEBE `<respuesta>`.
- **De estado:** MIENTRAS `<estado>`, el sistema DEBE `<comportamiento>`.
- **Condicional:** SI `<condición>`, ENTONCES el sistema DEBE `<respuesta>`.
- **Opcional:** DONDE `<feature presente>`, el sistema DEBE `<comportamiento>`.

Cada requisito debe poder verificarse con un test. Si no se puede testear, está
mal escrito.

**El archivo puede venir sembrado.** El comando `/afinar-feature` cierra el alcance y las
decisiones con el humano *antes* de F1.2 y deja escrito el bloque de Alcance, la tabla
`## Decisiones cerradas (no reabrir)` y las `## Preguntas abiertas` que queden. En ese caso
`spec_author` **completa** el archivo —rellena los requisitos EARS— y no reabre la tabla ni
reescribe el alcance. Cada fila de la tabla debe acabar cubierta por al menos un `R<n>`, o esa
decisión nunca llega a tener test.

Es el mismo checkpoint de siempre, solo que la conversación ocurre antes de escribir en vez de
después. No es opcional por comodidad.

### 2. design.md — el CÓMO técnico
Decisiones antes de escribir código: modelo de datos (tablas, RLS, migraciones),
endpoints/rutas Next, contratos de entrada/salida, integraciones externas si las hay,
y **al menos una alternativa que descartaste y por qué**.

Si propone una librería nueva, lo dice aquí: la aprobación del spec la incluye (regla 7 de
`CLAUDE.md`, `AGENTS.md > F1.4`).

### 3. tasks.md — el desglose
Checklist de pasos discretos y verificables. Cada task pequeña, con criterio de
"hecho". Marca dependencias y las que pueden ir en paralelo `[P]`.

Incluye una sección **«Archivos esperados»** con las rutas que la feature va a tocar, cada una
entre backticks. `scripts/archivos-en-vuelo.mjs` lee **todas** las rutas entre backticks del
`tasks.md`, desde la rama publicada, para detectar choques con las features en vuelo de todo el
equipo; la sección es la que garantiza que ninguna falte (`docs/equipo.md > Conflicto de archivos
entre personas`).

## La puerta de aprobación humana (`spec_ready`)

Cuando los tres archivos están listos, el leader pasa la feature a `spec_ready`, mueve la
tarjeta a *Spec en revisión*, comenta la ruta del spec en el issue y hace `git push`
(`AGENTS.md > F1.3`). El proceso **se detiene**. El humano lee los tres archivos y responde:

- **aprobado** → la forma canónica es mover la tarjeta de *Spec en revisión* a *En curso*
  (queda autor y fecha); un "aprobado" escrito también vale. Se procede a implementar.
- **cambios** → el `spec_author` corrige y se vuelve a pedir aprobación.

Nunca se escribe código de producción sin esta aprobación. Es el checkpoint que
evita construir lo incorrecto de forma rápida y cara.

## Trazabilidad

Cada `R<n>` de requirements.md debe terminar mapeado a un test concreto. El
implementer documenta ese mapa en `progress/impl_<key>.md` y el reviewer lo
verifica. Un requisito sin test es un fallo de la feature.

### Por qué

**Sembrar antes del spec.** Los primeros specs escritos en QuimiCloude necesitaron una o dos
revisiones completas —con renumeración de requisitos incluida— para incorporar respuestas que el
humano ya tenía desde el principio. `/afinar-feature` existe para hacer esa conversación antes.
