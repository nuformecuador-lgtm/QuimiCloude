// Tamaño, posición, opacidad y movimiento viven en `app/globals.css`: un `style` en línea ganaría
// a la regla de movimiento reducido.
export function LoginBackground() {
  return (
    <div data-login="molecules" aria-hidden="true">
      <svg data-login="molecule" data-login-index="1" viewBox="0 0 48 48">
        <polygon
          points="21,10.5 32.69,17.25 32.69,30.75 21,37.5 9.31,30.75 9.31,17.25"
          fill="none"
          stroke="#48CCBF"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M32.69 30.75L40.92 35.5" stroke="#48CCBF" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="40.92" cy="35.5" r="3" fill="#80C5FF" />
      </svg>
      <svg data-login="molecule" data-login-index="2" viewBox="0 0 48 48">
        <polygon
          points="21,10.5 32.69,17.25 32.69,30.75 21,37.5 9.31,30.75 9.31,17.25"
          fill="none"
          stroke="#9FE3DA"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M9.31 17.25L3.25 13.75" stroke="#9FE3DA" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="3.25" cy="13.75" r="2.4" fill="#9FE3DA" />
      </svg>
      <svg data-login="molecule" data-login-index="3" viewBox="0 0 48 48">
        <polygon
          points="21,10.5 32.69,17.25 32.69,30.75 21,37.5 9.31,30.75 9.31,17.25"
          fill="none"
          stroke="#48CCBF"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M21.91 17.03L26.58 19.73M26.58 28.27L21.91 30.97M14.51 26.7L14.51 21.3"
          stroke="#48CCBF"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
