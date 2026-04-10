/** Stable CLI exit codes documented in the hyper-pm PRD. */
export const ExitCode = {
  Success: 0,
  UserError: 1,
  EnvironmentAuth: 2,
  CorruptData: 3,
  ExternalApi: 4,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
