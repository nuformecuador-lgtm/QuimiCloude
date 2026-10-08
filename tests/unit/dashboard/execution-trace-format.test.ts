import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DELETED_ORDER_MARK,
  EXECUTION_ACTION_LABELS,
  TRACE_ORDER_STATUS_LABELS,
  formatTraceDuration,
  formatTraceInstant,
} from '@/app/(private)/dashboard/components/execution-trace-format';

const S = 1000;
const MIN = 60 * S;
const H = 60 * MIN;
const D = 24 * H;

describe('R15 - formato de una duracion por debajo de 24 h', () => {
  it.each([
    [0, '0 s'],
    [45 * S, '45 s'],
    [12 * MIN + 30 * S, '12 min 30 s'],
    [H + 5 * MIN, '1 h 05 min'],
    [15 * H + 20 * MIN, '15 h 20 min'],
    [D - S, '23 h 59 min'],
  ])('R15 - %i ms se muestra %j', (ms, expected) => {
    expect(formatTraceDuration({ kind: 'closed', ms })).toBe(expected);
  });
});

describe('R15 - formato de una duracion de 24 h o mas', () => {
  it('R15 - exactamente 24 h es 1 d 00 h 00 min', () => {
    expect(formatTraceDuration({ kind: 'closed', ms: D })).toBe('1 d 00 h 00 min');
  });

  it('R15 - dias, horas y minutos a dos cifras', () => {
    expect(formatTraceDuration({ kind: 'closed', ms: 2 * D + 2 * H + 5 * MIN })).toBe('2 d 02 h 05 min');
  });

  it('R15 - los segundos se truncan, no se redondean', () => {
    expect(formatTraceDuration({ kind: 'closed', ms: 2 * D + 2 * H + 5 * MIN + 59 * S })).toBe(
      '2 d 02 h 05 min',
    );
    expect(formatTraceDuration({ kind: 'closed', ms: 45 * S + 999 })).toBe('45 s');
  });
});

describe('R3 - R15 - la marca de cada tipo de duracion', () => {
  it('R3 - una duracion abierta se marca (en curso)', () => {
    expect(formatTraceDuration({ kind: 'open', ms: 45 * S })).toBe('45 s (en curso)');
  });

  it('R15 - sin anotacion de cierre se marca (sin cierre anotado)', () => {
    expect(formatTraceDuration({ kind: 'unclosed', ms: 0 })).toBe('0 s (sin cierre anotado)');
  });

  it('R15 - cerrada no lleva marca', () => {
    expect(formatTraceDuration({ kind: 'closed', ms: H + 5 * MIN })).toBe('1 h 05 min');
  });
});

describe('R13 - instantes, acciones y estados', () => {
  it('R13 - el instante se pinta en UTC como YYYY-MM-DD HH:mm:ss', () => {
    expect(formatTraceInstant(new Date('2026-10-07T23:05:09.123Z'))).toBe('2026-10-07 23:05:09');
  });

  it('R13 - las ocho acciones tienen su etiqueta en espanol', () => {
    expect(EXECUTION_ACTION_LABELS).toEqual({
      start: 'Arrancar',
      resume: 'Retomar',
      advance: 'Avanzar',
      go_back: 'Retroceder',
      cancel: 'Cancelar',
      finish: 'Finalizar',
      pack_start: 'Comenzar empaque',
      pack_finish: 'Terminar empaque',
    });
  });

  it('R3 - EN_CURSO se lee «En curso»', () => {
    expect(TRACE_ORDER_STATUS_LABELS.EN_CURSO).toBe('En curso');
  });

  it('R13 - la marca de dado de baja', () => {
    expect(DELETED_ORDER_MARK).toBe('Dado de baja');
  });

  it('R15 - ningun formato depende de la configuracion regional', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/(private)/dashboard/components/execution-trace-format.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/toLocale\w*String/);
    expect(source).not.toContain('Intl.');
  });
});
