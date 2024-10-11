const RepoToTeamMap: Record<string, string> = {
  'getsentry/sentry-javascript': 'Web Frontend SDKs',
  'getsentry/sentry-python': 'Web Backend SDKs',
};

export function getTeamForFullRepo(fullRepo: string): string | undefined {
  return RepoToTeamMap[fullRepo];
}
