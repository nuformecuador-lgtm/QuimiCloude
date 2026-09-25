import type { DataTableTexts } from '@/components/shared/data-table';

/**
 * Etiqueta visible de la pantalla de clientes.
 *
 * **Este archivo no declara el texto: lo reexporta.** El nombre de la pantalla y el de su enlace
 * de menu son el mismo dato, y dos copias es como se acaba con un titulo que dice una cosa y un
 * menu que dice otra.
 */
export { CUSTOMERS_LABEL } from '@/lib/shared/navigation/private-nav';

/** `data-testid` del titulo de la pantalla. */
export const CUSTOMERS_TITLE_TESTID = 'clientes-title';

/**
 * Textos del componente compartido. Viven aqui, junto a las demas etiquetas de la pantalla, y no
 * en `customer-table.tsx`: la tabla compartida no incrusta copy de ningun dominio. Ningun test
 * afirma sobre estos literales: los controles se localizan por rol o por `data-testid`.
 */
export const CUSTOMER_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay clientes que mostrar.',
  loading: 'Cargando clientes…',
  error: 'No se pudo cargar la lista de clientes.',
  search: 'Buscar clientes',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Clientes por página',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  pinColumn: 'Fijar columna',
  unpinColumn: 'Soltar columna',
  filterColumn: 'Filtrar columna',
  clearFilter: 'Limpiar filtro',
  lastWeek: 'Última semana',
  lastMonth: 'Último mes',
  lastYear: 'Último año',
};
