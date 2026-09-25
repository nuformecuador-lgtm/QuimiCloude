import type { Customer } from './customer';

/**
 * Datos de negocio de un cliente, ya validados por `customer-input.ts` y listos para el
 * puerto. Las tres formas normalizadas las calcula el caso de uso con `normalizeCustomerText`
 * y viajan emparejadas con su dato: el puerto solo las escribe, no las recalcula.
 */
export type NewCustomer = Pick<Customer, 'firstNames' | 'lastNames' | 'city' | 'phone' | 'email' | 'address'> & {
  readonly firstNamesNormalized: string;
  readonly lastNamesNormalized: string;
  readonly cityNormalized: string;
};

/**
 * Salida de una consulta de cliente. `companyId` no sale (quien pregunta ya es de esa empresa)
 * y `deletedAt` tampoco (toda consulta excluye los dados de baja). Las formas normalizadas
 * tampoco salen: son derivadas para buscar, no un dato de negocio.
 */
export type CustomerView = Omit<Customer, 'companyId' | 'deletedAt'>;
