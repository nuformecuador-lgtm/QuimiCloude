# Registro de revisión de prompts

Este documento registra la **revisión humana** de los dos prompts definitivos (`catalogo` y
`formula`) que el sistema envía a la IA para leer PDFs. Ningún test automatizado llama al proveedor de IA (hoy Claude):
el gate corre sin red y sin gastar, así que la única forma de comprobar que un prompt pide lo
correcto y lo pide bien es que una persona lo pase contra un PDF real y firme el resultado, campo
por campo.

**Consecuencia aceptada.** Este registro **no copia el texto del prompt revisado ni ninguna huella
de él**. Por tanto, un veredicto **no se puede volver a comprobar** contra el texto al que se
refería: si el prompt cambia en el entorno de despliegue, la fila queda como testimonio de una
pasada concreta, no como una garantía sobre el texto vigente hoy.

Esta plantilla la escribe el arnés; **la rellena y la firma una persona**. Ningún agente puede
darla por hecha ni completar una fila en su nombre.

## Ficha de pasada

| Dato | Valor |
|---|---|
| Fecha | `AAAA-MM-DD` |
| Estrategia | `catalogo` \| `formula` |
| PDF de muestra | nombre del archivo y nº de páginas (**el PDF no entra al repositorio**) |
| Firma | nombre de la persona que revisó |

### Tabla de veredictos — `catalogo`

| Campo | Veredicto | Nota |
|---|---|---|
| nombre | bien / mal / no estaba | |
| presentación | bien / mal / no estaba | |
| unidad | bien / mal / no estaba | |
| precio | bien / mal / no estaba | |
| compra mínima | bien / mal / no estaba | |
| tiempo de entrega | bien / mal / no estaba | |

### Tabla de veredictos — `formula`

| Campo | Veredicto | Nota |
|---|---|---|
| nombre | bien / mal / no estaba | |
| descripción | bien / mal / no estaba | |
| materias primas (cantidad) | bien / mal / no estaba | |
| materias primas (unidad) | bien / mal / no estaba | |
| pasos y su orden | bien / mal / no estaba | |

### Filas de cierre (comunes a las dos estrategias)

| Comprobación | Veredicto | Nota |
|---|---|---|
| la respuesta es JSON con la forma que el prompt declara (R12) | bien / mal | |
| lo que el PDF no traía volvió `null`, sin inventarse (R13) | bien / mal / no aplica | |

## Qué significa cada veredicto

- **bien** — el dato salió y coincide con lo que dice el PDF.
- **mal** — el dato salió y **no** coincide, o salió inventado.
- **no estaba** — el PDF no traía ese dato y la IA lo devolvió **vacío**. Es el veredicto
  **correcto** para un campo ausente: no es un fallo. Si el PDF no lo traía y la IA lo rellenó,
  eso es **mal**.

## Cuándo se da por bueno un prompt

Un prompt es bueno cuando su tabla no tiene ningún **mal**. La nota es obligatoria en toda fila
con **mal**.
