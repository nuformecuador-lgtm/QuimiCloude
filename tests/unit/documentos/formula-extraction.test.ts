// Interpretar el texto de formula que dejo la IA. Dominio puro: sin red y sin proveedor
// configurado.

import { describe, expect, it } from 'vitest';

import { extractFormulaFromText, readPercentage } from '@/lib/modules/documentos/domain/formula-extraction';
import { ValidationError } from '@/lib/modules/documentos/domain/errors';
import {
  CANNED_FORMULA_PACKING_STEP_1,
  CANNED_FORMULA_PACKING_STEP_2_LINE_A,
  CANNED_FORMULA_PACKING_STEP_2_LINE_B,
  CANNED_FORMULA_TEXT,
} from '@/lib/modules/documentos/adapters/driven/ai/ai-reader-canned';

describe('documentos — interpretacion tolerante del texto de formula', () => {
  describe('R4 — tolera la forma del texto y de cada campo, sin perder el ingrediente', () => {
    it('con VALLA de codigo ```json, se interpreta igual', () => {
      const texto = '```json\n{"ingredients":[{"name":"Agua","percentage":"50"}]}\n```';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.ingredients).toHaveLength(1);
      expect(resultado.ingredients[0]?.name).toBe('Agua');
    });

    it('con PROSA antes y despues del objeto, se interpreta igual', () => {
      const texto = 'Aqui esta la formula:\n{"ingredients":[{"name":"Agua"}]}\nEspero que sirva.';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.ingredients).toHaveLength(1);
    });

    it('un campo en null se interpreta como vacio', () => {
      const texto = '{"name":null,"description":null,"ingredients":[{"name":"Agua","percentage":null}],"steps":null}';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.name).toBeNull();
      expect(resultado.description).toBeNull();
      expect(resultado.ingredients[0]?.percentage).toBeNull();
    });

    it('una clave ausente se interpreta como vacio', () => {
      const resultado = extractFormulaFromText('{"ingredients":[{"name":"Agua"}]}');
      expect(resultado.name).toBeNull();
      expect(resultado.description).toBeNull();
      expect(resultado.ingredients[0]?.percentage).toBeNull();
      expect(resultado.ingredients[0]?.quantity).toBeNull();
      expect(resultado.ingredients[0]?.unit).toBeNull();
    });

    it('una clave desconocida en la raiz o en el ingrediente se ignora', () => {
      const texto = '{"ingredients":[{"name":"Agua","otraClave":123}],"raizDesconocida":true}';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.ingredients).toHaveLength(1);
      expect(resultado.ingredients[0]?.name).toBe('Agua');
    });

    it('un tipo erroneo en un campo deja SOLO ese campo vacio, el ingrediente sobrevive', () => {
      const texto = '{"ingredients":[{"name":"Agua","unit":42,"quantity":true}]}';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.ingredients).toHaveLength(1);
      expect(resultado.ingredients[0]?.name).toBe('Agua');
      expect(resultado.ingredients[0]?.unit).toBeNull();
      expect(resultado.ingredients[0]?.quantity).toBeNull();
    });

    it('un elemento de "ingredients" que no es objeto se descarta', () => {
      const texto = '{"ingredients":["no es un objeto", 42, null, {"name":"Agua"}]}';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.ingredients).toHaveLength(1);
      expect(resultado.ingredients[0]?.name).toBe('Agua');
    });

    it('un ingrediente con todos sus campos vacios se descarta', () => {
      const texto = '{"ingredients":[{"name":null,"percentage":null,"quantity":null,"unit":null},{"name":"Agua"}]}';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.ingredients).toHaveLength(1);
      expect(resultado.ingredients[0]?.name).toBe('Agua');
    });
  });

  describe('R5 — sin JSON interpretable, se rechaza el documento entero', () => {
    it('sin ningun objeto JSON en el texto -> ValidationError invalid_input', () => {
      let capturado: unknown;
      try {
        extractFormulaFromText('lo siento, no puedo procesar este documento');
      } catch (error) {
        capturado = error;
      }
      expect(capturado).toBeInstanceOf(ValidationError);
      expect((capturado as ValidationError).code).toBe('invalid_input');
    });

    it('JSON mal formado -> ValidationError invalid_input', () => {
      let capturado: unknown;
      try {
        extractFormulaFromText('```json\n{"ingredients": [{"name": "Agua",}]}\n```');
      } catch (error) {
        capturado = error;
      }
      expect(capturado).toBeInstanceOf(ValidationError);
      expect((capturado as ValidationError).code).toBe('invalid_input');
    });

    it('"ingredients" no es ni lista ni null (es un numero) -> ValidationError invalid_input', () => {
      let capturado: unknown;
      try {
        extractFormulaFromText('{"ingredients": 5}');
      } catch (error) {
        capturado = error;
      }
      expect(capturado).toBeInstanceOf(ValidationError);
      expect((capturado as ValidationError).code).toBe('invalid_input');
    });

    it('"steps" no es ni lista ni null (es una cadena) -> ValidationError invalid_input', () => {
      let capturado: unknown;
      try {
        extractFormulaFromText('{"steps": "x"}');
      } catch (error) {
        capturado = error;
      }
      expect(capturado).toBeInstanceOf(ValidationError);
      expect((capturado as ValidationError).code).toBe('invalid_input');
    });
  });

  describe('R6 — es pura: no muta el texto de entrada ni escribe nada', () => {
    it('el texto pasado como argumento queda igual tras interpretar', () => {
      const texto = '{"ingredients":[{"name":"Agua","percentage":"50"}]}';
      const copia = texto;
      extractFormulaFromText(texto);
      expect(texto).toBe(copia);
    });

    it('llamarla dos veces con el mismo texto da el mismo resultado', () => {
      const texto = '{"name":"Formula","ingredients":[{"name":"Agua","percentage":"50"}],"steps":["Mezclar"]}';
      const primero = extractFormulaFromText(texto);
      const segundo = extractFormulaFromText(texto);
      expect(primero).toEqual(segundo);
    });
  });

  describe('R7 — readPercentage: solo propone si casa el patron, nunca redondea', () => {
    it('"12,5" -> propuesta "12.5"', () => {
      expect(readPercentage('12,5')).toEqual({ value: '12.5', read: '12,5' });
    });

    it('"12.5 %" -> propuesta "12.5"', () => {
      expect(readPercentage('12.5 %')).toEqual({ value: '12.5', read: '12.5 %' });
    });

    it('12.5 (numero JSON) -> propuesta "12.5"', () => {
      expect(readPercentage(12.5)).toEqual({ value: '12.5', read: '12.5' });
    });

    it('"33.333" (mas de 2 decimales) -> vacio, read intacto, sin redondear', () => {
      expect(readPercentage('33.333')).toEqual({ value: null, read: '33.333' });
    });

    it('"0" -> vacio, read intacto', () => {
      expect(readPercentage('0')).toEqual({ value: null, read: '0' });
    });

    it('"-1" (negativo) -> vacio, read intacto', () => {
      expect(readPercentage('-1')).toEqual({ value: null, read: '-1' });
    });

    it('"101" (mayor que 100) -> vacio, read intacto', () => {
      expect(readPercentage('101')).toEqual({ value: null, read: '101' });
    });

    it('"abc" (texto) -> vacio, read intacto', () => {
      expect(readPercentage('abc')).toEqual({ value: null, read: 'abc' });
    });

    it('"1e2" (cadena en notacion cientifica, no numero) -> vacio, read intacto', () => {
      expect(readPercentage('1e2')).toEqual({ value: null, read: '1e2' });
    });

    it('ausente (undefined) -> vacio sin read', () => {
      expect(readPercentage(undefined)).toEqual({ value: null, read: null });
    });

    it('null -> vacio sin read', () => {
      expect(readPercentage(null)).toEqual({ value: null, read: null });
    });
  });

  describe('R8 — quantity y unit son solo referencia, no alimentan el porcentaje', () => {
    it('quantity y unit se leen como texto sin afectar el porcentaje', () => {
      const texto = '{"ingredients":[{"name":"Agua","percentage":null,"quantity":"250","unit":"g"}]}';
      const resultado = extractFormulaFromText(texto);
      const ingrediente = resultado.ingredients[0];
      expect(ingrediente?.percentage).toBeNull();
      expect(ingrediente?.quantity).toBe('250');
      expect(ingrediente?.unit).toBe('g');
    });

    it('quantity como numero JSON se convierte a texto de referencia', () => {
      const texto = '{"ingredients":[{"name":"Agua","quantity":250}]}';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.ingredients[0]?.quantity).toBe('250');
    });
  });

  describe('R9 — pasos: un parrafo por linea no vacia, en orden, descartando los en blanco', () => {
    it('un paso de tres lineas con una vacia da dos parrafos', () => {
      const texto = '{"steps":["Primero\\n\\nSegundo"]}';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.steps).toHaveLength(1);
      expect(resultado.steps[0]?.blocks).toHaveLength(2);
    });

    it('un paso en blanco se descarta y el orden de los demas se conserva', () => {
      const texto = '{"steps":["Primero","   ","Segundo"]}';
      const resultado = extractFormulaFromText(texto);
      expect(resultado.steps).toHaveLength(2);
      expect(resultado.steps[0]?.blocks[0]).toEqual({ kind: 'paragraph', spans: [{ text: 'Primero' }] });
      expect(resultado.steps[1]?.blocks[0]).toEqual({ kind: 'paragraph', spans: [{ text: 'Segundo' }] });
    });
  });
});

describe('QC-211 — pasos de envasado en el texto de formula', () => {
  function parrafos(texto: string) {
    return texto.split('\n').map((linea) => ({ kind: 'paragraph', spans: [{ text: linea }] }));
  }

  it('R14: `packingSteps` da documentos en orden, separados de `steps`', () => {
    const texto = JSON.stringify({
      steps: ['Mezclar en frio'],
      packingSteps: ['Envasar en garrafas', 'Tapar\nEtiquetar con el lote'],
    });
    const resultado = extractFormulaFromText(texto);

    expect(resultado.steps).toEqual([{ blocks: parrafos('Mezclar en frio') }]);
    expect(resultado.packingSteps).toEqual([
      { blocks: parrafos('Envasar en garrafas') },
      { blocks: parrafos('Tapar\nEtiquetar con el lote') },
    ]);
  });

  it('R14: un paso de envasado en blanco se descarta y el orden de los demas se conserva', () => {
    const resultado = extractFormulaFromText('{"packingSteps":["Envasar"," ","Sellar"]}');

    expect(resultado.packingSteps).toEqual([{ blocks: parrafos('Envasar') }, { blocks: parrafos('Sellar') }]);
    expect(resultado.steps).toEqual([]);
  });

  it('R14: el texto de guion trae dos pasos de envasado, el segundo de dos lineas, y sus tres pasos del operador', () => {
    const resultado = extractFormulaFromText(CANNED_FORMULA_TEXT);

    expect(resultado.steps).toHaveLength(3);
    expect(resultado.packingSteps).toEqual([
      { blocks: parrafos(CANNED_FORMULA_PACKING_STEP_1) },
      { blocks: parrafos(`${CANNED_FORMULA_PACKING_STEP_2_LINE_A}
${CANNED_FORMULA_PACKING_STEP_2_LINE_B}`) },
    ]);
  });

  it('R15: sin la clave `packingSteps` la lista es `[]` y lo demas se lee igual', () => {
    const resultado = extractFormulaFromText('{"name":"Formula","steps":["Mezclar"]}');

    expect(resultado.packingSteps).toEqual([]);
    expect(resultado.steps).toHaveLength(1);
    expect(resultado.name).toBe('Formula');
  });

  it('R15: `packingSteps: null` da `[]`', () => {
    expect(extractFormulaFromText('{"packingSteps":null}').packingSteps).toEqual([]);
  });

  it.each([
    ['un objeto', '{"packingSteps":{"a":"Envasar"}}'],
    ['un numero', '{"packingSteps":3}'],
    ['una cadena', '{"packingSteps":"Envasar"}'],
  ])('R15: `packingSteps` como %s -> ValidationError invalid_input con su diagnostico', (_caso, texto) => {
    let capturado: unknown;
    try {
      extractFormulaFromText(texto);
    } catch (error) {
      capturado = error;
    }
    expect(capturado).toBeInstanceOf(ValidationError);
    expect((capturado as ValidationError).code).toBe('invalid_input');
    expect((capturado as ValidationError).diagnostic).toContain("'packingSteps' no es ni lista ni null");
  });
});
