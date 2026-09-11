import '@testing-library/jest-dom/vitest';

import { configure } from '@testing-library/dom';

/**
 * El plazo de las consultas ASINCRONAS de testing-library (`findBy*`, `waitFor`), que es DISTINTO
 * del `testTimeout` de Vitest y NO se hereda de el.
 *
 * QC-58 subio `testTimeout` de 5 s a 15 s en los tres proyectos para los flakes de saturacion
 * (`docs/verification.md`), pero `asyncUtilTimeout` se quedo en su valor por defecto: **1000 ms**.
 * Quince veces mas corto, y es el que decide de verdad cuando se rinde un `findByTestId`.
 *
 * QC-80 lo destapo (2026-09-11). La firma es facil de confundir con un fallo real y por eso vale
 * la pena reconocerla: **no es `Test timed out`**, es
 * `TestingLibraryElementError: Unable to find an element`, con el test terminando en ~4 s, muy por
 * debajo de sus 15 s. Lo que pasa es que la consulta agoto SU segundo mientras el test aun tenia
 * catorce. El elemento SI acaba renderizandose; nadie llego a esperarlo.
 *
 * Medido sobre `npx vitest run --project ui` en esta rama:
 *
 * | `asyncUtilTimeout` | Resultado | Duracion |
 * | --- | --- | --- |
 * | 1000 (por defecto) | 1-8 archivos rojos, casos distintos en cada corrida | ~229 s |
 * | 5000 | **74/74 archivos, 963 tests, cero fallos** | ~121 s |
 * | 10000 | 74/74 archivos, 963 tests, cero fallos | ~112 s |
 *
 * Que la corrida sea casi el DOBLE de rapida con el plazo mas largo no es una paradoja: cada
 * consulta que se rinde reintenta durante su plazo entero y luego serializa el DOM completo en el
 * mensaje de error. Los rojos costaban mas que la espera.
 *
 * **Se elige 5000 y no 10000** porque 5 s ya deja cero fallos con margen de sobra sobre lo que
 * hace falta, y porque tiene que quedar POR DEBAJO del `testTimeout` de 15 s: asi un elemento que
 * de verdad no llega lo reporta la consulta -con su mensaje, que dice QUE buscaba- y no el
 * timeout pelado del test, que no dice nada.
 *
 * **Coste aceptado, el mismo que acepto QC-58 con su plazo**: un elemento que nunca aparece tarda
 * ahora 5 s en reportarse en vez de 1 s. A cambio, el gate deja de llamar rojo a codigo que
 * funciona. Lo vigila `tests/guards/guard-teclear-y-plazo.test.ts`, por el mismo motivo que
 * vigila el `testTimeout`: ningun grafo de imports selecciona este archivo, asi que sin guardia
 * se podria borrar esta linea y los flakes volverian en silencio.
 */
export const ASYNC_UTIL_TIMEOUT = 5_000;

configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT });
