// Lectura de los tokens de color de `app/globals.css` y conversion oklch -> contraste WCAG,
// compartidas por los tests de tokens y de contraste de componentes.

/** El primer `:root` y el primer `.dark` del archivo son los de los tokens de color. */
export function extractColorBlocks(css: string): { light: string; dark: string } {
  const rootStart = css.indexOf(':root {');
  const darkStart = css.indexOf('.dark {', rootStart);

  if (rootStart === -1 || darkStart === -1) {
    throw new Error('No se encontraron los bloques :root / .dark esperados en globals.css');
  }

  return {
    light: css.slice(rootStart, css.indexOf('}', rootStart)),
    dark: css.slice(darkStart, css.indexOf('}', darkStart)),
  };
}

export function readToken(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Token --${name} no encontrado en el bloque`);
  return match[1].trim();
}

// --- oklch -> sRGB lineal y contraste WCAG. Vive solo en el test: produccion no convierte. ---

export function parseOklch(value: string): { l: number; c: number; h: number } {
  const match = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!match) throw new Error(`Valor oklch no reconocido: ${value}`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

/** r,g,b en sRGB lineal (0..1): justo lo que pide la luminancia relativa de WCAG. */
export function oklchToLinearSrgb(value: string): { r: number; g: number; b: number } {
  const { l, c, h } = parseOklch(value);
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const lCubed = l_ ** 3;
  const mCubed = m_ ** 3;
  const sCubed = s_ ** 3;

  const r = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  const g = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  const b2 = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.7076147010 * sCubed;

  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return { r: clamp(r), g: clamp(g), b: clamp(b2) };
}

export function relativeLuminance(value: string): number {
  const { r, g, b } = oklchToLinearSrgb(value);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
