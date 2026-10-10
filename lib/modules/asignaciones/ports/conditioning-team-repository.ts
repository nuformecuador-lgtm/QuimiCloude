export type NewConditioningTeamMember = {
  readonly orderId: string;
  readonly userId: string;
  readonly companyId: string;
  readonly workGroupId: string | null;
  readonly workGroupName: string | null;
  readonly position: number;
};

export type ConditioningTeamMemberRow = {
  readonly userId: string;
  readonly workGroupId: string | null;
  readonly workGroupName: string | null;
};

/** Solo insercion y lectura: el equipo guardado no se edita ni se borra. */
export interface ConditioningTeamRepository {
  /** Una sola sentencia. Lanza si la PK choca: el caso de uso nunca manda duplicados. */
  insertAll(rows: readonly NewConditioningTeamMember[]): Promise<number>;
  /** Ordenadas por `position`, que es el orden de composicion. */
  listByOrderInCompany(companyId: string, orderId: string): Promise<readonly ConditioningTeamMemberRow[]>;
}
