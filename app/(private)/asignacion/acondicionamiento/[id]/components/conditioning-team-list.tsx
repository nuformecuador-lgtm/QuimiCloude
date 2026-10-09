import type { ConditioningTeamMemberView } from '@/lib/modules/asignaciones';

export const CONDITIONING_TEAM_LIST_TESTID = 'conditioning-team-list';
export const CONDITIONING_TEAM_LIST_GROUP_TESTID = 'conditioning-team-list-group';
export const CONDITIONING_TEAM_LIST_GROUP_NAME_TESTID = 'conditioning-team-list-group-name';
export const CONDITIONING_TEAM_LIST_MEMBER_TESTID = 'conditioning-team-list-member';

export const CONDITIONING_TEAM_LIST_TEXTS = {
  title: 'Equipo',
  directLabel: 'Personas sueltas',
} as const;

type TeamGroup =
  | { readonly kind: 'direct'; readonly members: readonly ConditioningTeamMemberView[] }
  | {
      readonly kind: 'workGroup';
      readonly workGroupId: string;
      readonly workGroupName: string;
      readonly members: readonly ConditioningTeamMemberView[];
    };

function groupTeamByOrigin(team: readonly ConditioningTeamMemberView[]): readonly TeamGroup[] {
  const direct: ConditioningTeamMemberView[] = [];
  const byWorkGroup = new Map<string, { name: string; members: ConditioningTeamMemberView[] }>();

  for (const member of team) {
    if (member.origin.kind === 'direct') {
      direct.push(member);
      continue;
    }
    const { workGroupId, workGroupName } = member.origin;
    const existing = byWorkGroup.get(workGroupId);
    if (existing === undefined) byWorkGroup.set(workGroupId, { name: workGroupName, members: [member] });
    else existing.members.push(member);
  }

  const groups: TeamGroup[] = direct.length > 0 ? [{ kind: 'direct', members: direct }] : [];
  for (const [workGroupId, group] of byWorkGroup) {
    groups.push({ kind: 'workGroup', workGroupId, workGroupName: group.name, members: group.members });
  }
  return groups;
}

export type ConditioningTeamListProps = {
  readonly team: readonly ConditioningTeamMemberView[];
};

export function ConditioningTeamList({ team }: ConditioningTeamListProps) {
  const groups = groupTeamByOrigin(team);

  return (
    <section
      aria-labelledby="conditioning-team-heading"
      className="flex flex-col gap-2"
      data-testid={CONDITIONING_TEAM_LIST_TESTID}
    >
      <h2 id="conditioning-team-heading" className="text-base font-medium">
        {CONDITIONING_TEAM_LIST_TEXTS.title}
      </h2>
      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li
            key={group.kind === 'direct' ? 'direct' : group.workGroupId}
            className="flex flex-col gap-1"
            data-testid={CONDITIONING_TEAM_LIST_GROUP_TESTID}
            data-kind={group.kind}
          >
            <span className="text-sm font-medium" data-testid={CONDITIONING_TEAM_LIST_GROUP_NAME_TESTID}>
              {group.kind === 'direct' ? CONDITIONING_TEAM_LIST_TEXTS.directLabel : group.workGroupName}
            </span>
            <ul className="flex flex-col gap-1">
              {group.members.map((member) => (
                <li
                  key={member.userId}
                  className="text-base"
                  data-testid={CONDITIONING_TEAM_LIST_MEMBER_TESTID}
                  data-user-id={member.userId}
                >
                  {member.displayName}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
