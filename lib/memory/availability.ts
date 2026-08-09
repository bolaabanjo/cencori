/**
 * Cencori Memory is still a local-development-only build.
 *
 * Route hiding is defense in depth. Runtime entry points must also consult
 * this check so a production caller cannot activate memory through Chat or
 * Sessions by sending a `memory` directive.
 */
export function isLocalMemoryBuild(): boolean {
    return process.env.NODE_ENV !== 'production';
}
