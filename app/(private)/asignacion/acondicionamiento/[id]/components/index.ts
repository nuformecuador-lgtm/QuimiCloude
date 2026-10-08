// Sin `'use client'` a proposito: la frontera se declara en cada componente, y asi `page.tsx`
// sigue siendo Server Component aunque importe desde aqui.
export {
  CONDITIONING_ORDER_BACK_LINK_TESTID,
  CONDITIONING_ORDER_CONDITIONER_TESTID,
  CONDITIONING_ORDER_DISTRIBUTION_TESTID,
  CONDITIONING_ORDER_NUMBER_TESTID,
  CONDITIONING_ORDER_QUANTITY_TESTID,
  CONDITIONING_ORDER_RECIPE_TESTID,
  CONDITIONING_ORDER_SCREEN_TESTID,
  CONDITIONING_ORDER_SCREEN_TEXTS,
  CONDITIONING_ORDER_STATUS_TESTID,
  ConditioningOrderScreen,
  type ConditioningOrderScreenProps,
} from './conditioning-order-screen';
