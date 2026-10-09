/** Solo para secretos de alta entropía: sin sal, un secreto elegido por una persona se adivina. */
export interface SecretDigest {
  digestOf(secret: string): string;
  matches(secret: string, storedDigest: string): boolean;
}
