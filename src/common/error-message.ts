export function errorMessage(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- intentional fallback for non-Error throws
  return err instanceof Error ? err.message : String(err);
}
