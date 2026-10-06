// lib/modules/identity/domain/work-group-queryable.ts
/**
 * QC-84 T4 — Las DOS listas blancas de campos consultables de los grupos de trabajo
 * (`design.md > 6`; QC-57 R4).
 *
 * Consumen el contrato de listado de QC-57 **que `identity` YA TIENE** desde QC-66
 * (`./list-query.ts`): esta ficha **no crea una copia nueva** del contrato y por eso **no toca**
 * `tests/guards/guard-contrato-listados.test.ts`. Es la diferencia mas importante con QC-66 § 8.1,
 * y esta dicha por escrito en `design.md > 2`.
 *
 * Lo que no este declarado aqui se **omite** sin romper la consulta (QC-57 R5) —y se anota por el
 * puerto de registro—, que es exactamente lo que hace verdadero R27: declarar un campo consultable
 * mas es una linea AQUI y **no cambia la forma de la consulta**, asi que la pantalla de QC-85 no
 * tiene que reabrirla.
 *
 * `deletedAt` **no esta a proposito en ninguna de las dos listas** (R9, R40): un grupo dado de baja
 * es inexistente para las siete operaciones, y nadie puede pedir ver los dados de baja por la
 * puerta del orden ni del filtro. Ademas `NEVER_QUERYABLE`, dentro de `list-query.ts`, lo bloquea
 * **por su cuenta** aunque alguien lo declarase aqui: son dos defensas distintas, no una
 * redundancia.
 *
 * Dominio puro: de fuera del modulo no entra nada, y de dentro se importa por ruta RELATIVA.
 */

import type { ListQueryable } from './list-query';

/**
 * El listado de GRUPOS (R24–R27).
 *
 * El orden por defecto —`name ASC, id ASC` (R25)— lo pone el adaptador; esta lista declara lo que
 * el cliente PUEDE pedir. El `id` del desempate no es adorno: dos grupos vivos de la misma empresa
 * no pueden llamarse igual (R12), pero cuando el orden pedido es `createdAt` el empate es trivial,
 * y sin desempate estable un grupo podria aparecer en dos paginas o en ninguna.
 *
 * `filterable` vacio **no cierra nada** (R27): ninguna decision del humano pide un filtro hoy, y
 * anadir uno manana es una linea aqui que no cambia la firma —la leccion QC-38 → QC-39 que la
 * decision 13 hereda—.
 *
 * `searchable: true` dice SOLO que este listado busca. **Que columna toca la busqueda —el nombre—
 * es del adaptador driven**, el unico que conoce la base: el contrato compartido de QC-57 declara
 * `searchable: boolean` y nada mas, igual que en los otros modulos.
 *
 * Lo que NO sale nunca por aqui: `nameNormalized`, que es la forma canonica con la que compara el
 * indice y no un dato consultable, y `companyId`, que no se elige —toda consulta esta acotada a la
 * empresa del actor por el puerto (R8)—.
 */
export const WORK_GROUP_QUERYABLE: ListQueryable = {
  sortable: ['name', 'createdAt'],
  filterable: {},
  searchable: true,
};

/**
 * La lista de MIEMBROS de un grupo (R19–R23, R51–R54). **Las tres vacias, y no es un olvido**: son
 * la forma de decir «de la consulta compartida, aqui solo se usan la pagina y el tamano»
 * (`design.md > 6`).
 *
 *   - `sortable: []` — **R22**: el orden es FIJO (apellidos, nombres, identificador) y lo garantiza
 *     el SQL. Dejar pedir otro orden romperia el desempate estable de R53, que es lo que impide que
 *     dos homonimas se intercambien entre paginas.
 *   - `filterable: {}` — el unico filtro es el de **R19**, el del estado efectivo de la cuenta, y
 *     **no lo pide quien llama**: lo aplica el caso de uso con `effectiveAccountStatus`. Declararlo
 *     aqui lo volveria opcional, que es justo lo contrario de lo que R19 exige.
 *   - `searchable: false` — ninguna decision pide buscar dentro de un grupo. Si manana QC-85 lo
 *     pide, es **una linea** aqui y la firma no cambia (R54).
 *
 * `sanitizeListQuery` **omite** lo que no este declarado en vez de romper (QC-57 R5): una pantalla
 * que mande un orden o una busqueda recibe la lista, no un error.
 */
export const WORK_GROUP_MEMBER_QUERYABLE: ListQueryable = {
  sortable: [],
  filterable: {},
  searchable: false,
};

/**
 * Los candidatos a grupo. Orden fijo (apellidos, nombres, id) y sin filtros: el estado efectivo lo
 * aplica siempre el caso de uso, no quien llama. Solo se busca.
 */
export const WORK_GROUP_CANDIDATE_QUERYABLE: ListQueryable = {
  sortable: [],
  filterable: {},
  searchable: true,
};
