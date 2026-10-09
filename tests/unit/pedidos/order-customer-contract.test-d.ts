// QC-156 T0 (R37, R9): forma del contrato del cliente del pedido.
//
// Vitest no ejecuta este archivo (`vitest.config.mts` solo incluye `*.test.ts` y `*.test.tsx`):
// lo compila `pnpm run typecheck`, porque `tsconfig.json` incluye `**/*.ts`. Una afirmacion que
// deje de cumplirse pone el typecheck en rojo.

import { expectTypeOf } from 'vitest'

import type { ErrorState } from '@/lib/modules/errores'
import type { CustomerCatalog, CustomerRef, CustomerRefSearch } from '@/lib/modules/clientes'
import type {
  Actor,
  GetOrderCustomerFilterOptionDeps,
  OrderCustomer,
  OrderCustomerSearchPurpose,
  OrderView,
  OrderSummary,
  OrderRow,
  NewOrder,
  OrderEdit,
  Page,
  SearchOrderCustomersDeps,
  SetOrderCustomerDeps,
} from '@/lib/modules/pedidos'
import {
  ORDER_CUSTOMER_FILTER_FIELD,
  ORDER_CUSTOMER_PRESENCE_FILTER_FIELD,
  ORDER_CUSTOMER_PRESENCE_NONE,
  ORDER_CUSTOMER_PRESENCE_VALUES,
  createGetOrderCustomerFilterOption,
  createSearchOrderCustomers,
  createSetOrderCustomer,
  requireAliveCustomer,
} from '@/lib/modules/pedidos'
import type {
  OrderCustomerFilterOptionResult,
  OrderCustomerOptionsResult,
  OrderMutationFormState,
  getOrderCustomerFilterOptionAction,
  searchOrderCustomersAction,
  setOrderCustomerAction,
} from '@/lib/modules/pedidos/adapters/driving/order-actions'
import type { OrderWriteRepository } from '@/lib/modules/pedidos/ports/order-write-repository'
import type { OrderScope } from '@/lib/modules/pedidos'

// --- clientes: lo que sale del contrato, y nada mas ------------------------------------------
expectTypeOf<keyof CustomerRef>().toEqualTypeOf<'id' | 'firstNames' | 'lastNames' | 'isDeleted'>()
expectTypeOf<CustomerRef>().not.toHaveProperty('city')
expectTypeOf<CustomerRef>().not.toHaveProperty('phone')
expectTypeOf<CustomerRef>().not.toHaveProperty('email')
expectTypeOf<CustomerRef>().not.toHaveProperty('address')
expectTypeOf<CustomerRef['isDeleted']>().toEqualTypeOf<boolean>()

expectTypeOf<keyof CustomerRefSearch>().toEqualTypeOf<'search' | 'includeDeleted' | 'page' | 'pageSize'>()
expectTypeOf<CustomerRefSearch['pageSize']>().toEqualTypeOf<number | undefined>()

expectTypeOf<keyof CustomerCatalog>().toEqualTypeOf<
  'findRefsIncludingDeleted' | 'findAliveRefById' | 'searchRefs'
>()
expectTypeOf<CustomerCatalog['findRefsIncludingDeleted']>().toEqualTypeOf<
  (ids: readonly string[], companyId: string) => Promise<readonly CustomerRef[]>
>()
expectTypeOf<CustomerCatalog['findAliveRefById']>().toEqualTypeOf<
  (id: string, companyId: string) => Promise<CustomerRef | null>
>()
expectTypeOf<CustomerCatalog['searchRefs']>().toEqualTypeOf<
  (query: CustomerRefSearch, companyId: string) => Promise<Page<CustomerRef>>
>()

// --- pedidos: el cliente del pedido ----------------------------------------------------------
expectTypeOf<OrderCustomer>().toEqualTypeOf<{
  readonly id: string
  readonly name: string
  readonly isDeleted: boolean
}>()
// QC-223 2026-10-08: el proposito gana `'deliver'`; `'assign'` y `'filter'` siguen.
expectTypeOf<OrderCustomerSearchPurpose>().toEqualTypeOf<'assign' | 'filter' | 'deliver'>()
expectTypeOf<'assign' | 'filter'>().toMatchTypeOf<OrderCustomerSearchPurpose>()
expectTypeOf<OrderView['customer']>().toEqualTypeOf<OrderCustomer | null>()
expectTypeOf<OrderSummary['customer']>().toEqualTypeOf<OrderCustomer | null>()
expectTypeOf<OrderRow['customerId']>().toEqualTypeOf<string | null>()
expectTypeOf<OrderRow>().not.toHaveProperty('customer')
expectTypeOf<NewOrder['customerId']>().toEqualTypeOf<string | null>()
expectTypeOf<OrderEdit['customerId']>().toEqualTypeOf<string | null>()

expectTypeOf<typeof ORDER_CUSTOMER_FILTER_FIELD>().toEqualTypeOf<'customerId'>()
expectTypeOf<typeof ORDER_CUSTOMER_PRESENCE_FILTER_FIELD>().toEqualTypeOf<'customerPresence'>()
expectTypeOf<typeof ORDER_CUSTOMER_PRESENCE_NONE>().toEqualTypeOf<'none'>()
expectTypeOf<typeof ORDER_CUSTOMER_PRESENCE_VALUES>().toEqualTypeOf<readonly ['none']>()

expectTypeOf(requireAliveCustomer).toEqualTypeOf<
  (customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>, id: string, companyId: string) => Promise<CustomerRef>
>()

expectTypeOf<OrderWriteRepository['setCustomerAlive']>().toEqualTypeOf<
  (id: string, customerId: string | null, actorId: string, now: Date, scope: OrderScope) => Promise<'ok' | 'not_found'>
>()

// --- Las tres factorias ----------------------------------------------------------------------
expectTypeOf(createSetOrderCustomer).toEqualTypeOf<
  (deps: SetOrderCustomerDeps) => (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void>
>()
expectTypeOf(createSearchOrderCustomers).toEqualTypeOf<
  (
    deps: SearchOrderCustomersDeps,
  ) => (
    input: unknown,
    purpose: OrderCustomerSearchPurpose,
    actor: Actor | null | undefined,
  ) => Promise<Page<OrderCustomer>>
>()
expectTypeOf(createGetOrderCustomerFilterOption).toEqualTypeOf<
  (
    deps: GetOrderCustomerFilterOptionDeps,
  ) => (id: string, actor: Actor | null | undefined) => Promise<OrderCustomer | null>
>()

// --- Las tres actions ------------------------------------------------------------------------
expectTypeOf<OrderCustomerOptionsResult>().toEqualTypeOf<
  { status: 'success'; data: Page<OrderCustomer> } | ErrorState
>()
expectTypeOf<OrderCustomerFilterOptionResult>().toEqualTypeOf<
  { status: 'success'; data: OrderCustomer | null } | ErrorState
>()
expectTypeOf<typeof setOrderCustomerAction>().toEqualTypeOf<
  (id: string, input: unknown) => Promise<OrderMutationFormState>
>()
expectTypeOf<typeof searchOrderCustomersAction>().toEqualTypeOf<
  (query: unknown, purpose: OrderCustomerSearchPurpose) => Promise<OrderCustomerOptionsResult>
>()
expectTypeOf<typeof getOrderCustomerFilterOptionAction>().toEqualTypeOf<
  (id: string) => Promise<OrderCustomerFilterOptionResult>
>()
