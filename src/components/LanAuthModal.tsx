import { useState } from "react";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { readLanAuthToken, saveLanAuthToken } from "@/lib/lan-auth";
import { useStore } from "@/state/store";

export function LanAuthModal() {
  const { state, dispatch } = useStore();
  const [token, setToken] = useState(() => readLanAuthToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(state.authError ?? null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Please enter an access token.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Verify token against server before committing to storage
      const res = await fetch("/api/instances", {
        headers: { "content-type": "application/json", Authorization: `Bearer ${trimmed}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Invalid access token");
      saveLanAuthToken(trimmed);
      dispatch({ type: "authRequired", required: false, error: null });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid access token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-hairline/60 bg-panel p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-ink">LAN Authentication</h2>
            <p className="text-[12.5px] text-ink-secondary">
              This server is protected with an access token.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-secondary">
              Access Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your OMB_AUTH_TOKEN..."
              autoComplete="off"
              autoFocus
              className="w-full rounded-xl border border-hairline/50 bg-inset px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-secondary focus:border-accent focus:outline-none"
            />
            <p className="mt-1.5 text-[11.5px] text-ink-secondary">
              Check the token in <code className="rounded bg-raised px-1 py-0.5 font-mono text-[11px]">.omb-lan-token</code> or your server environment.
            </p>
          </div>

          {(error ?? state.authError) && (
            <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-[12.5px] text-danger">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <span>{error ?? state.authError}</span>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[13px] font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : null}
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
