/** Mensaje neutro que ve la persona cuando su origen agoto la cuota. */
export const RATE_LIMITED_MESSAGE = 'Demasiados intentos. Prueba de nuevo más tarde';

/** Pantalla HTML minima para una navegacion frenada: sin JS, sin recursos externos. */
export function renderRateLimitedPage(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${RATE_LIMITED_MESSAGE}</title>
    <style>
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100dvh;
        margin: 0;
        padding: 1.5rem;
        box-sizing: border-box;
        font-family: system-ui, sans-serif;
        font-size: 16px;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <p>${RATE_LIMITED_MESSAGE}</p>
  </body>
</html>
`;
}

/** Cierto solo para el error que el freno lanza en el cliente, con el mensaje exacto. */
export function isRateLimitedError(error: unknown): boolean {
  return error instanceof Error && error.message === RATE_LIMITED_MESSAGE;
}
