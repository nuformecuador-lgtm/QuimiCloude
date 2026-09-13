# QC-93 — aterrizaje-sin-permiso-de-modulo · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** ninguna ·
> **Rama** `feature/QC-93-aterrizaje-sin-permiso-de-modulo`
>
> **Alcance.** Devolver la premisa a los E2E de permisos, que hoy **no afirman nada**. Desde que
> QC-75 retiro la regla ruta -> rol, quien no es Administrador aterriza en **el primer item visible
> de su menu** —un Operador acaba en `/inventario`—, asi que todo caso que esperaba el dashboard
> quedo mintiendo. Se arreglan **los 23 fallos** que la suite completa da sobre base limpia, no solo
> los cuatro casos de «acaba fuera»: es una unica causa raiz. El destino se afirma **derivandolo del
> menu filtrado por los permisos de ese usuario**, nunca con una ruta fija, y el patron se
> centraliza en **un helper unico** que usan las trece suites. Entra ademas **un caso nuevo** en
> `login.spec.ts` para quien no tiene ningun permiso de modulo: entra, ve el 404 dentro del layout
> privado y puede cerrar sesion.
>
> **Lo que NO entra.**
> - **Cambiar los permisos del rol Operador.** Que no tenga `dashboard.consultar` es deliberado
>   (`lib/modules/identity/domain/permissions.ts:165`: solo `inventario.consultar` y
>   `asignaciones.consultar`). Darselo para que 23 tests pasen seria **cambiar el producto para
>   acomodar la prueba**, y traeria el dashboard a una pantalla de operario que nadie ha disenado.
> - **Tapar un agujero REAL de permisos.** Si al devolver la premisa se descubre que la proteccion
>   no esta en pie —que alguien **si** ve datos que no deberia—, eso es un hallazgo de seguridad con
>   ficha y prioridad propias: **se para y se reporta**. No se cuela en un arreglo de tests, que es
>   como se justifico esta ficha.
> - **Redisenar el aterrizaje o el 404.** Los dos ya existen: el primer item visible del menu con
>   `DASHBOARD_ROUTE` de respaldo (`login-action.ts:113-126`) y el 404 dentro del layout privado.
>   Se heredan de QC-75 y QC-90 y aqui **solo se comprueban**.
> - **La regla del correlativo, el plazo de los tests y el residuo entre corridas**: son QC-33,
>   QC-58 y QC-77, las tres cerradas o ajenas.
>
> *Sembrado por `/afinar-feature` el 2026-09-13. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-13 | ¿Se arreglan los cuatro casos de la ficha o los 23 fallos de la suite? | **Los 23.** Es una unica causa raiz —quien no es Administrador no aterriza donde el test cree— y partirla dejaria media suite rota, con dos fichas tocando los mismos archivos |
| 2026-09-13 | ¿Como se afirma a donde aterriza quien no tiene permiso de ese modulo? | **Derivandolo del menu filtrado por SUS permisos**, igual que lo hace el codigo. Nunca una ruta fija: congelar la premisa es exactamente lo que mato estos casos cuando QC-75 cambio la regla |
| 2026-09-13 | El mismo patron roto esta en trece suites. ¿Como se arregla? | **Un helper unico** que todas usan. Trece copias de la misma linea es como llegamos aqui: cuando QC-75 cambio la regla habia trece sitios que actualizar y no se actualizo ninguno |
| 2026-09-13 | ¿Entra un caso para quien no tiene NINGUN permiso de modulo? | **Si, uno solo, en `login.spec.ts`**: entra, ve el 404 dentro del layout privado con su cabecera y su cerrar sesion, y puede cerrar sesion. El comportamiento ya esta decidido; lo que faltaba era que alguien lo ejercitara |
| 2026-09-13 | Los 23 tambien pasarian dandole al Operador el permiso de dashboard. ¿Test o permiso? | **El test.** El permiso se queda como esta: no tenerlo es deliberado |
| 2026-09-13 | ¿Y si aparece un agujero real de permisos al arreglar? | **Se para y se reporta.** Ficha propia y prioridad propia; no se arregla en esta pasada |
| 2026-09-13 | El aterrizaje y el 404 sin permisos | **Heredados de QC-75 y QC-90**, no se redisenan |
| 2026-09-13 | ¿Que verificacion se exige, si `init.sh` no corre Playwright? | **La suite E2E COMPLETA, en Chromium y WebKit, sobre base limpia**, con el resultado escrito en el PR. Precedente: QC-79 y QC-49. Aqui es especialmente exigible porque **la ficha ES la suite E2E**: un gate verde no dice nada de ella |
| 2026-09-13 | Cuantos casos de «acaba fuera» hay, y cuanto dano | **Cuatro, no tres**: inventario R4, pedidos R49, proveedores R52 y **recetas R6**, que la ficha no listaba. Y **23 fallos** en trece suites sobre base limpia, medido por la sesion de QC-85 el 2026-09-13. El board se corrigio antes de sembrar |
| 2026-09-13 | Idioma de los identificadores | **Ingles**, heredado de QC-4. No se reabre |
