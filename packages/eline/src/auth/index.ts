export type TokenValue = string | (() => string | Promise<string>);

export type OutboundAuthFn = () => Promise<{
  readonly headers: Readonly<Record<string, string>>;
}>;

export function bearer(token: TokenValue): OutboundAuthFn {
  return async () => ({
    headers: {
      authorization: `Bearer ${await resolveToken(token)}`,
    },
  });
}

export function basic(input: {
  username: string;
  password: TokenValue;
}): OutboundAuthFn {
  return async () => ({
    headers: {
      authorization: `Basic ${btoa(`${input.username}:${await resolveToken(input.password)}`)}`,
    },
  });
}

async function resolveToken(value: TokenValue): Promise<string> {
  return typeof value === "function" ? await value() : value;
}
