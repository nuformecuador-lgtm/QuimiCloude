# QC-64 — editor-y-lectura-de-pasos · requirements.md

> **Zona** `frontend` · **Complejidad** `high` · **depends_on** `QC-62` ·
> **Rama** `feature/QC-64-editor-y-lectura-de-pasos`
>
> **Alcance.** La mitad de pantalla de los pasos enriquecidos. En el formulario de receta
> (`/produccion/formulas`, QC-26), cada paso se escribe con un **editor enriquecido de terceros**
> de esquema cerrado —párrafo, negrilla, cursiva y lista de verificación— que produce el documento
> que define **QC-62**, y se quita el selector de tipo del paso. Se añade un **componente de
> lectura** que presenta la receta como formulario de **un paso por pantalla** —Anterior, Siguiente,
> Finalizar en el último, elementos que se marcan y desmarcan— y se monta **únicamente** dentro del
> modal de «Vista previa» del editor.
>
> **Lo que NO entra.** El contrato del documento, la desaparición de `type` y el borrado de los
> pasos viejos: **QC-62**, que bloquea a esta. El acceso del **Operador** al componente de lectura,
> con su ruta propia y la apertura de la lectura en el backend: **QC-63 —
> ejecutar-receta-operador**. Registrar quién marcó qué y cuándo: **no tiene ficha y esta acotación
> no la crea**. Buscar y ordenar recetas: sigue sin soporte del backend (QC-26, QC-57).
>
> Sembrado por `/afinar-feature` el 2026-09-04 y **nacida de la partición** de QC-62 el 2026-09-04,
> por la regla de partición de `fullstack` de `AGENTS.md > F1.0`. El bloque de Alcance y la tabla
> de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Vocabulario, heredado tal cual de **QC-62** para que no haya dos lecturas: **documento** es el
> contenido completo de UN paso; **elemento** es cada párrafo y cada ítem de lista de verificación
> dentro de ese documento; **fragmento** es cada trozo de texto con sus marcas. Además, aquí:
> **editor** es el control con el que el Administrador redacta un paso en el formulario de receta;
> **asistente de lectura** es el componente que presenta la receta paso a paso; **vista previa** es
> el modal del formulario que monta el asistente sobre lo que hay escrito en ese momento.

### El editor de un paso

**R1.** El sistema DEBE ofrecer, para cada paso del formulario de receta, un **editor de texto
enriquecido** cuyo contenido se corresponda con el **documento del contrato del módulo `recetas`**
(QC-62 R1–R3), y NO DEBE seguir ofreciendo el campo de texto plano del puente de QC-62 R19.

**R2.** El editor DEBE ofrecer exactamente cuatro construcciones —**párrafo**, marca de
**negrilla**, marca de **cursiva** y **lista de verificación**— y NO DEBE ofrecer ningún control,
atajo de teclado ni menú que produzca ninguna otra: ni encabezado, ni enlace, ni imagen, ni tabla,
ni cita, ni lista numerada, ni bloque de código, ni ninguna marca distinta de negrilla y cursiva.

**R3.** CUANDO el usuario **pega** contenido con formato ajeno al esquema cerrado —HTML de otra
página, texto de un procesador de textos, Markdown—, el sistema DEBE conservar su **texto** y
descartar todo lo que el esquema cerrado no admite, sin dejar en el editor ningún nodo ni marca
fuera de las cuatro de R2.

**R4.** MIENTRAS el usuario edita un paso, el estado del editor DEBE poder proyectarse a un
documento que `recipeStepSchema` acepte **sin ninguna limpieza posterior**, conservando: el orden
de los elementos, los saltos de línea como párrafos —incluido el párrafo sin fragmentos—, las
marcas combinadas sobre el mismo fragmento y el texto **tal cual** se escribió, sin recortarlo ni
normalizarlo (QC-62 R1, R2, R3, R5).

**R5.** CUANDO se envía el formulario, cada paso DEBE viajar como el documento del contrato y NO
DEBE llevar ningún campo que ese contrato no declare —en particular, ningún estado de marcado, ni
identificador de bloque, ni versión, ni tipo de paso—.

**R6.** MIENTRAS un paso se está redactando, los ítems de su lista de verificación DEBEN
presentarse **sin estado marcable**: el sistema NO DEBE permitir marcarlos ni desmarcarlos dentro
del editor, porque el contrato no guarda ese estado y un valor que se puede fijar y se pierde en
silencio es un engaño al usuario.

**R7.** SI el documento de un paso supera el tope de elementos publicado por el contrato
(`MAX_STEP_ELEMENTS`), ENTONCES el sistema DEBE avisarlo junto a ese paso **antes** de invocar la
operación de guardado; y DEBE tomar ese número y ese conteo del contrato del módulo
(`MAX_STEP_ELEMENTS`, `countRecipeStepElements`), sin reescribir ninguno de los dos en la pantalla
(QC-62 R11).

**R8.** El editor NO DEBE imponer ningún tope de **caracteres**: ni al documento del paso, ni a un
párrafo, ni a un ítem, ni a un fragmento (QC-62 R12).

**R9.** CUANDO se abre una receta existente para editarla, el sistema DEBE cargar en el editor de
cada paso el documento guardado **con sus marcas y sus listas de verificación intactas**, y NO DEBE
aplanarlo a texto plano ni perder ninguno de sus elementos.

**R10.** El formulario de receta NO DEBE ofrecer ningún **selector de tipo de paso** ni ningún
control equivalente que clasifique el paso entero, en ninguno de sus dos modos (alta y edición):
que un paso lleve lista de verificación se deduce de su propio documento (QC-62 R9, R10).

### La vista previa

**R11.** El sistema DEBE ofrecer en el formulario de receta un control de **«Vista previa»** que
abra un modal con el **asistente de lectura** montado sobre los pasos **tal como están en el
formulario en ese instante**, sin guardar la receta y sin invocar ninguna operación del módulo.

**R12.** El asistente de lectura NO DEBE ser alcanzable por ninguna vía distinta de ese modal: el
sistema NO DEBE publicar una ruta propia para él, NO DEBE enlazarlo desde el listado del catálogo y
NO DEBE ponerlo al alcance de ningún rol distinto del que ya puede abrir el formulario.

**R13.** CUANDO se cierra la vista previa, el sistema DEBE devolver al usuario al formulario con
**todo lo que había escrito intacto**, y NO DEBE modificar ningún campo por el hecho de haberla
abierto.

### El asistente de lectura

**R14.** El asistente DEBE presentar **un solo paso por pantalla** —nunca dos a la vez—, con su
documento renderizado según sus elementos y marcas, e indicando la **posición** del paso actual
dentro del total.

**R15.** El asistente DEBE ofrecer **Anterior** y **Siguiente** para moverse entre pasos, y en el
**último** paso DEBE ofrecer **Finalizar** en lugar de Siguiente; MIENTRAS se está en el primer
paso, Anterior NO DEBE permitir retroceder.

**R16.** El asistente DEBE permitir **marcar y desmarcar** cada ítem de lista de verificación del
paso que se está viendo, y DEBE conservar lo marcado al ir y volver entre pasos dentro de la misma
apertura del asistente.

**R17.** MIENTRAS queden ítems sin marcar en el paso actual, el sistema DEBE **impedir avanzar**
—tanto con Siguiente como con Finalizar— y DEBE presentar el **motivo en texto visible junto al
botón**, nunca sólo como `title`, `:hover` o atributo; y NO DEBE ofrecer ninguna vía para avanzar
de todos modos.

**R18.** SI el paso actual no contiene ningún ítem de lista de verificación, ENTONCES avanzar DEBE
estar permitido sin ninguna acción previa del usuario.

**R19.** El sistema NO DEBE persistir lo marcado en el asistente: NO DEBE enviarlo a ninguna
operación del módulo `recetas`, NO DEBE guardarlo en el navegador más allá de la vida del
componente, y CUANDO se cierra la vista previa y se vuelve a abrir, todos los ítems DEBEN aparecer
sin marcar.

**R20.** El asistente DEBE recibir **por props** los pasos que presenta y el comportamiento de
**Finalizar**, y NO DEBE leer datos por su cuenta, NO DEBE importar `lib/composition` ni ninguna
Server Action, y NO DEBE depender de la ruta del formulario de fórmulas ni de su estado: montarlo
en otra ruta DEBE requerir únicamente pasarle esas props.

**R21.** SI la receta no tiene ningún paso, ENTONCES el asistente DEBE presentar un estado vacío
explícito y NO DEBE ofrecer navegación entre pasos.

**R22.** CUANDO el usuario pulsa **Finalizar** dentro de la vista previa, el sistema DEBE cerrar el
modal y descartar el marcado, y NO DEBE guardar la receta ni navegar fuera del formulario.

### Alcance, permisos y herencia

**R23.** El editor y la vista previa DEBEN quedar dentro de la pantalla que ya es **sólo del
Administrador** (QC-25 R1–R3, QC-26); esta feature NO DEBE cambiar ninguna autorización, NO DEBE
tocar el borde ni el service del módulo `recetas` y NO DEBE abrir ningún acceso nuevo al Operador.

**R24.** El sistema DEBE conservar el **reordenado de pasos por arrastre y su equivalente por
teclado** (QC-26 R33, R34) funcionando con el editor dentro de cada paso —tomar un paso, moverlo y
soltarlo NO DEBE requerir ratón, y escribir dentro del editor NO DEBE iniciar un arrastre—; y NO
DEBE re-crear nada del armazón heredado de QC-26: layout privado, Server Actions, sesión por props,
rutas en constantes, el `<Toaster />` ya montado y las primitivas de shadcn añadidas por su CLI.

**R25.** La **única** dependencia de terceros que esta feature DEBE incorporar es la del editor
enriquecido aprobada por el humano al aprobar este spec; cada entrada nueva de `package.json` DEBE
tener su fila en `docs/dependencias.md` con el resultado de los cuatro checks, y el sistema NO DEBE
incorporar ninguna otra dependencia. Los archivos que importan esa librería DEBEN quedar
**acotados y enumerados en `design.md`**, para que sustituirla sea reescribir esos archivos y no
buscarla por todo el repo.

### Plataforma, accesibilidad y verificación

**R26.** El editor y el asistente DEBEN ser utilizables en viewport angosto y ancho: sus controles
táctiles DEBEN medir al menos **44×44 px**, sus campos de texto DEBEN tener `font-size` de al menos
**16 px**, NO DEBEN usar `100vh` como alto de pantalla y NO DEBEN depender de `:hover` como única
vía para descubrir o activar nada (QC-26 R19, R34, R50).

**R27.** El editor y el asistente DEBEN ser operables **enteramente por teclado**: los controles de
formato y de lista, los ítems marcables y los botones de navegación DEBEN ser alcanzables con el
tabulador y activables sin ratón, y CUANDO cambia el paso que se muestra, el asistente DEBE
anunciarlo a la tecnología de asistencia.

**R28.** El sistema DEBE quedar cubierto por un test **E2E** que recorra el camino completo en un
navegador real: redactar un paso con **negrilla** y una **lista de verificación**, guardar la
receta, **reabrirla** y comprobar que el paso se ve igual que se guardó, y recorrer el asistente
dentro de la vista previa marcando los ítems hasta **Finalizar**.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)` queda cubierta por al menos un requisito. Una
decisión sin requisito nunca llega a tener test, y `CHECKPOINTS.md > Trazabilidad` exige el mapa
`R<n> -> test`.

| Decisión cerrada | Requisitos que la cubren |
| --- | --- |
| ¿Quién puede usar el editor y la vista previa? | R23 |
| ¿Y el Operador? | R12, R20, R23 |
| ¿El asistente tiene ruta propia? | R11, R12 |
| ¿Se puede avanzar con elementos sin marcar? | R17, R18 |
| ¿Se guarda lo que el usuario marca? | R5, R6, R19 |
| ¿Sigue el selector de tipo de paso? | R10 |
| ¿Editor a mano o librería? | R1, R2, R25 |
| ¿Qué se hereda montado y no se re-crea? | R24 |
| ¿Hace falta E2E? | R28 |
| ¿Multiplataforma? | R26, R27 |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea la pantalla.

1. **¿El bloqueo de Siguiente necesitará una vía de escape?** Hoy bloquea sin excepción
   (decisión 4), y quien lo sufre es el Administrador dentro de la vista previa. Cuando **QC-63** lo
   ponga en manos de un operario en turno puede hacer falta un «continuar de todos modos» con
   motivo escrito — y eso arrastra dónde se guarda ese motivo, que hoy no tiene ficha. **Se decide
   en QC-63, no aquí.**
2. **¿Qué librería?** El diseño acordado apunta a TipTap/ProseMirror, pero **no está cerrado**: lo
   propone el `design.md` con los cuatro checks corridos y se aprueba con el spec (decisión 7).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | ¿Quién puede usar el editor y la vista previa? | **Solo el Administrador**, heredado de **QC-25 R2**. Esta ficha **no toca el backend de permisos**. |
| 2026-09-04 | ¿Y el Operador? | El componente de lectura se construye **independiente y reutilizable** justo porque más adelante lo usará él, pero aquí **no se le abre ningún acceso**. Va en **QC-63**. |
| 2026-09-04 | ¿El asistente tiene ruta propia? | **No.** Vive únicamente dentro del modal de «Vista previa» del editor: sin URL propia, sin entrada desde el listado del catálogo. |
| 2026-09-04 | ¿Se puede avanzar con elementos sin marcar? | **No.** Siguiente queda **bloqueado** hasta que todos los elementos marcables del paso estén marcados, con el motivo visible al lado del botón. |
| 2026-09-04 | ¿Se guarda lo que el usuario marca? | **No.** El marcado vive en el navegador mientras dura la vista previa y se pierde al cerrarla. |
| 2026-09-04 | ¿Sigue el selector de tipo de paso? | **No**: lo quita esta ficha, porque QC-62 elimina el campo `type` del contrato. |
| 2026-09-04 | ¿Editor a mano o librería? | **Librería**, por la **regla 7** de `CLAUDE.md`: el `design.md` la propone con los **cuatro checks de salud** y su fila en `docs/dependencias.md`, y se aprueba **junto con el spec (F1.4)**. Ver pregunta abierta 2. |
| 2026-09-04 | ¿Qué se hereda montado y no se re-crea? | El **reordenado por arrastre con equivalente por teclado** y `dnd-kit` como excepción ya aprobada (**QC-26 R33, R34, R45**); y el armazón de QC-26 —layout privado, Server Actions, sesión por props, rutas en constantes, `<Toaster />` ya montado, shadcn por CLI— más su E2E de recetas. |
| 2026-09-04 | ¿Hace falta E2E? | **Sí, el camino completo**: redactar un paso con negrilla y lista, guardar, reabrir la receta y comprobar que **se ve igual que se guardó**, y recorrer el asistente en la vista previa hasta **Finalizar**. Es lo que pide `CHECKPOINTS.md` para datos que se presentan a otros usuarios. |
| 2026-09-04 | ¿Multiplataforma? | Sin excepción, heredado de **QC-26 R19, R34, R50**: objetivos táctiles de 44×44 px, nada detrás de `:hover`, y el asistente y el editor operables por teclado. |
