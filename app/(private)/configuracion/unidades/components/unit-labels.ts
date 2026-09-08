/**
 * Etiqueta visible de la pantalla de unidades (R8, `design.md > 1`).
 *
 * **Por que vive AQUI y no en `lib/shared/navigation/private-nav.ts`**, que es donde vive su
 * hermana `PRESENTATIONS_LABEL`: el item de menu de unidades lo declara **T4** de `tasks.md`, en
 * otra tanda, y esa tanda es la unica autorizada a abrir `private-nav.ts`. La pantalla (T8)
 * necesita la etiqueta ANTES —el titulo y la metadata salen de ella, nunca de un literal escrito
 * dos veces— asi que se declara en la ruta y se publica por su barrel.
 *
 * **Como se cierra el hueco sin duplicar nada.** Cuando T4 declare `UNITS_LABEL` junto al resto de
 * etiquetas de la navegacion, este archivo se convierte en una sola linea:
 *
 * ```ts
 * export { UNITS_LABEL } from '@/lib/shared/navigation/private-nav';
 * ```
 *
 * y ni `page.tsx` ni el barrel cambian, porque los dos ya importan **de aqui**. Lo que no puede
 * pasar nunca es que existan dos constantes con este texto: el nombre de la pantalla y el de su
 * enlace son el mismo dato, y dos copias es como se acaba con un titulo que dice una cosa y un
 * menu que dice otra.
 */
export const UNITS_LABEL = 'Unidades';
