// Sin `'use client'` a proposito: la frontera se declara en cada componente, y asi `page.tsx`
// sigue siendo Server Component aunque importe desde aqui.
export {
  ORDER_EXECUTION_ERROR_BACK_LINK_TESTID,
  ORDER_EXECUTION_ERROR_MESSAGE_TESTID,
  ORDER_EXECUTION_ERROR_TESTID,
  OrderExecutionError,
} from './order-execution-error';
export {
  ORDER_EXECUTION_LINE_QUANTITY_TESTID,
  ORDER_EXECUTION_LINE_TESTID,
  ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID,
  ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID,
  ORDER_EXECUTION_LINES_TESTID,
  PRODUCT_NAME_FALLBACK,
  OrderExecutionLines,
  type OrderExecutionLinesProps,
} from './order-execution-lines';
export {
  ORDER_EXECUTION_FINISH_ERROR_TESTID,
  ORDER_EXECUTION_FINISH_FORM_TESTID,
  ORDER_EXECUTION_ORDER_ID_FIELD,
  ORDER_EXECUTION_RECIPE_NAME_TESTID,
  ORDER_EXECUTION_SCREEN_TESTID,
  ORDER_EXECUTION_TITLE_TESTID,
  OrderExecutionScreen,
  type OrderExecutionScreenProps,
} from './order-execution-screen';
export {
  ORDER_SCALE_BANNER_FACTOR_TESTID,
  ORDER_SCALE_BANNER_QUANTITY_TESTID,
  ORDER_SCALE_BANNER_TESTID,
  OrderScaleBanner,
  type OrderScaleBannerProps,
} from './order-scale-banner';
