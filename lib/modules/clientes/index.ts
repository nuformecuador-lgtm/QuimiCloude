// lib/modules/clientes/index.ts — CONTRATO PUBLICO del modulo `clientes`.
// Solo reexporta simbolos de ./domain. Nada de 'use server', @prisma/client ni next/* en su
// cierre de imports. El adaptador driving no pasa por aqui.
export { type Customer } from './domain/customer';
export { requirePermission, type Actor } from './domain/actor';
export { type CustomerScope } from './domain/customer-scope';
export { ClientesError, UnauthorizedError, CustomerNotFoundError, ValidationError } from './domain/errors';
export { type Page } from './domain/page';
export { CUSTOMER_QUERYABLE } from './domain/customer-queryable';
export { normalizeCustomerText } from './domain/customer-text';
export {
  createCustomerSchema,
  updateCustomerSchema,
  blankToNull,
  CUSTOMER_FIRST_NAMES_MAX_LENGTH,
  CUSTOMER_LAST_NAMES_MAX_LENGTH,
  CUSTOMER_CITY_MAX_LENGTH,
  CUSTOMER_PHONE_MAX_LENGTH,
  CUSTOMER_EMAIL_MAX_LENGTH,
  CUSTOMER_ADDRESS_MAX_LENGTH,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from './domain/customer-input';
export { type NewCustomer, type CustomerView } from './domain/customer-view';

// Las cinco factories de caso de uso. Los tipos `*Deps` viajan con ellas: quien las cablea es
// `lib/composition`, y sin el tipo no podria declarar la dependencia.
export { createCreateCustomer, type CreateCustomerDeps } from './domain/create-customer';
export { createUpdateCustomer, type UpdateCustomerDeps } from './domain/update-customer';
export { createDeleteCustomer, type DeleteCustomerDeps } from './domain/delete-customer';
export { createGetCustomer, type GetCustomerDeps } from './domain/get-customer';
export { createListCustomers, type ListCustomersDeps } from './domain/list-customers';
