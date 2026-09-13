// lib/modules/identity/domain/people-directory.ts
/**
 * QC-87 T3 — El contrato por el que OTRO modulo pregunta por personas de `identity`
 * (`design.md > 2.2`, R6, R17, R18, R37).
 *
 * Existe para que `asignaciones` **no toque `prisma.user`**: leer la tabla de otro modulo esta
 * prohibido por `docs/architecture.md > Anti-patrones` y lo detecta `guard-arquitectura-modulos`
 * (R16). El coste aceptado es una lectura mas por consulta; el beneficio es que el dia que el
 * nombre mostrable se componga de otra forma —o que una persona deje de ser `User`—, la ficha
 * que asigna responsables no se entera (`design.md > 11.3`).
 *
 * Vive en `domain/` y es **puro**: ni `@prisma/client`, ni `next/*`, ni `lib/shared/**`. Quien lo
 * implementa es `adapters/driven/persistence/assignment-directory-prisma.ts`, y quien lo ata a
 * su implementacion es `lib/composition` (R47).
 */

/**
 * Lo MINIMO que otro modulo necesita saber de una persona para asignarla o para mostrarla como
 * responsable: su identificador, su nombre mostrable **ya compuesto** y si su cuenta esta activa.
 *
 * `displayName` llega compuesto y no en tres campos a proposito: la regla de «primer nombre +
 * primer apellido, y el `username` si queda vacio» es `buildDisplayName` (QC-84 R19) y tiene sus
 * tests; entregar los tres campos crudos invitaria a una segunda concatenacion fuera de aqui.
 *
 * `isActive` es el estado **EFECTIVO** en el `now` que se pidio, **no la columna**: una fila
 * puede decir `active` con un plazo de bloqueo todavia vigente (QC-78 R11) y otra puede decir
 * `blocked` con el plazo ya vencido (QC-78 R8). Quien traduce es `effectiveAccountStatus`, la
 * unica funcion por la que pasan todos los lectores del estado de una cuenta (QC-78 R7).
 *
 * Lo que este tipo **no** lleva —correo, documento, rol, ninguna marca de baja y ningun dato de
 * credencial— lo fija el TIPO, no una promesa.
 */
export type PersonRef = {
  readonly id: string;
  readonly displayName: string;
  readonly isActive: boolean;
};

export interface PeopleDirectory {
  /**
   * Las personas VIVAS de esa empresa cuyo identificador se pide, para el camino de ESCRITURA.
   *
   * Un identificador que no existe, que esta dado de baja o que es de otra empresa simplemente
   * **NO vuelve**: quien pregunta no distingue los tres casos (R6), y por eso no puede convertir
   * esta consulta en un oraculo de existencia sobre datos ajenos. El caso de uso compara lo
   * pedido con lo devuelto y rechaza la operacion entera si falta alguno (R17).
   *
   * El orden de la salida no se promete: quien ordena es el caso de uso, que ya tiene su propio
   * criterio determinista (R24, R38).
   *
   * `now` entra **por parametro** —aqui no hay reloj propio (R21)—: es lo que permite que una
   * cuenta bloqueada cuyo plazo vencio vuelva a `isActive: true` **sin ninguna escritura**.
   */
  findAliveRefsInCompany(
    companyId: string,
    ids: readonly string[],
    now: Date,
  ): Promise<readonly PersonRef[]>;

  /**
   * Lo mismo, pero para la CONSULTA de responsables: incluye a las personas dadas de baja,
   * inactivas o bloqueadas, porque **siguen siendo responsables** (R37, QC-86 decision 9). Un
   * responsable que desaparece de la pantalla el dia que su cuenta se desactiva es un dato
   * perdido, no una pantalla mas limpia.
   *
   * `isActive` se calcula **igual** que en el metodo de arriba: la baja no cambia como se lee el
   * estado de la cuenta, solo si la fila vuelve o no. Los dos filtros de empresa siguen puestos
   * (R7): una persona de otra empresa no vuelve por este camino tampoco.
   */
  findRefsIncludingDeletedInCompany(
    companyId: string,
    ids: readonly string[],
    now: Date,
  ): Promise<readonly PersonRef[]>;
}
