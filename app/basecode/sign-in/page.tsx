import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import {
  BASECODE_CALLBACK_URL,
  basecodeSignInPath,
  isBasecodeChallenge,
  isBasecodeRedirectUri,
  isBasecodeState,
} from "@/lib/basecode-auth";
import { createServerClient } from "@/lib/supabaseServer";
import { useAnotherCencoriAccount } from "./actions";
import { ContinueToBasecode } from "./continue-to-basecode";

type BasecodeSignInPageProps = {
  searchParams: Promise<{
    code_challenge?: string;
    error?: string;
    redirect_uri?: string;
    state?: string;
  }>;
};

export default async function BasecodeSignInPage({ searchParams }: BasecodeSignInPageProps) {
  const params = await searchParams;
  const challenge = params.code_challenge;
  const state = params.state;
  const redirectUri = params.redirect_uri ?? BASECODE_CALLBACK_URL;

  if (
    !isBasecodeChallenge(challenge) ||
    !isBasecodeState(state) ||
    !isBasecodeRedirectUri(redirectUri)
  ) {
    return <InvalidRequest />;
  }

  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const returnTo = basecodeSignInPath(challenge, state, redirectUri);
    redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
  }

  const metadata = data.user.user_metadata ?? {};
  const name =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    data.user.email?.split("@")[0] ||
    "Cencori user";
  const avatar =
    (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
    (typeof metadata.picture === "string" && metadata.picture) ||
    null;

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-sm text-center">
        <div className="mb-7 flex justify-center">
          <Logo variant="mark" className="h-7" />
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Basecode
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in with Cencori</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Continue with the Cencori account already open in this browser.
        </p>

        <div className="my-7 flex items-center gap-3 rounded-2xl bg-muted/55 p-3 text-left">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              referrerPolicy="no-referrer"
              src={avatar}
            />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{data.user.email}</p>
          </div>
        </div>

        {params.error ? (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {params.error}
          </p>
        ) : null}

        <ContinueToBasecode challenge={challenge} redirectUri={redirectUri} state={state} />

        <form action={useAnotherCencoriAccount}>
          <input name="code_challenge" type="hidden" value={challenge} />
          <input name="redirect_uri" type="hidden" value={redirectUri} />
          <input name="state" type="hidden" value={state} />
          <button
            className="mt-4 inline-flex h-10 items-center px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            type="submit"
          >
            Use another account
          </button>
        </form>
      </section>
    </main>
  );
}

function InvalidRequest() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 text-foreground">
      <section className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <Logo variant="mark" className="h-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">This sign-in link isn&apos;t valid</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Return to Basecode and start sign in again.
        </p>
      </section>
    </main>
  );
}
