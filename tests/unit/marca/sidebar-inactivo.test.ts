// Contrato de texto de `app/globals.css` para el item inactivo de la barra lateral. El color
// calculado en navegador lo mide `e2e/marca-componentes.spec.ts`; el contraste de los pares,
// `tests/unit/marca/contraste-componentes.test.ts`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const css = readFileSync(join(RAIZ, 'app', 'globals.css'), 'utf8');
const sidebarTsx = readFileSync(join(RAIZ, 'components', 'ui', 'sidebar.tsx'), 'utf8');

const INACTIVE_SELECTOR =
  "[data-slot='sidebar-content']\n  :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-sub-button']):not([data-active]):not(:hover):not(:focus-visible)";

const FOCUS_SELECTOR =
  "[data-slot='sidebar-content']\n  :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-sub-button']):not([data-active]):focus-visible";

/** Bloques del item activo, copiados tal cual del `dev` de partida: no pueden cambiar. */
const ACTIVE_RULE = `[data-slot='sidebar-menu-button'][data-active] {
  position: relative;
  background: linear-gradient(
    90deg,
    color-mix(in oklch, var(--sidebar-primary) 26%, transparent),
    color-mix(in oklch, var(--sidebar-primary) 5%, transparent)
  );
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--sidebar-primary) 32%, transparent);
  color: #fff;
  font-weight: 600;
}`;

const ACTIVE_BAR_RULE = `[data-slot='sidebar-menu-button'][data-active]::before {
  content: '';
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--sidebar-primary);
  box-shadow: 0 0 12px var(--sidebar-primary);
}`;

const ACTIVE_ICON_RULE = `[data-slot='sidebar-menu-button'][data-active] svg {
  color: var(--sidebar-primary);
}`;

const ACTIVE_SUB_RULE = `[data-slot='sidebar-menu-sub-button'][data-active] {
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--sidebar-primary) 22%, transparent);
}`;

const PANEL_RULE = `[data-slot='sidebar-inner'],
[data-slot='sidebar'][data-mobile='true'] {
  border-radius: 22px;
  background-image: var(--sidebar-panel-gradient);
}`;

/** Profundidad de llaves en `index`: 0 es una regla sin capa ni `@media`. */
function braceDepth(source: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
  }
  return depth;
}

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no esta la regla: ${selector}`);
  const open = css.indexOf('{', start + selector.length);
  return css.slice(open + 1, css.indexOf('}', open)).trim();
}

/** Bloque `:root` o `.dark` de los tokens de color. */
function tokenBlock(header: ':root' | '.dark'): string {
  const start = css.indexOf(`${header} {`);
  return css.slice(start, css.indexOf('\n}', start));
}

describe('item inactivo de la barra lateral', () => {
  it('R14 el panel conserva su fondo: regla del degradado intacta y tokens en los dos modos', () => {
    expect(css).toContain(PANEL_RULE);
    for (const block of [tokenBlock(':root'), tokenBlock('.dark')]) {
      expect(block).toMatch(/--sidebar:\s*oklch\(/);
      expect(block).toMatch(/--sidebar-muted-foreground:\s*oklch\(/);
    }
    expect(css.match(/--sidebar-panel-gradient:\s*linear-gradient\(/g)).toHaveLength(2);
  });

  it('R15 el item inactivo de la navegacion se pinta con --sidebar-muted-foreground en una regla sin capa', () => {
    expect(ruleBody(INACTIVE_SELECTOR)).toBe('color: var(--sidebar-muted-foreground);');
    expect(braceDepth(css, css.indexOf(INACTIVE_SELECTOR))).toBe(0);
  });

  it('R15 la regla del inactivo va despues del bloque del activo', () => {
    const inactive = css.indexOf(INACTIVE_SELECTOR);
    for (const activeBlock of [ACTIVE_RULE, ACTIVE_BAR_RULE, ACTIVE_ICON_RULE, ACTIVE_SUB_RULE]) {
      expect(css.indexOf(activeBlock)).toBeGreaterThan(-1);
      expect(css.indexOf(activeBlock)).toBeLessThan(inactive);
    }
  });

  it('R15 el selector es compuesto: el boton mismo, no sus descendientes', () => {
    // Un espacio entre `:is(...)` y `:not(...)` seria un combinador descendiente.
    expect(INACTIVE_SELECTOR).toMatch(/\):not\(\[data-active\]\):not\(:hover\):not\(:focus-visible\)$/);
  });

  it('R16 la regla deja fuera hover y foco, y el primitivo sigue aclarando el texto con el acento', () => {
    expect(INACTIVE_SELECTOR).toContain(':not(:hover)');
    expect(INACTIVE_SELECTOR).toContain(':not(:focus-visible)');
    expect(sidebarTsx).toContain('hover:text-sidebar-accent-foreground');
  });

  it('R16 con foco de teclado el inactivo toma el color del hover, en una regla sin capa dentro de sidebar-content', () => {
    // Decision humana 2026-10-10: el primitivo no pinta texto en focus-visible; sin esta regla
    // el item enfocado heredaba --sidebar-foreground.
    expect(ruleBody(FOCUS_SELECTOR)).toBe('color: var(--sidebar-accent-foreground);');
    expect(braceDepth(css, css.indexOf(FOCUS_SELECTOR))).toBe(0);
    expect(FOCUS_SELECTOR).toMatch(/\):not\(\[data-active\]\):focus-visible$/);
    expect(css.indexOf(FOCUS_SELECTOR)).toBeGreaterThan(css.indexOf(INACTIVE_SELECTOR));
  });

  it('R17 la regla del activo, su barra ::before y su icono no cambian', () => {
    expect(css).toContain(ACTIVE_RULE);
    expect(css).toContain(ACTIVE_BAR_RULE);
    expect(css).toContain(ACTIVE_ICON_RULE);
    expect(css).toContain(ACTIVE_SUB_RULE);
  });

  it('R17 la marca y el pie no reciben el tono apagado: la regla solo mira dentro de sidebar-content', () => {
    expect(INACTIVE_SELECTOR.startsWith("[data-slot='sidebar-content']")).toBe(true);
    expect(css.match(/color:\s*var\(--sidebar-muted-foreground\)/g)).toHaveLength(1);
    expect(css).not.toMatch(/sidebar-(header|footer)[^{]*\{[^}]*--sidebar-muted-foreground/);
  });

  it('R22 la base pinta el contorno con outline-ring opaco', () => {
    expect(css).toMatch(/@layer base \{\s*\* \{\s*@apply border-border outline-ring;/);
    expect(css).not.toMatch(/outline-ring\/\d+/);
  });
});
