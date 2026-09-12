# QC-77 — aislamiento-de-la-base-en-tests-de-integracion · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** ninguna ·
> **Rama** `feature/QC-77-aislamiento-de-la-base-en-tests-de-integracion`
>
> **Alcance.** Cada corrida de los tests de integracion arranca sobre **su propia base
> desechable**, creada desde una plantilla ya migrada y sembrada, y **borrada al terminar pase lo
> que pase**. Los 41 archivos de `tests/integration/**` dejan de compartir base con la app y con
> las demas corridas, asi que ninguna vuelve a encontrar las filas de la anterior. La regla es la
> misma en `./init.sh` completo y en `--rapido`. Entra ademas un subcomando que lista y borra las
> bases de test que ya no tienen worktree vivo, y un aviso del gate —amarillo, sin fallar— cuando
> la base de desarrollo tiene migraciones pendientes.
>
> **Lo que NO entra.**
> - **La regla del correlativo del pedido**: es de QC-33 y no esta rota. El `23505` de
>   `(order_year, order_sequence)=(2882, 1)` es sintoma del estado residual, no de la regla.
> - **Reescribir los 23 archivos que hoy no se aislan por si mismos.** Se quedan como estan; lo
>   que entra es una **guardia** que obliga a los tests NUEVOS a declarar como se aislan.
> - **Los E2E de Playwright.** Levantan la app de verdad contra una base con datos sembrados y
>   necesitan otra cosa que un `ROLLBACK` por test. **No se mandan a ninguna ficha hoy, y es
>   deliberado**: si duele, nacera la suya; crear una tarjeta que nadie necesita todavia es ruido
>   en el backlog.
> - **El plazo de los tests bajo carga**: es QC-58, ya cerrada. Causa distinta (maquina saturada),
>   y mezclarlas haria que ninguna de las dos se pueda dar por probada.
>
> *Sembrado por `/afinar-feature` el 2026-09-12. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **La migracion de QC-49 no corre sobre una base vacia.** Medido el 2026-09-12 al construir una
   base limpia: `prisma migrate deploy` se detiene en
   `20260911130000_inventory_company_scope` con su `RAISE EXCEPTION`, porque exige que la empresa
   inicial exista y falla cerrado a proposito (QC-49 R3). Construir la plantilla obliga a
   migrar -> `pnpm run db:seed` -> `prisma migrate resolve --rolled-back
   20260911130000_inventory_company_scope` -> migrar.
   **Respuesta por defecto, y con ella se puede implementar: no se toca QC-49.** La plantilla se
   construye en dos pasos y el `design.md` documenta la receta, que hoy no esta escrita en ningun
   sitio. Reabrir R3 seria cambiar una garantia de una ficha ya cerrada para ahorrar un paso de
   script.
2. **Si algun dia el gate corre en CI**, crear y borrar bases puede no estar permitido por el
   Postgres gestionado que haya alli.
   **Respuesta por defecto: se resuelve para la maquina local, que es donde corre hoy el gate.**
   El spec deja el punto de extension nombrado, sin construirlo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-12 | ¿Como arranca cada corrida de integracion? | **Base efimera por corrida**, creada desde una plantilla ya migrada y sembrada, y borrada al terminar. Verificado a mano ese mismo dia: los 2 archivos que el gate daba en rojo dan **61/61 verde** sobre base limpia |
| 2026-09-12 | ¿Quien nombra la base y quien la borra? | La **nombra la corrida** (worktree + identificador propio) y la **borra ella misma**, pase lo que pase. Misma leccion que los worktrees: el que crea, desmonta |
| 2026-09-12 | ¿Que pasa con los 23 archivos que hoy no se aislan por si mismos? | **No se reescriben.** Con la base limpia el residuo deja de importar, y tocar 23 archivos de siete modulos arriesga debilitar expectativas ajenas. Entra una **guardia** que se lo exige a los nuevos |
| 2026-09-12 | ¿Donde corre Postgres? | El **Postgres 16 local ya instalado**, con `pg` y `prisma`, **ya aprobadas**. **Ninguna dependencia nueva** (regla 7). Se evaluo Testcontainers —hay Docker 27.4.0— y se descarto: aprobacion nueva y arranque de contenedor en cada corrida del gate |
| 2026-09-12 | ¿Base real o un doble? | **Base real.** Estos tests existen para ejercitar indices unicos parciales, FKs `ON DELETE RESTRICT` y SQLSTATE literales. Un doble no los tiene |
| 2026-09-12 | La base de desarrollo se queda atras en migraciones, ¿el gate dice algo? | **Avisa, no falla.** El 2026-09-12 estaba cuatro migraciones atras y eso puso **22 archivos en rojo** sin que nada dijera la causa. El aviso convierte el diagnostico en una linea; bloquear un PR por el estado de una base local, no |
| 2026-09-12 | ¿Vale tambien para `./init.sh --rapido`? | **Si, misma regla siempre.** Una sola forma de correr integracion. Si el rapido pudiera usar una base sucia habria dos verdades y el rojo saldria solo en el completo — exactamente lo que paso el 2026-09-12 |
| 2026-09-12 | ¿Los E2E entran? | **No**, con motivo escrito (ver «Lo que NO entra») |
| 2026-09-12 | ¿Y el aislamiento test a test dentro de una corrida? | **Se hereda de QC-4, ampliado en QC-47**: transaccion interactiva que termina en `ROLLBACK`, con `SAVEPOINT` para lo que se espera que falle. Ya lo usan **18 de los 41** archivos. **No se sustituye**: esta ficha arregla la corrida, no el test |
| 2026-09-12 | Las 21 bases `QuimiCloude_QCxx` de features ya cerradas | **Se barren** con un subcomando que las lista y borra las que no tienen worktree vivo, con la regla de oro de `wt.sh`: **ante la duda, no borra** |
| 2026-09-12 | Idioma de los identificadores | **Ingles**, heredado de QC-4. No se reabre |
