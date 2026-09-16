# QC-104 — sesion-una-sola-vez-por-peticion · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** ninguna ·
> **Rama** `feature/QC-104-sesion-una-sola-vez-por-peticion` · **Bloquea** QC-28
>
> **Alcance.** Dentro de **una misma peticion** la sesion se resuelve **una sola vez**, venga de
> donde venga: layout, pagina, componente de servidor o **Server Action**. Las siguientes llamadas
> reciben el mismo resultado ya calculado. Y la ficha **deja la medicion que QC-28 no tiene**: un
> **conteo** de lecturas por peticion que vigila el gate, y **tiempos antes y despues** medidos
> una vez y escritos en disco.
>
> **Medido en disco el 2026-09-15**, mas de lo que decia la ficha: tres lecturas por pagina en
> `/configuracion/usuarios`, `/pedidos` y `/configuracion/unidades`; dos en el resto; y **dos por
> cada clic de guardar** en 11 Server Actions (`getSessionUser` + `getSessionContext` en paralelo).
>
> **Lo que NO entra.**
> - **Guardar el resultado entre peticiones** (Redis o cualquier cache): es **QC-28**.
> - **Decidir si Redis hace falta**: lo decide el humano al reabrir QC-28, con los numeros delante.
> - **Monitorizacion permanente de rendimiento** o una linea de log por peticion: nadie la pidio.
> - **Otras consultas repetidas de las pantallas** que no sean la sesion.
>
> *Sembrado por `/afinar-feature` el 2026-09-15. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Contra que Supabase se miden los tiempos, y con que credenciales.** El `.env` de hoy apunta
   a una base **local** (`DATABASE_URL` y `DIRECT_URL` en `localhost`), y en el repo no hay
   ningun Supabase real configurado. Falta decidir **que proyecto** (no uno con datos reales de
   una empresa), **quien pone las credenciales** y **con que usuario** se entra. **Solo bloquea
   la mitad de tiempos**; el conteo del gate no depende de esto. `spec_author` no la cierra por
   su cuenta.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decision |
|---|---|---|
| 2026-09-15 | ¿Que entra: solo abrir pantallas, o tambien guardar? | **Las dos.** Una lectura por peticion, venga de layout, pagina, componente de servidor o Server Action. Si el mecanismo elegido no alcanza a las acciones, `spec_author` **lo declara por escrito con la evidencia** en `design.md`; no lo deja fuera en silencio |
| 2026-09-15 | ¿Que forma tiene la medicion? | **Conteo en el gate + tiempos una vez.** Un test cuenta las lecturas de sesion por peticion y **falla si pasan de una**, que es lo que impide que esto se deshaga en silencio. Los tiempos se miden **antes y despues, una sola vez**, y quedan **escritos en disco con el metodo para repetirlos**, no en el chat (regla 3). **Sin logs en produccion** |
| 2026-09-15 | ¿Donde se miden los tiempos? | **En local, contra un Supabase real.** Contra la base local la red no aparece, y la red es justo lo que discute QC-28 (decision 10: «Postgres-por-red contra Redis-por-HTTP»). Pendiente de la pregunta abierta 1 |
| 2026-09-15 | ¿Con que umbral arranca QC-28? | **Ninguno fijado aqui.** Nadie tiene hoy una referencia para elegir la cifra. QC-104 entrega los numeros antes y despues, y **decide el humano** al reabrir QC-28 |
| 2026-09-15 | ¿Se toca «dar de baja surte efecto en el siguiente clic»? | **No.** Heredado de **QC-8** («el usuario se resuelve contra la base en cada peticion»). El resultado vive **solo lo que dura la peticion** y **nunca** se reutiliza entre peticiones: eso seria QC-28. La red ya existe: `e2e/session.spec.ts:352` |
| 2026-09-15 | ¿Y si la base falla al resolver? | **Se falla cerrado, como hoy.** Heredado de **QC-23, decision 13**. Una lectura fallida vale para **toda** la peticion: layout y pagina ya no pueden discrepar |
| 2026-09-15 | ¿Se conserva la estructura de la resolucion? | **Si.** Heredado de **QC-48 R19 y R21**: una sola instancia de `resolveSession` con sus dos proyecciones, `getSessionUser` y `getSessionContext`, que devuelven `null` en exactamente los mismos casos. Ninguna de las dos cambia de firma |
| 2026-09-15 | ¿Log por peticion para medir? | **No.** Heredado de **QC-71 y QC-57**: el log se escribe **solo cuando algo falla**. La medicion no deja ninguna linea por peticion |
| 2026-09-15 | ¿Dependencia nueva? | **Ninguna.** Next 16 documenta `React.cache` para compartir un resultado dentro de una peticion (`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md:264`). Si `design.md` concluye que no basta, lo dice; **no se instala nada** sin la regla 7 |
| 2026-09-15 | ¿Hace falta E2E? | **No hace falta uno nuevo, y se difiere aqui con motivo.** Heredado de **QC-71 y QC-54**: nadie entra ni sale de ninguna pantalla por esto. La red son **los E2E de sesion que ya existen**, que siguen en verde |
| 2026-09-15 | ¿Zona y complejidad? | **`backend` / `medium`, sin cambio.** No toca ninguna pantalla; crece el alcance, pero no el riesgo |
