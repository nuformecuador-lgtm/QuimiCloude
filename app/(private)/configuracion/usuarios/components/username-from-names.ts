import { USER_USERNAME_MAX_LENGTH } from '@/lib/modules/identity';

function tokens(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) =>
      token
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]/g, ''),
    )
    .filter((token) => token.length > 0);
}

/** Primer nombre completo, mas la inicial del resto de nombres y de cada apellido. */
export function usernameFromNames(firstNames: string, lastNames: string): string {
  const [first, ...otherNames] = tokens(firstNames);
  if (first === undefined) return '';
  const initials = [...otherNames, ...tokens(lastNames)].map((token) => token[0]).join('');
  return `${first}${initials}`.slice(0, USER_USERNAME_MAX_LENGTH);
}

/** El siguiente candidato: el sufijo numerico final, mas uno; sin sufijo, `1`. */
export function nextUsernameCandidate(username: string): string {
  const match = /^(.*?)(\d*)$/.exec(username);
  const base = match?.[1] ?? username;
  const digits = match?.[2] ?? '';
  // `BigInt`: un sufijo de mas de 15 cifras perderia precision como `number`.
  const suffix = digits === '' ? '1' : String(BigInt(digits) + BigInt(1));
  return `${base.slice(0, Math.max(0, USER_USERNAME_MAX_LENGTH - suffix.length))}${suffix}`;
}
