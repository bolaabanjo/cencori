/**
 * Hosted-agent deployments are an unfinished, local-development-only build.
 *
 * Keep this check server-side for every mutation path. UI hiding and proxy
 * routing are defense in depth; neither should be trusted to prevent a deploy.
 */
export function isLocalComputeBuild(): boolean {
    return process.env.NODE_ENV !== 'production';
}
