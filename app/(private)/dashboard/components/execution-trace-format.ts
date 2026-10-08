import type { ExecutionAction, TraceDuration } from '@/lib/modules/asignaciones';
import type { OrderStatus } from '@/lib/modules/pedidos';

export const DELETED_ORDER_MARK = 'Dado de baja';
export const GO_BACK_MARK = 'Vuelta atrás';

export const EXECUTION_ACTION_LABELS: Readonly<Record<ExecutionAction, string>> = {
  start: 'Arrancar',
  resume: 'Retomar',
  advance: 'Avanzar',
  go_back: 'Retroceder',
  cancel: 'Cancelar',
  finish: 'Finalizar',
  pack_start: 'Comenzar empaque',
  pack_finish: 'Terminar empaque',
};

export const TRACE_ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
  POR_EMPACAR: 'Por empacar',
  EN_EMPAQUE: 'En empaque',
  POR_ACONDICIONAR: 'Por acondicionar',
  EN_ACONDICIONAMIENTO: 'En acondicionamiento',
  TERMINADO: 'Terminado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
  BLOQUEADO: 'Bloqueado',
};

export const TRACE_DURATION_SUFFIXES: Readonly<Record<TraceDuration['kind'], string>> = {
  closed: '',
  open: ' (en curso)',
  unclosed: ' (sin cierre anotado)',
};

const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Los segundos se truncan: una duracion nunca se muestra mayor de lo que fue. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / SECOND_MS);
  const days = Math.floor(total / DAY_S);
  const hours = Math.floor((total % DAY_S) / HOUR_S);
  const minutes = Math.floor((total % HOUR_S) / MINUTE_S);
  const seconds = total % MINUTE_S;

  if (days > 0) return `${days} d ${pad2(hours)} h ${pad2(minutes)} min`;
  if (hours > 0) return `${hours} h ${pad2(minutes)} min`;
  if (minutes > 0) return `${minutes} min ${pad2(seconds)} s`;
  return `${seconds} s`;
}

export function formatTraceDuration(duration: TraceDuration): string {
  return `${formatElapsed(duration.ms)}${TRACE_DURATION_SUFFIXES[duration.kind]}`;
}

/** UTC y sin configuracion regional: servidor y navegador pintan la misma cadena. */
export function formatTraceInstant(value: Date): string {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}
