// El texto del prompt de cada estrategia: se lee EN LA INVOCACION, nunca al importar el modulo, de
// modo que importar el adaptador con todo vacio no falle. Vacia o solo-espacios cuenta como
// ausente; si falta, el error nombra la variable de ESA estrategia y ninguna hereda de la otra.
//
// Ningun caso hace red ni depende de que CATALOG_PROMPT o FORMULA_PROMPT tengan valor.

import { afterEach, describe, expect, it } from 'vitest';

const VARS = ['CATALOG_PROMPT', 'FORMULA_PROMPT'] as const;

describe('documentos — el prompt de cada estrategia, leido del entorno', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it('R2 — importar el adaptador con el entorno vacio no lanza', async () => {
    for (const name of VARS) delete process.env[name];

    const modulo = await import(
      '@/lib/modules/documentos/adapters/driven/config/strategy-prompt-env'
    );

    expect(typeof modulo.readStrategyPromptFromEnv).toBe('function');
  });

  it('R1 — catalogo lee CATALOG_PROMPT y formula lee FORMULA_PROMPT', async () => {
    const { readStrategyPromptFromEnv } = await import(
      '@/lib/modules/documentos/adapters/driven/config/strategy-prompt-env'
    );
    for (const name of VARS) delete process.env[name];
    process.env.CATALOG_PROMPT = 'PROMPT DE PRUEBA — catalogo';
    process.env.FORMULA_PROMPT = 'PROMPT DE PRUEBA — formula';

    expect(readStrategyPromptFromEnv('catalogo')).toBe('PROMPT DE PRUEBA — catalogo');
    expect(readStrategyPromptFromEnv('formula')).toBe('PROMPT DE PRUEBA — formula');
  });

  it('R3, R4 — CATALOG_PROMPT ausente falla nombrando la variable', async () => {
    const { readStrategyPromptFromEnv } = await import(
      '@/lib/modules/documentos/adapters/driven/config/strategy-prompt-env'
    );
    delete process.env.CATALOG_PROMPT;
    process.env.FORMULA_PROMPT = 'PROMPT DE PRUEBA';

    expect(() => readStrategyPromptFromEnv('catalogo')).toThrowError(/CATALOG_PROMPT/);
  });

  it('R3, R4 — CATALOG_PROMPT vacia falla igual que ausente, nombrando la variable', async () => {
    const { readStrategyPromptFromEnv } = await import(
      '@/lib/modules/documentos/adapters/driven/config/strategy-prompt-env'
    );
    process.env.CATALOG_PROMPT = '';
    process.env.FORMULA_PROMPT = 'PROMPT DE PRUEBA';

    expect(() => readStrategyPromptFromEnv('catalogo')).toThrowError(/CATALOG_PROMPT/);
  });

  it('R3, R4 — FORMULA_PROMPT solo-espacios falla igual que ausente, nombrando la variable', async () => {
    const { readStrategyPromptFromEnv } = await import(
      '@/lib/modules/documentos/adapters/driven/config/strategy-prompt-env'
    );
    process.env.CATALOG_PROMPT = 'PROMPT DE PRUEBA';
    process.env.FORMULA_PROMPT = '   ';

    expect(() => readStrategyPromptFromEnv('formula')).toThrowError(/FORMULA_PROMPT/);
  });

  it('R3 — el valor se devuelve sin recortar: espacios y saltos de linea al borde vuelven intactos', async () => {
    const { readStrategyPromptFromEnv } = await import(
      '@/lib/modules/documentos/adapters/driven/config/strategy-prompt-env'
    );
    const conBordes = '  \nPROMPT DE PRUEBA con borde\n  ';
    process.env.CATALOG_PROMPT = conBordes;
    process.env.FORMULA_PROMPT = 'PROMPT DE PRUEBA';

    expect(readStrategyPromptFromEnv('catalogo')).toBe(conBordes);
  });

  it('R5 — con CATALOG_PROMPT puesta y FORMULA_PROMPT vacia, formula falla y no hereda el texto de catalogo', async () => {
    const { readStrategyPromptFromEnv } = await import(
      '@/lib/modules/documentos/adapters/driven/config/strategy-prompt-env'
    );
    process.env.CATALOG_PROMPT = 'PROMPT DE PRUEBA — solo catalogo';
    process.env.FORMULA_PROMPT = '';

    expect(readStrategyPromptFromEnv('catalogo')).toBe('PROMPT DE PRUEBA — solo catalogo');
    expect(() => readStrategyPromptFromEnv('formula')).toThrowError(/FORMULA_PROMPT/);
  });
});
