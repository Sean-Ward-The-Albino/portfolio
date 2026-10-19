// @ts-nocheck
// Copied from Avlory's avlory/packages/avlory_formats_js/src/errors.ts (v1.2.0, Apache-2.0) by scripts/sync-avlory.mjs. Don't edit.
/** Why a file couldn't be opened; the same names as the spec and the Dart and Python libraries. */
export type FileProblem = 'notPackage' | 'newerVersion' | 'needsPassword' | 'wrongPassword' | 'damaged' | 'wrongKind';

export class AvloryFileError extends Error {
  constructor(
    readonly problem: FileProblem,
    message: string,
  ) {
    super(message);
    this.name = 'AvloryFileError';
  }
}
