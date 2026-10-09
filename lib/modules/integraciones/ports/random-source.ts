export interface RandomSource {
  newId(): string;
  newVerifyToken(): string;
}
