/**
 * Nombre de la empresa inicial de la instalacion (`design.md > 6.1`, decision cerrada del
 * humano el 2026-09-04 al aprobar el spec). Este archivo es el UNICO sitio del repo que
 * escribe a mano el literal `'QuimiCloud'` en TypeScript: cualquier otro archivo que necesite
 * nombrar la empresa inicial importa esta constante, nunca copia el texto (R20), igual que
 * `roles.ts` con `'Administrador'`.
 *
 * En SQL aparece una segunda vez, en el backfill de la migracion; que las dos copias no
 * diverjan lo vigila `tests/unit/identity/schema/companies-migration.test.ts`.
 *
 * No sale del entorno: no es un secreto, y `.env` no es donde vive un dato de negocio.
 */
export const INITIAL_COMPANY_NAME = 'QuimiCloud'
