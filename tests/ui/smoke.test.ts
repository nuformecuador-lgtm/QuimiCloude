import { describe, expect, it } from 'vitest';

describe('runner de tests', () => {
  it('arranca y ejecuta un test trivial', () => {
    expect(1 + 1).toBe(2);
  });

  it('tiene el DOM de jsdom disponible', () => {
    const el = document.createElement('div');
    el.textContent = 'ok';
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
  });
});
