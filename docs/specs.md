# docs/specs.md — Proceso Spec Driven Development

Toda feature con `"sdd": true` pasa por este proceso ANTES de tocar código.
Produce tres archivos en `specs/<feature>/`. Hay una puerta de aprobación humana
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
después. No es opcional por comodidad: los tres specs escritos hasta hoy necesitaron una o dos
revisiones completas —con renumeración de requisitos incluida— para incorporar respuestas que el
humano ya tenía desde el principio.

### 2. design.md — el CÓMO técnico
Decisiones antes de escribir código: modelo de datos (tablas, RLS, migraciones),
endpoints/rutas Next, contratos de entrada/salida, integraciones externas si las hay,
y **al menos una alternativa que descartaste y por qué**.

### 3. tasks.md — el desglose
Checklist de pasos discretos y verificables. Cada task pequeña, con criterio de
"hecho". Marca dependencias y las que pueden ir en paralelo `[P]`.

## La puerta de aprobación humana (`spec_ready`)

Cuando los tres archivos están listos, el estado pasa a `spec_ready` y el proceso
**se detiene**. El humano lee los tres archivos y responde:

- **"aprobado"** → se procede a implementar.
- **cambios** → el spec_author corrige y se vuelve a pedir aprobación.

Nunca se escribe código de producción sin esta aprobación. Es el checkpoint que
evita construir lo incorrecto de forma rápida y cara.

## Trazabilidad

Cada `R<n>` de requirements.md debe terminar mapeado a un test concreto. El
implementer documenta ese mapa en `progress/impl_<feature>.md` y el reviewer lo
verifica. Un requisito sin test es un fallo de la feature.
