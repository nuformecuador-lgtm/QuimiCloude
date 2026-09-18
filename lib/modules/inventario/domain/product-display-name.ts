export function productDisplayName(name: string, unitLabel: string | null): string {
  if (!unitLabel) return name;

  return `${name} · ${unitLabel}`;
}
