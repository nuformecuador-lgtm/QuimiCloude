export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, storedHash: string): Promise<boolean>;
}
