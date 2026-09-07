# QC-70 — errores-centralizados · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-54` ·
> **Rama** `feature/QC-70-errores-centralizados`
>
> ## Alcance
>
> Dejar **un solo sitio donde vivan el código de error y su mensaje**. Hoy cinco módulos
> (`inventario`, `pedidos`, `proveedores`, `recetas`, `unidades`) declaran cada uno su familia
> de errores, y **siete** adaptadores driving llevan copiada la misma `toErrorState` que la
> convierte en `{ status: 'error', code, message }`. Entra el catálogo único, una sola
> implementación del traductor, y los cinco módulos migrados.
>
> El código **sigue siendo una palabra estable** (`duplicate_name`), no un número: siete
> pantallas ya deciden por él y en un log se lee solo. El catálogo pasa a ser **cerrado** —el
> código deja de ser `string` y pasa a ser la lista, así que uno mal escrito rompe el
> typecheck— y una **guardia ejecutable** da rojo si un módulo declara errores fuera de él.
>
> Los códigos **se abren por caso concreto**: `not_found` hoy significa cinco cosas distintas
> según quién lo lance, y un código con un solo mensaje no puede decir a la vez «el pedido» y
> «la receta». Las pantallas que hoy comparan contra el código genérico se actualizan — por eso
> la zona es `fullstack`.
>
> El mensaje sale **siempre** del catálogo, y el catálogo mapea el código a una **clave
> estable** y la clave a su texto, con el español como único idioma cargado. Eso es «preparado
> para traducir» **por forma**, sin librería y sin dependencia nueva.
>
> ## Lo que NO entra
>
> - **El identificador de petición y lo que se escribe en los logs** → **QC-71**, que depende
>   de esta.
> - **La internacionalización de la aplicación** → **QC-72**. QC-70 deja las claves; resolverlas
>   contra archivos de idioma, y elegir la librería, es una decisión de toda la aplicación que
>   hoy no está tomada en ningún sitio.
> - **`identity`.** No tiene familia de errores que migrar, y su login devuelve **a propósito**
>   un mensaje genérico que no revela si falló el usuario o la contraseña (QC-7). Meterlo al
>   catálogo sin romper eso es trabajo distinto. Anotado, sin ficha — mismo criterio con el que
>   QC-54 dejó fuera el tipo `Actor`.
> - **Ningún cambio en `db/`**: ni migración, ni esquema, ni seed. No hay tabla de errores.
> - **El valor de los códigos que ya consumen las pantallas no se renombra por gusto**: solo
>   cambian los que la apertura por caso obliga a partir.
>
> _Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Dónde vive el catálogo.** El `domain/` de un módulo **no puede** importar `lib/shared/**`
   (`docs/architecture.md > La regla de dependencias`), así que el catálogo no puede vivir ahí y
   ser lanzado desde el dominio. El patrón sancionado es publicarlo por el **barrel de un
   módulo** (`@/lib/modules/N`), que es lo que QC-54 hace con `ROLE_ADMINISTRADOR`. Si ese
   módulo es uno nuevo o uno existente lo decide el `design.md` con su alternativa descartada.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-07 | ¿El código es un número (`code: 30`), como pedía la ficha original? | **No: sigue siendo una palabra estable.** Siete pantallas ya comparan contra `'duplicate_name'`, `'not_found'` e `'invalid_input'`, y un número obligaría a tocarlas todas y a mantener una tabla aparte para leer un log. Lo que se arregla no es la forma del código, sino que la lista viva en un sitio y no en cinco. |
| 2026-09-07 | «Un solo tipo de error»: ¿desaparecen las cinco familias por módulo? | **No.** Cada módulo conserva la suya y toma de ahí el código y el mensaje; lo que se unifica es el catálogo y las siete copias del traductor, que pasan a ser una. **Heredado de QC-54 (2026-09-07)**, que descartó un error compartido por la misma razón: no puede heredar de cinco bases a la vez y caería fuera de los siete `catch` que hoy funcionan. |
| 2026-09-07 | ¿La ficha construye la pieza, o además migra? | **Migra los cinco módulos** y borra las siete copias de `toErrorState`. Solo construir la pieza dejaría seis formas vivas a la vez y nada obligaría a cerrar la migración, o sea añadiría duplicación en vez de quitarla. |
| 2026-09-07 | ¿Qué ve quien provoca un error que NO está en el catálogo (fallo de base de datos, bug)? | **Un código genérico y mensaje neutro.** El detalle real va al log del servidor y **nunca** al navegador: un mensaje de Prisma en pantalla filtra nombres de tablas y a veces datos. Es lo que ya hacen las siete copias del traductor; se conserva. |
| 2026-09-07 | **(revisada el mismo día, al acotar QC-71)** ¿El error genérico lleva alguna referencia para buscarlo en el log? | **Sí la lleva, y esta fila SUSTITUYE a la anterior en ese punto.** Al acotar QC-71 se decidió que el identificador de petición acompaña al error inesperado, para que quien reporta el fallo pueda decir cuál buscar — que es el motivo por el que QC-71 existe. **Lo que no cambia:** el mensaje sigue siendo neutro y el detalle interno (traza, nombres de tablas, SQL) sigue sin salir al navegador. QC-70 deja el hueco en la forma del error; QC-71 lo rellena. La `description` del board se actualizó el mismo día. |
| 2026-09-07 | `not_found` significa hoy cinco cosas. ¿Un código o uno por caso? | **Uno por caso concreto.** Es lo único compatible con que cada código tenga UN mensaje. El catálogo nace con ~20 entradas en vez de ~6, y las pantallas que comparan contra el código genérico se actualizan. |
| 2026-09-07 | ¿El mensaje se puede sobreescribir en el sitio que lanza? | **No: sale siempre del catálogo.** Poder sobreescribirlo dejaría el mensaje fuera del catálogo, que es justo lo que la ficha centraliza, y nada impediría que la frase volviera a escribirse en cinco sitios. |
| 2026-09-07 | ¿Entra algo contra la reincidencia? | **Sí: guardia ejecutable en `tests/guards` y catálogo cerrado.** La guardia da rojo si un módulo declara errores fuera del catálogo; el tipo cerrado hace que un código mal escrito rompa el typecheck. **Mismo criterio que QC-54**: sin ella la ficha limpia el presente y no el futuro, que es el motivo por el que existe. |
| 2026-09-07 | ¿Los mensajes se pueden traducir? | **Preparado por forma, sin librería.** El catálogo mapea código → clave estable y clave → texto, con el español como único idioma cargado. **No entra ninguna dependencia**: la internacionalización de la aplicación es QC-72, creada al acotar esta. |
| 2026-09-07 | ¿Hace falta E2E? | **No, y se difiere aquí con motivo.** No hay cambio de comportamiento observable: la prueba de que nada se movió son los tests de los cinco módulos y los de las siete pantallas, que deben seguir verdes cambiando solo el código que se comparaba. **Heredado de QC-54.** |
| 2026-09-07 | ¿Antes o después de QC-54? | **Después: `depends_on: QC-54`.** QC-54 está sembrada, con worktree montado, y su decisión cerrada parametriza `requireAdmin` por una fábrica que recibe **el `UnauthorizedError` de cada módulo**. QC-70 toca esos mismos cinco `domain/errors.ts`. El que llegue segundo se come el conflicto, y QC-54 llegó primero. |
