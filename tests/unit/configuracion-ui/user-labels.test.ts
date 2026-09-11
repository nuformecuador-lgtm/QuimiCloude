// QC-67 T5 — Etiquetas de estado, opciones del filtro, nombres accesibles y formato de fecha:
// R13, R20, R26 (formato) y R41.
//
// **Ningun caso afirma sobre el copy** (R41): lo que se comprueba es que hay etiqueta para los
// cuatro estados del contrato y **para ninguno mas**, que las opciones del filtro se derivan del
// conjunto cerrado —no de una segunda lista— y que los nombres accesibles NOMBRAN al usuario.
// El texto concreto se toma de las constantes exportadas, nunca de un literal copiado.
//
// **La garantia fuerte de exhaustividad es el TIPO**, no este archivo: el mapa esta declarado
// `Record<UserAccountStatus, string>`, asi que un quinto estado en el dominio rompe el typecheck
// antes de que nadie corra un test. Lo que este archivo cierra es el otro lado: que no sobre
// ninguna clave.

import { describe, expect, it } from 'vitest';

import {
  USER_ACCOUNT_STATUS_LABELS,
  USER_STATUS_FILTER_OPTIONS,
  changeUserStatusLabel,
  deleteUserLabel,
  editUserLabel,
  toDateInputValue,
} from '@/app/(private)/configuracion/usuarios/components';
import { USER_ACCOUNT_STATUSES } from '@/lib/modules/identity';

const NOMBRE = 'Lopez Rivera Ana Maria';

describe('hay etiqueta para los cuatro estados y para NINGUNO mas (R20)', () => {
  it('las claves del mapa son exactamente el conjunto cerrado del contrato', () => {
    expect(Object.keys(USER_ACCOUNT_STATUS_LABELS).sort()).toEqual([...USER_ACCOUNT_STATUSES].sort());
  });

  it('cada estado tiene una etiqueta no vacia', () => {
    for (const estado of USER_ACCOUNT_STATUSES) {
      expect(USER_ACCOUNT_STATUS_LABELS[estado].trim().length).toBeGreaterThan(0);
    }
  });

  it('ninguna etiqueta se repite: dos estados que se leen igual son un estado invisible', () => {
    const etiquetas = USER_ACCOUNT_STATUSES.map((estado) => USER_ACCOUNT_STATUS_LABELS[estado]);

    expect(new Set(etiquetas).size).toBe(USER_ACCOUNT_STATUSES.length);
  });

  it('ninguna etiqueta es el valor crudo del enum: el estado se lee, no se descifra', () => {
    for (const estado of USER_ACCOUNT_STATUSES) {
      expect(USER_ACCOUNT_STATUS_LABELS[estado]).not.toBe(estado);
    }
  });
});

describe('las opciones del filtro se DERIVAN del conjunto cerrado (R13)', () => {
  it('hay una opcion por estado, en el mismo orden, y ninguna de mas', () => {
    expect(USER_STATUS_FILTER_OPTIONS).toEqual(
      USER_ACCOUNT_STATUSES.map((value) => ({ value, label: USER_ACCOUNT_STATUS_LABELS[value] })),
    );
  });

  it('no se excluye ningun estado del filtro', () => {
    expect(USER_STATUS_FILTER_OPTIONS.map((opcion) => opcion.value)).toEqual([
      ...USER_ACCOUNT_STATUSES,
    ]);
  });
});

describe('los nombres accesibles NOMBRAN al usuario (R41)', () => {
  it('las tres acciones incluyen el nombre mostrable', () => {
    for (const componer of [editUserLabel, deleteUserLabel, changeUserStatusLabel]) {
      expect(componer(NOMBRE)).toContain(NOMBRE);
    }
  });

  it('las tres se distinguen entre si: tres botones por fila con el mismo nombre no sirven', () => {
    const nombres = [editUserLabel(NOMBRE), deleteUserLabel(NOMBRE), changeUserStatusLabel(NOMBRE)];

    expect(new Set(nombres).size).toBe(3);
  });
});

describe('`toDateInputValue` da `YYYY-MM-DD` en UTC (R26)', () => {
  it('devuelve exactamente diez caracteres con la forma que `<input type="date">` espera', () => {
    const valor = toDateInputValue(new Date(Date.UTC(1990, 4, 17)));

    expect(valor).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(valor).toBe('1990-05-17');
  });

  it('NO resta un dia en husos negativos: una fecha a medianoche UTC se conserva', () => {
    // Es el caso real: `birthDate` viene de una columna `@db.Date`, o sea medianoche UTC.
    // Formatear con el huso local restaria un dia entero en America y el formulario de edicion
    // precargaria una fecha de nacimiento equivocada.
    const medianocheUtc = new Date('1990-05-17T00:00:00.000Z');

    expect(toDateInputValue(medianocheUtc)).toBe('1990-05-17');
  });

  it('tampoco adelanta un dia en husos positivos: al final del dia UTC sigue siendo ese dia', () => {
    expect(toDateInputValue(new Date('1990-05-17T23:59:59.999Z'))).toBe('1990-05-17');
  });
});
