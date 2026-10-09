'use client';

import { useId, useMemo, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  ConditioningTeamCandidateGroup,
  ConditioningTeamCandidates,
} from '@/lib/modules/asignaciones';

export const CONDITIONING_TEAM_PICKER_TESTID = 'conditioning-team-picker';
export const CONDITIONING_TEAM_PEOPLE_TESTID = 'conditioning-team-people';
export const CONDITIONING_TEAM_GROUPS_TESTID = 'conditioning-team-groups';
export const CONDITIONING_TEAM_SEARCH_TESTID = 'conditioning-team-search';
export const CONDITIONING_TEAM_PERSON_TESTID = 'conditioning-team-person';
export const CONDITIONING_TEAM_GROUP_TESTID = 'conditioning-team-group';
export const CONDITIONING_TEAM_GROUP_ADMINS_TESTID = 'conditioning-team-group-admins';
export const CONDITIONING_TEAM_GROUP_EMPTY_TESTID = 'conditioning-team-group-empty';

export const CONDITIONING_TEAM_USER_IDS_FIELD = 'userIds';
export const CONDITIONING_TEAM_WORK_GROUP_IDS_FIELD = 'workGroupIds';

export const CONDITIONING_TEAM_PICKER_TEXTS = {
  peopleLegend: 'Personas',
  searchLabel: 'Buscar personas',
  noPeople: 'No hay personas que mostrar.',
  groupsLegend: 'Grupos de trabajo',
  noGroups: 'No hay grupos de trabajo que mostrar.',
  groupLabel: (name: string, contributes: number) =>
    `${name} · ${contributes} ${contributes === 1 ? 'persona' : 'personas'}`,
  excludedAdministrators: (count: number) =>
    count === 1
      ? '1 Administrador de este grupo no entra en el equipo.'
      : `${count} Administradores de este grupo no entran en el equipo.`,
  groupContributesNobody: 'Este grupo no aporta personas al equipo.',
} as const;

const TOUCH_TARGET = 'min-h-11 min-w-11';
// Por debajo de 16 px Safari en iOS hace zoom al enfocar el campo.
const FIELD_TEXT = 'text-base md:text-base';

export type ConditioningTeamSelection = {
  readonly userIds: readonly string[];
  readonly workGroupIds: readonly string[];
};

export const EMPTY_CONDITIONING_TEAM_SELECTION: ConditioningTeamSelection = {
  userIds: [],
  workGroupIds: [],
};

export function hasConditioningTeamSelection(selection: ConditioningTeamSelection): boolean {
  return selection.userIds.length > 0 || selection.workGroupIds.length > 0;
}

// Se conserva el orden en que se marcan: el servidor resuelve los repetidos por orden de llegada.
function toggle(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];
}

export type ConditioningTeamPickerProps = {
  readonly candidates: ConditioningTeamCandidates;
  readonly selection: ConditioningTeamSelection;
  readonly onSelectionChange: (selection: ConditioningTeamSelection) => void;
  readonly disabled?: boolean;
};

export function ConditioningTeamPicker({
  candidates,
  selection,
  onSelectionChange,
  disabled = false,
}: ConditioningTeamPickerProps) {
  const baseId = useId();
  const [search, setSearch] = useState('');

  const term = search.trim().toLocaleLowerCase();
  const people = useMemo(
    () =>
      term === ''
        ? candidates.people
        : candidates.people.filter((person) => person.displayName.toLocaleLowerCase().includes(term)),
    [candidates.people, term],
  );

  return (
    <div className="flex flex-col gap-4" data-testid={CONDITIONING_TEAM_PICKER_TESTID}>
      <fieldset className="flex flex-col gap-2" data-testid={CONDITIONING_TEAM_PEOPLE_TESTID}>
        <legend className="mb-2 text-sm font-medium">{CONDITIONING_TEAM_PICKER_TEXTS.peopleLegend}</legend>
        <Label htmlFor={`${baseId}-search`}>{CONDITIONING_TEAM_PICKER_TEXTS.searchLabel}</Label>
        <Input
          id={`${baseId}-search`}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
          data-testid={CONDITIONING_TEAM_SEARCH_TESTID}
        />
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">{CONDITIONING_TEAM_PICKER_TEXTS.noPeople}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {people.map((person) => {
              const id = `${baseId}-person-${person.id}`;
              return (
                <li key={person.id} className="flex items-center gap-2">
                  {/* Etiqueta hermana y no envolvente: dentro de un <label> un clic llega dos veces. */}
                  <Checkbox
                    id={id}
                    aria-label={person.displayName}
                    className={TOUCH_TARGET}
                    disabled={disabled}
                    checked={selection.userIds.includes(person.id)}
                    onCheckedChange={() =>
                      onSelectionChange({ ...selection, userIds: toggle(selection.userIds, person.id) })
                    }
                    data-testid={CONDITIONING_TEAM_PERSON_TESTID}
                    data-user-id={person.id}
                  />
                  <Label htmlFor={id} className="text-sm">
                    {person.displayName}
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2" data-testid={CONDITIONING_TEAM_GROUPS_TESTID}>
        <legend className="mb-2 text-sm font-medium">{CONDITIONING_TEAM_PICKER_TEXTS.groupsLegend}</legend>
        {candidates.workGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{CONDITIONING_TEAM_PICKER_TEXTS.noGroups}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {candidates.workGroups.map((group) => (
              <WorkGroupOption
                key={group.id}
                baseId={baseId}
                group={group}
                checked={selection.workGroupIds.includes(group.id)}
                disabled={disabled}
                onToggle={() =>
                  onSelectionChange({
                    ...selection,
                    workGroupIds: toggle(selection.workGroupIds, group.id),
                  })
                }
              />
            ))}
          </ul>
        )}
      </fieldset>

      {selection.userIds.map((userId) => (
        <input key={`user-${userId}`} type="hidden" name={CONDITIONING_TEAM_USER_IDS_FIELD} value={userId} />
      ))}
      {selection.workGroupIds.map((workGroupId) => (
        <input
          key={`group-${workGroupId}`}
          type="hidden"
          name={CONDITIONING_TEAM_WORK_GROUP_IDS_FIELD}
          value={workGroupId}
        />
      ))}
    </div>
  );
}

type WorkGroupOptionProps = {
  readonly baseId: string;
  readonly group: ConditioningTeamCandidateGroup;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
};

function WorkGroupOption({ baseId, group, checked, disabled, onToggle }: WorkGroupOptionProps) {
  const id = `${baseId}-group-${group.id}`;
  const hintId = `${id}-hint`;
  const contributesNobody = group.contributes === 0;
  const hasHint = contributesNobody || group.excludedAdministrators > 0;

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          aria-label={CONDITIONING_TEAM_PICKER_TEXTS.groupLabel(group.name, group.contributes)}
          aria-describedby={hasHint ? hintId : undefined}
          className={TOUCH_TARGET}
          disabled={disabled || contributesNobody}
          checked={checked}
          onCheckedChange={onToggle}
          data-testid={CONDITIONING_TEAM_GROUP_TESTID}
          data-work-group-id={group.id}
        />
        <Label htmlFor={id} className="text-sm">
          {CONDITIONING_TEAM_PICKER_TEXTS.groupLabel(group.name, group.contributes)}
        </Label>
      </div>
      {hasHint ? (
        <div id={hintId} className="flex flex-col gap-1 pl-13 text-sm text-muted-foreground">
          {group.excludedAdministrators > 0 ? (
            <p data-testid={CONDITIONING_TEAM_GROUP_ADMINS_TESTID}>
              {CONDITIONING_TEAM_PICKER_TEXTS.excludedAdministrators(group.excludedAdministrators)}
            </p>
          ) : null}
          {contributesNobody ? (
            <p data-testid={CONDITIONING_TEAM_GROUP_EMPTY_TESTID}>
              {CONDITIONING_TEAM_PICKER_TEXTS.groupContributesNobody}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
