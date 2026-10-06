// lib/modules/identity/ports/work-group-candidate-reader.ts
import type { MemberCandidate } from './work-group-repository';

/**
 * Una persona viva de la empresa que podria entrar en un grupo, con su estado CRUDO y su plazo:
 * quien decide si esta activa ahora es el dominio con el reloj, no el adaptador.
 */
export type WorkGroupCandidate = MemberCandidate & {
  readonly roleName: string;
};

export interface WorkGroupCandidateReader {
  /**
   * TODAS las personas vivas de la empresa que casan con `search`, menos `excludeUserId`, YA
   * ORDENADAS por apellidos, nombres e id. Sin pagina ni tamano: el corte va despues del filtro de
   * estado efectivo o el total mentiria.
   */
  listCandidatesAliveInCompany(
    companyId: string,
    excludeUserId: string,
    search: string,
  ): Promise<WorkGroupCandidate[]>;
}
