/** `/api/health` identity for the process that answered the request.

`static` is true only when this process was explicitly configured to serve the
built UI (`OMB_STATIC_DIR`). Auto-detecting a leftover `dist/` must not report
the Console as static while Vite is the live SoT. */
export function healthPayload(opts: {
  pid: number;
  staticDirConfigured: boolean;
  authRequired: boolean;
}): { app: "openmausbot"; pid: number; static: boolean; authRequired: boolean } {
  return {
    app: "openmausbot",
    pid: opts.pid,
    static: opts.staticDirConfigured,
    authRequired: opts.authRequired,
  };
}

/** Vite is the Console SoT: rewrite proxied health so `:8802/api/health`
 * cannot inherit `static:true` from an API process that happens to have dist. */
export function withViteSotHealth<T extends Record<string, unknown>>(body: T): T & { static: false } {
  return { ...body, static: false };
}
