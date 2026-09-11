// lib/modules/identity/domain/user-queryable.ts
/**
 * Lista blanca del listado de USUARIOS (QC-66 `design.md > 8.1`; QC-57 R4). Lo que no este aqui
 * se omite sin romper la consulta (QC-57 R5), que es exactamente lo que hace verdadero R36:
 * declarar un campo consultable mas es una linea AQUI y **no cambia la forma de la consulta**,
 * asi que la pantalla de QC-67 no tiene que reabrirla.
 *
 * `deletedAt` **no esta a proposito en ninguna de las dos listas** (R34, R39): un usuario borrado
 * logicamente es inexistente para las seis operaciones, y nadie puede pedir ver los borrados por
 * la puerta del orden ni del filtro. Ademas `NEVER_QUERYABLE`, dentro de `list-query.ts`, lo
 * bloquea **por su cuenta** aunque alguien lo declarase aqui: son dos defensas distintas, no una
 * redundancia.
 *
 * `searchable: true` (R28) dice SOLO que este listado busca. **Que columnas toca la busqueda
 * -nombres, apellidos, correo y nombre de usuario- es del adaptador driven**, el unico que
 * conoce la base: el contrato compartido de QC-57 declara `searchable: boolean` y nada mas, igual
 * que en los otros cinco modulos.
 *
 * Tampoco hay filtro por ROL (`design.md > 15`): la decision cerrada 11 enumera busqueda y filtro
 * por estado, y nada mas. Anadirlo despues es una linea en `filterable`.
 *
 * Lo que NO sale nunca por aqui: ningun dato de credencial -`passwordHash` y los tres contadores
 * de QC-19- ni `companyId`, que no es consultable porque no se elige: toda consulta esta acotada
 * a la empresa del actor por el puerto (R33).
 */

import type { ListQueryable } from './list-query';

export const USER_QUERYABLE: ListQueryable = {
  /**
   * El orden por defecto -`lastNames ASC, firstNames ASC, id ASC` (R30)- lo pone el adaptador;
   * esta lista declara lo que el cliente PUEDE pedir. `accountStatus` es un enum de Postgres y
   * ordena por orden de declaracion del enum, no por el alfabetico.
   */
  sortable: ['lastNames', 'firstNames', 'username', 'email', 'accountStatus', 'createdAt'],
  /** R29: el filtro por estado de cuenta, opcional y multivalor (`select`, QC-57 R12). */
  filterable: { accountStatus: 'select' },
  /** R28: busca por nombres o apellidos, correo y nombre de usuario. */
  searchable: true,
};
