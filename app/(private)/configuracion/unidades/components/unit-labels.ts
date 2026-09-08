/**
 * Etiqueta visible de la pantalla de unidades (R8, R9, `design.md > 1`).
 *
 * **Este archivo ya no DECLARA el texto: lo reexporta.** Nacio con la constante escrita aqui
 * porque la pantalla (T8) necesitaba la etiqueta antes de que existiera el item de menu, y solo
 * **T4** estaba autorizada a abrir `lib/shared/navigation/private-nav.ts`. Hecha T4, la constante
 * vive junto al resto de etiquetas de la navegacion —donde viven `PRESENTATIONS_LABEL`,
 * `ORDERS_LABEL` y `SUPPLIERS_LABEL`— y aqui queda la sola linea que su propio comentario
 * anunciaba.
 *
 * **Ni `page.tsx` ni el barrel cambian**, porque los dos ya importaban de aqui. Lo que no puede
 * pasar nunca es que existan dos constantes con este texto: el nombre de la pantalla y el de su
 * enlace son el mismo dato, y dos copias es como se acaba con un titulo que dice una cosa y un
 * menu que dice otra.
 */
export { UNITS_LABEL } from '@/lib/shared/navigation/private-nav';
