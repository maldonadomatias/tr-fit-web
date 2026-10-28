export function shouldStartBackgroundJobs(
  nodeEnv: string | undefined,
  enabled: string | undefined
): boolean {
  return nodeEnv !== 'test' && enabled !== 'false';
}
