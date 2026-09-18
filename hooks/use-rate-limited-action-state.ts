'use client';

import { useActionState, useCallback } from 'react';
import { toast } from 'sonner';

import { RATE_LIMITED_MESSAGE, isRateLimitedError } from '@/lib/modules/rate-limit';

/**
 * Envuelve una Server Action invocada FUERA de `useActionState` (manejador, `startTransition`)
 * para que un freno por origen se vea como un aviso, en vez de una promesa rechazada sin atrapar.
 * Cualquier otro error se relanza tal cual.
 */
export function withRateLimitNotice<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result | undefined> {
  return async (...args: Args) => {
    try {
      return await action(...args);
    } catch (error) {
      if (!isRateLimitedError(error)) throw error;
      toast.error(RATE_LIMITED_MESSAGE);
      return undefined;
    }
  };
}

/**
 * Mismas firmas que `useActionState` de React. Atrapar DENTRO de la accion, y no en el
 * consumidor, es lo que evita que el error suba a la transicion y de ahi al error boundary.
 */
export function useRateLimitedActionState<State>(
  action: (state: Awaited<State>) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
): [state: Awaited<State>, dispatch: () => void, isPending: boolean];
export function useRateLimitedActionState<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
): [state: Awaited<State>, dispatch: (payload: Payload) => void, isPending: boolean];
export function useRateLimitedActionState<State, Payload>(
  action: (state: Awaited<State>, payload?: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
) {
  const wrappedAction = useCallback(
    async (state: Awaited<State>, payload?: Payload): Promise<Awaited<State>> => {
      try {
        return (await action(state, payload)) as Awaited<State>;
      } catch (error) {
        if (!isRateLimitedError(error)) throw error;
        toast.error(RATE_LIMITED_MESSAGE);
        return state;
      }
    },
    [action],
  );

  return useActionState(wrappedAction, initialState, permalink);
}
