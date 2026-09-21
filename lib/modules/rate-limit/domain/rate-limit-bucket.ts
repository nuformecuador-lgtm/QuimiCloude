export type RateLimitBucket = 'login' | 'general';

/** A que cuota pertenece una peticion: la ruta de login por separado del resto. */
export function selectBucket(pathname: string, loginRoute: string): RateLimitBucket {
  return pathname === loginRoute ? 'login' : 'general';
}
