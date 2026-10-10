# QC-116 — sesion-revocada-en-el-mismo-segundo · requirements.md

> **Zona** `backend` · **Complejidad** `low` · **Épica** QC-17 (Identidad y acceso) ·
> **Rama** `feature/QC-116-sesion-revocada-en-el-mismo-segundo`
>
> ## Alcance
>
> Hoy, si una persona abre sesión **en el mismo segundo** en que se escribió su sello «sesiones
> válidas desde» (`users.sessions_valid_from`, QC-23), la sesión **nace revocada**: el login dice que
> sí, la primera página privada la echa a `/login?sesion=fin`. Re-medido el 2026-10-10: login a 16 ms
> de crear el usuario → `sesion=fin`; a 1,5 s entra bien.
>
> El motivo: el instante de emisión (`iat`) viaja firmado **en segundos**, el corte compara
> `iat <= sello` (decisión de QC-23, para que no sobreviva una sesión ajena emitida en el mismo
> segundo del corte) y el sello del alta se guarda con fracción de segundo. Un login posterior al
> sello pero en su mismo segundo es indistinguible, para el corte, de una sesión anterior.
>
> Esta ficha hace que **un login posterior al sello entre**, sin aflojar el corte de QC-23 para las
> sesiones emitidas **antes** del sello.
>
> ## Lo que NO entra
>
> - **Los fixtures E2E** que crean usuarios y entran en el mismo segundo: los arregla **QC-255** en
>   paralelo. Esta ficha no toca `e2e/` (ver pregunta abierta 4).
> - **Cambiar el formato o la versión de la cookie de sesión** (opción A de la pregunta 1, no
>   recomendada).
> - **Migraciones de esquema o de datos** (preguntas 2 y 3: no hacen falta con la opción recomendada).
> - **El caso de dos sellos de la misma persona en el mismo segundo** con un login entre ellos
>   (`design.md > 6`): queda declarado, y cerrarlo es la opción C de la pregunta 1.
>
> _Escrito por `spec_author` el 2026-10-10, sin sembrado previo de `/afinar-feature`. Los requisitos
> de abajo implementan la **opción recomendada (B)** de la pregunta abierta 1; si el humano elige otra,
> la pregunta dice qué requisitos cambian._

## Requisitos (EARS)

### A. La emisión de la sesión en el login

**R1.** CUANDO una persona abre sesión con credenciales válidas y el instante actual, a la precisión
con la que viaja firmado (el segundo), sería **anterior o igual** al sello de esa persona, el sistema
DEBE emitir la sesión con el **primer instante de emisión que ese sello no invalida**.

**R2.** CUANDO una persona abre sesión en el **mismo segundo** en que se escribió su sello —tanto si
el sello tiene fracción de segundo (el que pone la base al dar de alta) como si está truncado al
segundo (el que escriben la activación por enlace, el bloqueo, la inactivación, el cambio de rol y
«cerrar todas»)—, la resolución de esa sesión en su primera petición DEBE devolver a esa persona, y
NO DEBE acabar en `/login?sesion=fin`.

**R3.** SI el instante actual, a la precisión del segundo, ya es **posterior** al sello de la
persona, ENTONCES el sistema DEBE emitir la sesión con el instante actual, exactamente como hoy.

**R4.** SI el primer instante de emisión que el sello no invalida queda **más de 2 segundos** por
delante del instante actual, ENTONCES el sistema NO DEBE adelantar la emisión: DEBE emitirla con el
instante actual, y esa sesión DEBE seguir resolviéndose como inválida, igual que hoy.

**R5.** La caducidad de una sesión emitida con el instante adelantado DEBE ser ese instante de
emisión **más 8 horas**, sin ninguna otra extensión.

**R6.** El login DEBE obtener el sello en la **misma consulta** con la que ya autentica a la persona:
NO DEBE añadir ninguna lectura de base de datos.

**R7.** Toda sesión que emita el login con un instante adelantado por R1 DEBE superar el corte por
sello en su primera resolución, y un milisegundo antes de ese instante el corte DEBE invalidarla: el
cálculo del instante y el corte DEBEN ser complementarios exactos.

### B. Lo que se conserva de QC-23

**R8.** El corte por sello DEBE seguir siendo «anterior **o igual**»: MIENTRAS el instante de emisión
de una sesión, tal como viaja firmado, sea anterior o igual al sello de su usuario, el sistema DEBE
tratarla como inválida.

**R9.** CUANDO se escribe el sello de una persona en el instante `t`, toda sesión emitida en `t` o
antes **sin adelanto** DEBE quedar inválida, incluida una emitida en el mismo segundo que `t`.

**R10.** CUANDO se escribe el sello de una persona en el instante `t` y su sello anterior **no** cae
en el mismo segundo que `t` ni después, toda sesión de esa persona emitida en `t` o antes DEBE quedar
inválida, con o sin adelanto.

**R11.** La reemisión de «cerrar todas menos la actual» (QC-23 R31) DEBE seguir comportándose
exactamente igual: misma sesión superviviente, mismo instante de emisión.

### C. Lo que no cambia

**R12.** El sistema NO DEBE cambiar el formato ni la versión del valor de la cookie de sesión: una
sesión abierta antes de desplegar esta ficha DEBE seguir siendo válida después.

**R13.** La feature NO DEBE incluir ninguna migración de esquema ni de datos: los sellos ya
guardados, en todos los entornos, se quedan como están.

**R14.** La feature NO DEBE añadir ninguna dependencia a `package.json`.

### D. Probar sin depender del reloj

**R15.** El caso de uso del login DEBE aceptar el **instante actual** como dependencia opcional, con
el reloj del sistema como valor por defecto, de modo que el caso del mismo segundo se pruebe con
instantes fijos, sin esperas y sin temporizadores falsos.

**R16.** La regla que decide el instante de emisión DEBE vivir en el **dominio**, como función pura
que recibe el instante actual y el sello por parámetro y no lee ningún reloj.

## Preguntas abiertas

Ninguna bloquea escribir el spec; las cinco tienen opción recomendada y **los requisitos de arriba
ya la aplican**. Si el humano elige otra, se reescribe lo que cada una indica.

1. **¿Dónde se arregla?** Hay cuatro salidas (detalle en `design.md > 2`):
   - **A. Que el token lleve milisegundos.** La garantía de QC-23 se conserva entera. **Pero** cambia
     el formato de la cookie: al desplegar, **todo el mundo tiene que volver a entrar**, y reabre la
     decisión cerrada 7 de QC-23 («el sello no cambia el formato del token»). Toca el código de la
     firma, que es el más delicado del repo.
   - **B (recomendada). Que el login, si ve un sello en su mismo segundo, emita la sesión con el
     segundo siguiente.** Es la salida que el propio spec de QC-23 dejó escrita (§ 12.4) y la que ya
     usa «cerrar todas menos la actual». Nadie pierde la sesión al desplegar, no hay migración y es
     poco código. **Lo que se pierde**, en lenguaje llano: si a una misma persona le escriben el sello
     **dos veces en el mismo segundo** (por ejemplo, un cambio de rol y un «cerrar todas» seguidos)
     y **entre las dos** esa persona entra con su contraseña correcta, esa sesión sobrevive a la
     segunda. Bloquear o borrar no tienen ese hueco (los cortan otros controles). Hoy ya pasa
     exactamente lo mismo con «cerrar todas menos la actual» de QC-23.
   - **C. B más un sello que nunca repite segundo.** Cierra también ese hueco (y el de QC-23). Cuesta
     más: las cuatro escrituras del sello pasan a leer el anterior y escribir siempre un segundo
     después, y cambia la firma del puerto de «cerrar todas». Añadiría requisitos y una tanda.
   - **D. Sello truncado + comparación estricta (`<`).** Es la alternativa que QC-23 descartó por
     escrito: una sesión ajena emitida en el mismo segundo del corte sobreviviría. **No recomendada.**

   **Recomendación: B.** Si el humano exige la garantía sin ningún hueco, C; A solo si se acepta
   sacar a todo el mundo al desplegar.

2. **¿Truncar el sello al segundo en todos los caminos (también el alta)?** **Recomendación: no.**
   Truncar solo **no arregla nada**: con el sello truncado, un login en el mismo segundo tiene
   `iat == sello` y el `<=` lo sigue cortando. Con B, la fracción de segundo del alta deja de
   importar. Además, en producción el alta nace `pending` y no puede entrar hasta activar el enlace,
   que ya escribe el sello truncado. Consecuencia: el comentario de `db/schema.prisma` que dice «las
   escrituras lo truncan» sigue siendo inexacto para el alta; se anota como deuda y no se toca aquí
   (es un archivo caliente y no aporta comportamiento).

3. **¿Corregir los sellos ya guardados (migración de datos)?** **Recomendación: no.** Con B un sello
   con fracción de segundo funciona igual que uno truncado. No se toca la base de producción ni la
   de ningún otro entorno.

4. **¿Cómo se prueba sin depender del reloj, y hace falta un E2E propio?** **Recomendación:** el
   login recibe el «ahora» por parámetro (R15); pruebas unitarias con instantes fijos y una prueba de
   integración contra la base de test que encadena login real → firma real → resolución real con el
   sello escrito en el mismo segundo. **Sin E2E propio**: desde el navegador no se puede forzar el
   mismo segundo sin depender del reloj, así que un E2E pasaría casi siempre aunque el arreglo
   faltara. Los fixtures E2E son de QC-255.

5. **¿Cuánto puede adelantarse como máximo la emisión?** **Recomendación: 2 segundos** (R4). Un sello
   escrito por la aplicación en el mismo segundo pide como mucho 1 s; el segundo extra cubre que el
   reloj de la base vaya algo por delante del de la aplicación (el sello del alta lo pone la base).
   Más allá se cae en el comportamiento de hoy (la sesión nace inválida), que es el lado seguro.
   Consecuencia: una sesión puede durar hasta 8 h y 2 s, como ya dura 8 h y 1 s la reemitida por
   QC-23.

## Cobertura de las decisiones

No hay tabla de `## Decisiones cerradas (no reabrir)`: la ficha no pasó por `/afinar-feature`. Las
restricciones que trae la ficha se cubren así:

| Restricción de la ficha | Requisitos |
| --- | --- |
| No reabrir la garantía de QC-23 (una sesión emitida antes del corte no sobrevive) | R8, R9, R10, R11 (y el hueco declarado en la pregunta 1) |
| Arreglar el login en el mismo segundo de cualquier escritura del sello | R1, R2, R3, R7 |
| Decir si hace falta migración | R13 (no hace falta) |
| Probar sin depender del reloj | R15, R16 |
| No tocar `e2e/` (QC-255) | Lo que NO entra; pregunta 4 |

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| — | — | Ninguna todavía: se llenará con la respuesta del humano a las preguntas abiertas |
