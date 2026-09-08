'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Tamano de pagina por defecto: de 10 en 10, el mismo defecto del backend. */
export const DEFAULT_OPTIONS_PAGE_SIZE = 10;

/**
 * Espera antes de pedir al servidor lo que el usuario sigue escribiendo.
 *
 * 400 ms y no 250: entre dos teclas de una escritura humana normal pasan 150-300 ms, asi que un
 * rebote de 250 se cumple A MITAD DE PALABRA y acaba disparando casi una consulta por letra
 * -que es justo lo que el rebote existe para evitar-. 400 agrupa la palabra entera sin que la
 * lista se sienta parada.
 */
const DEFAULT_DEBOUNCE_MS = 400;

/** La primera pagina de cualquier consulta. */
const FIRST_PAGE = 1;

/** Una sola instancia para no cambiar de identidad en cada render sin resultados. */
const NO_ITEMS: readonly never[] = [];

/**
 * Lo que el consumidor recibe para pedir UNA pagina. `page` y `pageSize` viajan aqui
 * para que el llamante los pase como params -de una Server Action o de una URL-, en vez
 * de que este hook decida el transporte.
 */
export type AsyncPageRequest = {
  readonly query: string;
  readonly page: number;
  readonly pageSize: number;
  readonly signal: AbortSignal;
};

/**
 * Lo que el consumidor devuelve. Dos formas validas: la generica `{ items, hasMore }` o
 * la `Page<T>` del backend (`items` + `page`/`totalPages`), para no obligar a envolver
 * la respuesta de una Server Action que ya pagina.
 */
export type AsyncPageResult<T> = {
  readonly items: readonly T[];
  readonly hasMore?: boolean;
  readonly page?: number;
  readonly totalPages?: number;
};

export type FetchOptionsPage<T> = (
  request: AsyncPageRequest,
) => Promise<AsyncPageResult<T>>;

export type UseAsyncPaginatedOptionsParams<T> = {
  /** Pide una pagina al servidor. Debe respetar `signal`: el hook aborta lo obsoleto. */
  readonly fetchPage: FetchOptionsPage<T>;
  /** Texto de busqueda vigente. Al cambiar, la lista vuelve a la pagina 1. */
  readonly query: string;
  /** Cuantos elementos por pagina (10 por defecto). */
  readonly pageSize?: number;
  /** Espera tras la ultima tecla antes de consultar. */
  readonly debounceMs?: number;
  /** `false` no consulta y descarta lo acumulado (p. ej. con el popup cerrado). */
  readonly enabled?: boolean;
};

export type UseAsyncPaginatedOptionsResult<T> = {
  readonly items: readonly T[];
  /** Cargando la primera pagina de la consulta actual. */
  readonly isLoading: boolean;
  /** Anexando una pagina siguiente a lo ya visible. */
  readonly isLoadingMore: boolean;
  readonly error: Error | undefined;
  readonly hasMore: boolean;
  /** Pide la pagina siguiente. Sin efecto si ya se esta cargando o no queda ninguna. */
  readonly loadMore: () => void;
  /** Vuelve al estado inicial y reconsulta la pagina 1. */
  readonly reset: () => void;
};

/** Fase de la consulta vigente. */
type Phase = 'idle' | 'loading' | 'loadingMore';

/**
 * Todo el estado en UN objeto, sellado con la `key` de la consulta a la que pertenece.
 * Asi el reinicio al cambiar de consulta es una comparacion en el render -lo acumulado
 * de otra `key` simplemente no se lee- y no cinco `setState` dentro de un efecto, que
 * es lo que provoca renders en cascada.
 */
type QueryState<T> = {
  readonly key: string;
  readonly page: number;
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly error: Error | undefined;
  readonly phase: Phase;
};

/** `true` si la respuesta declara que quedan paginas, en cualquiera de sus dos formas. */
function resultHasMore<T>(result: AsyncPageResult<T>, requestedPage: number): boolean {
  if (typeof result.hasMore === 'boolean') {
    return result.hasMore;
  }
  if (typeof result.totalPages === 'number') {
    return (result.page ?? requestedPage) < result.totalPages;
  }
  return false;
}

/** Un `Error` con contexto, tambien cuando lo rechazado no era un `Error`. */
function toFetchError(cause: unknown, query: string, page: number): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `No se pudo cargar la pagina ${page} de opciones para "${query}": ${detail}`,
    { cause },
  );
}

/**
 * Consulta asincrona paginada para un autocomplete: acumula paginas, sabe si quedan mas
 * y descarta lo obsoleto.
 *
 * **Por que hay una `key` de consulta**: la consulta la identifican `query`, `pageSize`,
 * `enabled` y los reinicios explicitos. Al cambiar cualquiera, lo acumulado deja de valer.
 * Sellar el estado con esa `key` y compararla al leer evita reiniciar seis piezas de estado
 * dentro de un efecto -que es un render en cascada garantizado- y hace imposible mostrar
 * las opciones de "ace" mientras se busca "aceite".
 *
 * **Por que aborta y ademas cuenta generaciones**: al escribir, la peticion en vuelo deja
 * de interesar. Se aborta con `AbortController` y, ademas, la respuesta se ignora si su
 * generacion ya no es la vigente -abortar no garantiza que un `fetchPage` que no honre
 * `signal` no resuelva despues-.
 *
 * **Por que `loadMore` decide dentro del updater**: el manejador de scroll puede dispararse
 * dos veces antes de que React repinte. Al mirar `phase` sobre el estado previo real, la
 * segunda llamada ve la pagina ya reservada y no pide la misma dos veces.
 */
export function useAsyncPaginatedOptions<T>({
  fetchPage,
  query,
  pageSize = DEFAULT_OPTIONS_PAGE_SIZE,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  enabled = true,
}: UseAsyncPaginatedOptionsParams<T>): UseAsyncPaginatedOptionsResult<T> {
  const [resetToken, setResetToken] = useState(0);
  const key = `${resetToken}|${pageSize}|${enabled ? '1' : '0'}|${query}`;

  const [state, setState] = useState<QueryState<T>>(() => ({
    key,
    page: FIRST_PAGE,
    items: NO_ITEMS,
    hasMore: false,
    error: undefined,
    phase: 'idle',
  }));

  // `fetchPage` suele ser una funcion nueva en cada render del consumidor; en un ref no
  // reinicia la consulta por identidad. Se sincroniza en un efecto, no en el render.
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  const generationRef = useRef(0);

  // Estado vigente: si el sellado es de otra consulta, esta lista todavia no existe.
  const current = useMemo<QueryState<T>>(
    () =>
      state.key === key
        ? state
        : {
            key,
            page: FIRST_PAGE,
            items: NO_ITEMS,
            hasMore: false,
            error: undefined,
            phase: enabled ? 'loading' : 'idle',
          },
    [state, key, enabled],
  );

  const requestedPage = current.page;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;

    const isFirstPage = requestedPage === FIRST_PAGE;
    const controller = new AbortController();
    // Espera al rebote SOLO lo que lo necesita: la primera pagina de una busqueda ESCRITA.
    //
    // - Una pagina siguiente la pide un gesto deliberado -llegar al final del scroll-, no una
    //   tecla, asi que agruparla no ahorra nada y solo retrasa la lista.
    // - Y con la consulta VACIA no hay nada que agrupar: es abrir el desplegable. Hacerle esperar
    //   el rebote dejaria la lista en blanco casi medio segundo antes de mostrar lo que en muchos
    //   casos ya esta en memoria (la primera pagina precargada por props).
    const delay = isFirstPage && query !== '' ? debounceMs : 0;

    const timer = setTimeout(() => {
      const settle = (
        apply: (previous: QueryState<T>) => QueryState<T>,
      ): void => {
        if (generation !== generationRef.current || controller.signal.aborted) {
          return;
        }
        setState(apply);
      };

      fetchPageRef
        .current({ query, page: requestedPage, pageSize, signal: controller.signal })
        .then((result) => {
          settle((previous) => {
            const acumulado =
              isFirstPage || previous.key !== key ? NO_ITEMS : previous.items;
            return {
              key,
              page: requestedPage,
              items: [...acumulado, ...result.items],
              hasMore: resultHasMore(result, requestedPage),
              error: undefined,
              phase: 'idle',
            };
          });
        })
        .catch((cause: unknown) => {
          // El error no se traga: se expone para que la UI lo muestre y pueda reintentar.
          const error = toFetchError(cause, query, requestedPage);
          settle((previous) => ({
            key,
            page: requestedPage,
            items: previous.key === key ? previous.items : NO_ITEMS,
            hasMore: false,
            error,
            phase: 'idle',
          }));
        });
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, query, pageSize, enabled, requestedPage, debounceMs]);

  const loadMore = useCallback(() => {
    setState((previous) => {
      if (previous.key !== key || previous.phase !== 'idle' || !previous.hasMore) {
        return previous;
      }
      return { ...previous, page: previous.page + 1, phase: 'loadingMore' };
    });
  }, [key]);

  const reset = useCallback(() => {
    setResetToken((token) => token + 1);
  }, []);

  return {
    items: current.items,
    isLoading: current.phase === 'loading',
    isLoadingMore: current.phase === 'loadingMore',
    error: current.error,
    hasMore: current.hasMore,
    loadMore,
    reset,
  };
}

/** Nombres de los params de la peticion; se cambian sin tocar el componente. */
export type PageParamNames = {
  readonly query?: string;
  readonly page?: string;
  readonly pageSize?: string;
};

/**
 * Construye un `fetchPage` sobre una URL, con los nombres de los params configurables
 * (`?q=&page=&pageSize=` por defecto). Es el caso comun cuando el origen es una ruta de
 * API; si el origen es una Server Action, se escribe el `fetchPage` a mano y ya.
 */
export function createUrlPageFetcher<T>(
  url: string,
  options: {
    readonly params?: PageParamNames;
    readonly mapResponse?: (payload: unknown) => AsyncPageResult<T>;
    readonly init?: Omit<RequestInit, 'signal'>;
  } = {},
): FetchOptionsPage<T> {
  const {
    query: queryParam = 'q',
    page: pageParam = 'page',
    pageSize: pageSizeParam = 'pageSize',
  } = options.params ?? {};

  return async ({ query, page, pageSize, signal }) => {
    const target = new URL(url, window.location.origin);
    target.searchParams.set(queryParam, query);
    target.searchParams.set(pageParam, String(page));
    target.searchParams.set(pageSizeParam, String(pageSize));

    const response = await fetch(target, { ...options.init, signal });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} en ${target.pathname}`);
    }

    const payload: unknown = await response.json();
    return options.mapResponse
      ? options.mapResponse(payload)
      : (payload as AsyncPageResult<T>);
  };
}
