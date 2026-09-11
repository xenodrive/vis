export function errorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    'reason' in error &&
    error.reason === 'UnexpectedStatus' &&
    typeof error.cause === 'object' &&
    error.cause !== null &&
    'status' in error.cause &&
    typeof error.cause.status === 'number'
  ) {
    return `${error.message} (HTTP ${error.cause.status})`;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String(error.message);
  return String(error);
}
