<!-- perfil: revisado=2026-10-06 por=arnes-v2 -->
# docs/conventions.md — Estilo, nombres y errores

## TypeScript
- `strict: true`. Prohibido `any` salvo justificación explícita en comentario.
- Tipos de dominio en `lib/types.ts` o colocados junto al módulo que los usa.
- Validación de entrada externa con un validador (p. ej. zod) en el borde.

## Nombres
- Archivos: `kebab-case.ts`. Componentes React: `PascalCase.tsx`.
- Funciones y variables: `camelCase`. Constantes de entorno: `UPPER_SNAKE`.
- Tablas y columnas Supabase: `snake_case`.

## Estilo
- Formateo con la config del repo (Prettier/ESLint). No se discute manualmente.
- Funciones cortas y con una sola responsabilidad. Si necesita comentario para
  explicar qué hace, probablemente hay que partirla.

## Comentarios (2026-09-15, acotada el 2026-09-17)

- Un comentario explica un **porqué que el código no muestra**: una restricción externa, una
  trampa, una decisión que parece un error y no lo es. Lo que el código ya dice —qué hace, en qué
  orden— no se comenta.
- **Nunca se cita una ficha ni un requisito** en un comentario de producción: ni `QC-<n>`, ni
  `R<n>`, ni `design.md`, ni «decisión cerrada». Sin excepciones. Esa historia vive en `specs/`, en
  los nombres de los tests y en git.
- **Corto.** Un bloque de más de ~5 líneas es señal de que ese porqué pertenece al `design.md`.
- **Si el motivo no está verificado, no se escribe.** Un comentario con la razón equivocada es
  peor que ninguno: invita a romper lo que protege.
- **Producción** es `app/`, `lib/`, `components/`, `hooks/`, `middleware.ts` y `db/`.
  `/// @module <modulo>` no es una cita: es obligatorio (`docs/architecture.md`).
- **Tests** (`tests/`, `e2e/`): la misma regla para los comentarios, pero `R<n>` **sí** va en el
  nombre del caso, porque es el enlace de trazabilidad.
- **`scripts/` queda fuera**: sus avisos viven como comentarios a propósito
  (`docs/gate.md > El anti-patrón: la validación opcional`).
- **Al tocar un archivo se limpian los comentarios de las líneas que toca la rama**, y **nunca se
  imita el estilo de alrededor**. Los comentarios **preexistentes no se arrastran** a la limpieza:
  se limpian por módulo, en fichas del board. Si la limpieza abulta, va en su propio commit
  (`chore(<key>): limpia comentarios de <archivo>`), solo comentarios y sin cambiar código, para
  que la revisión la separe del cambio real.
- **Quién lo verifica:** el `reviewer`, como bloqueante. La guardia sobre el diff es **QC-115**;
  hasta que exista, depende de que el reviewer lo vea.

### Por qué

**Por qué la regla (2026-09-15).** Medido el 2026-09-15 sobre `dev`: en producción el 42 % de las
líneas no vacías eran comentario (24.455 frente a 33.713 de código), 238 de 520 archivos tenían
más comentario que código y 6.549 líneas citaban fichas o requisitos. El código dejó de poder
leerse, y la costumbre se propagaba sola porque cada subagente imita lo que tiene alrededor. Quien
lee el código no tiene delante la ficha que se cita. El caso que lo destapó daba además una razón
incompleta: el diálogo de cierre de sesiones atribuía al portal lo que en realidad protege colgar
fuera del formulario de edición en el árbol de React.

**Por qué se acotó el 2026-09-17.** La redacción original exigía limpiar **el archivo entero**. Eso
convierte cualquier ficha que roce un archivo grande en una limpieza masiva —`e2e/inventario.spec.ts`
tiene 47 citas y `lib/composition/index.ts` tenía 410 líneas de comentario— y es lo que costó **34
commits** en QC-81. El humano ya lo había acotado dos veces en la práctica, en QC-60 y en QC-103;
esto pone el texto de acuerdo con esas decisiones.

**Coste, dicho para que no se revierta.** Limpiar lo que se toca agranda los diffs. No añade
archivos al diff, así que la validación de conflictos entre features no cambia. Los archivos que
nadie toca se limpian por módulo, en fichas del board.

## Manejo de errores
- Nada de `catch` vacíos. Un error o se maneja o se propaga con contexto.
- Errores de integración externa se envuelven con un mensaje que diga qué
  operación falló y con qué entrada (sin filtrar secretos).
- En webhooks y crons, todo error relevante notifica por el canal definido.

## Commits
- Un commit por task lógica completada, no un mega-commit al final.
- Mensaje: `feat(<feature>): <qué>` / `fix(...)` / `test(...)` / `chore(...)`.

## Tests
- Nombre del test describe el comportamiento, no la función:
  `devuelve 401 cuando el token es invalido`, no `test handler`.
- Cada requisito `R<n>` del spec tiene su test correspondiente.
