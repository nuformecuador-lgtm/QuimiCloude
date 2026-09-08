# QC-71 — identificador-de-request · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** `QC-70` ·
> **Rama** `feature/QC-71-identificador-de-request`
>
> ## Alcance
>
> Que **cada petición lleve un identificador propio** y que ese identificador aparezca en la
> línea de log del fallo, para poder encontrar en los registros la petición concreta que falló.
> El id se genera en el middleware, viaja hasta la capa que ya atrapa los errores, y se escribe
> **solo cuando hay error**.
>
> El **error inesperado** —el genérico de QC-70, el que sale cuando revienta algo que no está en
> el catálogo— **lleva el identificador de vuelta al navegador**, para que quien reporta el fallo
> pueda decir cuál buscar. Lo que no cambia: el mensaje sigue siendo neutro y el detalle interno
> (traza, nombres de tablas, SQL) sigue sin salir. Mostrarlo obliga a tocar los componentes de
> error de las pantallas — por eso la zona es `fullstack`.
>
> **Sin dependencia nueva:** `crypto.randomUUID()` es global en los dos runtimes.
>
> ## Lo que NO entra
>
> - **El catálogo de códigos y el tipo de error** → **QC-70**, de la que esta depende.
> - **Una línea de log por petición**, con ruta y duración. Se descartó: es volumen, y las rutas
>   del ERP llevan identificadores de pedido y de proveedor y a veces el texto buscado, que
>   `docs/architecture.md > Anti-patrones` prohíbe registrar. Anotado, sin ficha.
> - **El identificador dentro del `domain/`** de los módulos. Se queda en la capa que atrapa los
>   errores; el dominio no lo ve y no se declara ningún puerto nuevo.
> - **Ningún cambio en `db/`**: el identificador no se guarda en ninguna tabla.
> - **La política de retención o el destino de los logs.** Hoy los logs son `console.*`; esta
>   ficha no cambia adónde van.
>
> _Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Dónde se engancha la generación del id.** Next admite **un solo** `middleware`, y hoy lo
   ocupa el portero de rutas de `identity` (`route-guard-middleware.ts`, QC-9). Meter el id dentro
   de ese adaptador lo hace responsable de dos cosas; encadenar dos middlewares obliga a inventar
   el punto donde se componen, que hoy no existe. Lo decide el `design.md` con su alternativa
   descartada. **La restricción que ninguna de las dos opciones puede saltarse:**
   `tests/guards/guard-middleware-edge.test.ts` recorre el cierre de imports completo desde
   `middleware.ts` y prohíbe `node:crypto`, `crypto`, `@prisma/client` y **`next/headers`**.
2. **Cómo cruza el id del middleware a la Server Action.** Son dos ejecuciones distintas en
   runtimes distintos, y el único canal es una cabecera. Es una decisión de diseño, pero se anota
   aquí porque es la parte que puede no funcionar en producción sin que ningún test lo note — el
   mismo modo de fallo que motivó `guard-middleware-edge`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-07 | ¿Quien provoca el error ve el identificador? | **Sí, junto al error inesperado.** Es el motivo por el que existe la ficha: sin devolverlo, quien reporta el fallo no puede decir cuál buscar. **Reabre y sustituye la fila de QC-70** que había cerrado «ningún detalle interno»: lo que no sale sigue sin salir (traza, nombres de tablas, SQL); lo que sale es el identificador y nada más. La `description` de QC-70 y su tabla de decisiones se actualizaron el mismo día. |
| 2026-09-07 | ¿Viaja en TODAS las respuestas, o solo en el error? | **Solo en el error.** Devolverlo siempre expone un dato interno en cada petición, incluidas las públicas, a cambio de una comodidad de depuración que nadie ha pedido. |
| 2026-09-07 | ¿Hasta dónde llega el identificador dentro del servidor? | **Hasta la capa que ya atrapa los errores** — el traductor único que deja QC-70. **No llega al `domain/`**, y por tanto **no se declara ningún puerto nuevo**. Se descartó llegar al dominio a la vista de lo que costó el precedente: el puerto `ListQueryLog` de QC-57 acabó declarado **cinco veces** para una sola implementación. |
| 2026-09-07 | ¿Una línea de log por petición, o solo cuando falla? | **Solo cuando falla.** El id se genera siempre; la línea se escribe cuando hay error. **Heredado de QC-57**, cuyo log de listados dejó escrito el criterio: «un aviso por cada consulta limpia es ruido, y el ruido acaba en un filtro de logs que también se traga el aviso que importa». |
| 2026-09-07 | ¿Librería de identificadores? | **Ninguna.** `crypto.randomUUID()` es global en el runtime del borde y en Node, así que no hace falta importar nada — lo cual además es condición para pasar `guard-middleware-edge`, que prohíbe importar `node:crypto` y `crypto`. Cero dependencias nuevas, cero paradas de la regla 7. |
| 2026-09-07 | ¿Hace falta E2E? | **No, y se difiere aquí con motivo.** El comportamiento visible no cambia: nadie entra ni deja de entrar a ninguna pantalla por esto. Que el id sea el mismo en el middleware y en la acción, y que aparezca en la línea del fallo, se prueba sin navegador. **Heredado de QC-54 y QC-70.** |
| 2026-09-07 | ¿El identificador se guarda en alguna tabla? | **No.** Vive en la petición y en el log. Una tabla de errores es otra ficha y nadie la ha pedido. |
