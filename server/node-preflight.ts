/** Fail fast when someone boots the harness on Node < 24.
 *  `package.json` `engines` is only a pnpm warning; Node 22 then fails the
 *  suite with dozens of misleading child-process / strip-types errors. */

export const MIN_NODE_MAJOR = 24;

export function nodeVersionError(version: string, minMajor = MIN_NODE_MAJOR): string | null {
  const major = Number.parseInt(version.replace(/^v/, ""), 10);
  if (Number.isInteger(major) && major >= minMajor) return null;
  return (
    `OpenMausBot requires Node >= ${minMajor} (package.json "engines"), but this is Node ${version}. ` +
    `Older versions appear to work but fail in confusing ways (e.g. type-stripped child processes misbehave). ` +
    `Install Node ${minMajor}+ (e.g. \`nvm install ${minMajor}\`) and retry.`
  );
}

export function assertSupportedNode(version = process.version): void {
  const error = nodeVersionError(version);
  if (error === null) return;
  console.error(error);
  process.exit(1);
}
