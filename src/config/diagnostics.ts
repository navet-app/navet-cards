export interface ConfigDiagnostic {
  code: 'invalid_config' | 'unsupported_version' | 'invalid_room' | 'duplicate_id' | 'unknown_reference';
  /** JSON-style location suitable for associating an editor error with a field. */
  path: string;
  message: string;
  severity: 'error';
}

export class ConfigValidationError extends Error {
  constructor(public readonly diagnostics: readonly ConfigDiagnostic[]) {
    super(`Navet Cards: ${diagnostics.map((item) => item.message).join(' ')}`);
    this.name = 'ConfigValidationError';
  }
}

export function configError(message: string, path = '$', code: ConfigDiagnostic['code'] = 'invalid_config'): never {
  throw new ConfigValidationError([{ code, path, message, severity: 'error' }]);
}
