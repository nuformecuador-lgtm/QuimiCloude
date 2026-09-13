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

> Los requisitos usan «la corrida» para referirse a una ejecucion del proyecto `integration` de
> Vitest (la que lanza `./init.sh`, `./init.sh --rapido`, `pnpm test` o `pnpm exec vitest`), y
> «la base de desarrollo» para la base a la que apunta la configuracion del repo (`DATABASE_URL`
> del `.env` o del entorno), que es la misma que usa la app a mano.

### La base efimera de cada corrida

**R1.** CUANDO arranca el proyecto `integration` de Vitest, el sistema DEBE crear una base de
datos propia de esa corrida y dirigir a ella **todas** las conexiones de los archivos de
`tests/integration/**`.

**R2.** La base de cada corrida DEBE crearse como copia de una plantilla que ya tiene aplicadas
todas las migraciones de `db/migrations/` y ejecutado el sembrado inicial, de forma que el primer
caso de la corrida vea el mismo estado de datos que una base recien preparada.

**R3.** CUANDO se construye la plantilla, el sistema DEBE seguir la receta de dos pasos —migrar,
sembrar, marcar `20260911130000_inventory_company_scope` como revertida, migrar otra vez— **sin
modificar ninguna migracion existente ni el script de sembrado**.

**R4.** El nombre de la base de una corrida DEBE estar compuesto por un prefijo reservado, la
identidad del worktree que la crea y un identificador unico de esa corrida, y DEBE ser un
identificador de Postgres valido (63 bytes maximo, sin mayusculas ni caracteres que exijan
entrecomillado).

**R5.** SI el conjunto de migraciones de `db/migrations/` cambia —se anade una, se borra una o
cambia el contenido de alguna—, ENTONCES la siguiente corrida DEBE construir una plantilla nueva
en vez de reutilizar la anterior.

**R6.** MIENTRAS el conjunto de migraciones no cambie, las corridas sucesivas DEBEN reutilizar la
misma plantilla sin volver a migrar ni a sembrar.

### El borrado, pase lo que pase

**R7.** CUANDO la corrida de integracion termina, sea cual sea su resultado —verde, roja o
abortada por un error de configuracion—, el sistema DEBE borrar la base de esa corrida y cerrar
toda conexion propia contra ella.

**R8.** CUANDO la corrida recibe una interrupcion (Ctrl-C / SIGINT, o SIGTERM), el sistema DEBE
borrar la base de esa corrida antes de salir.

**R9.** SI una corrida anterior murio sin llegar a borrar su base, ENTONCES la siguiente corrida
de integracion del mismo worktree DEBE borrarla antes de crear la suya, y DEBE decir por consola
cual borro y por que.

**R10.** MIENTRAS dos corridas de integracion lanzadas desde worktrees distintos se solapan en el
tiempo, cada una DEBE trabajar sobre su propia base, y ninguna DEBE leer, escribir ni borrar la
base de la otra.

### La misma regla en los dos modos del gate

**R11.** `./init.sh` y `./init.sh --rapido` DEBEN aplicar la misma regla de aislamiento: ningun
archivo de `tests/integration/**` llega a ejecutarse contra una base que no sea la efimera de su
corrida.

**R12.** SI un archivo de `tests/integration/**` va a ejecutarse y la conexion configurada no
apunta a la base efimera de la corrida, ENTONCES el sistema DEBE abortar **antes** del primer caso
y el mensaje DEBE nombrar la base que encontro.

**R13.** CUANDO termina una corrida de integracion, el contenido de la base de desarrollo DEBE ser
el mismo que tenia antes de empezar.

### El aviso por base de desarrollo atrasada

**R14.** CUANDO corre `./init.sh` en cualquiera de sus dos modos, el sistema DEBE comparar las
migraciones presentes en `db/migrations/` con las registradas como aplicadas en la base de
desarrollo y, si la base va atrasada, emitir un **aviso amarillo** que diga cuantas faltan y
nombre la mas antigua que falta.

**R15.** El aviso de R14 NO DEBE alterar el codigo de salida del gate.

**R16.** SI la base de desarrollo no se puede consultar (no hay `DATABASE_URL`, el servidor no
responde, la base no existe), ENTONCES el sistema DEBE avisarlo diciendo que no pudo comprobarlo y
el gate DEBE continuar.

### El aislamiento test a test y la guardia para los nuevos

**R17.** El aislamiento test a test heredado de QC-4 y ampliado en QC-47 —transaccion interactiva
que termina en `ROLLBACK`, con `SAVEPOINT` para lo que se espera que falle— DEBE conservarse: los
archivos que hoy lo usan lo siguen usando y su mecanismo no se sustituye.

**R18.** El sistema DEBE mantener un censo, legible por una guardia, que declare para cada archivo
de `tests/integration/**` como se aisla y —cuando no se aisla por si mismo— por que.

**R19.** CUANDO aparece un archivo bajo `tests/integration/**` que no esta en el censo, el gate
DEBE fallar nombrando el archivo, las formas de aislamiento admitidas y donde se declara.

**R20.** CUANDO el censo nombra un archivo que ya no existe en el arbol, el gate DEBE fallar
nombrandolo.

**R21.** La comprobacion de R19 y R20 DEBE ejecutarse tambien en `./init.sh --rapido`, sin
depender de que el grafo de imports seleccione nada.

**R22.** Los 23 archivos de `tests/integration/**` que hoy no se aislan por si mismos NO DEBEN
modificarse por esta feature.

### Limites

**R23.** Esta feature NO DEBE anadir ninguna dependencia a `package.json`.

**R24.** Esta feature NO DEBE cambiar la configuracion ni el ciclo de vida de los E2E de
Playwright.

**R25.** La base de cada corrida DEBE tener el mismo esquema que una base migrada al dia —tablas,
indices (incluidos los unicos parciales), claves ajenas con su `ON DELETE`, disparadores y RLS—,
sin sustituir ninguna comprobacion por un doble.

### El barrido de bases huerfanas

**R26.** CUANDO se invoca el subcomando de barrido **sin** `--force`, el sistema DEBE listar cada
base de test encontrada con su veredicto y su razon, y NO DEBE borrar ninguna.

**R27.** CUANDO se invoca el subcomando de barrido **con** `--force`, el sistema DEBE borrar
exactamente las bases que juzgo borrables, nombrando cada una.

**R28.** El barrido DEBE reconocer las dos formas de nombre: el prefijo reservado de las bases
nuevas y la forma heredada `QuimiCloude_QC<n>`.

**R29.** SI una base no encaja en ninguna de las dos formas conocidas, o tiene conexiones
abiertas, o el worktree o la rama de su feature siguen vivos, o su estado no se puede leer,
ENTONCES el barrido DEBE **retenerla** y decir por que (regla de oro de `scripts/wt.sh`: ante la
duda, no borra).

**R30.** El barrido NUNCA DEBE borrar la base a la que apunta la configuracion de desarrollo,
aunque su nombre encaje con una forma conocida.

### Convenciones

**R31.** El contrato del modulo nuevo —funciones exportadas, tipos y campos del rastro en
disco— DEBE estar escrito con identificadores en ingles.

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
