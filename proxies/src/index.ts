import { Context, Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { Env } from "hono/types";

type ContextOptions = {
  Bindings: Env & { ORIGIN_URL_PROD?: string; ORIGIN_URL_STAGING?: string };
};

const app = new Hono<ContextOptions>();

app.use(
  "*",
  cors({
    origin: (_origin, c: Context<ContextOptions>) => {
      const ORIGIN_URL = c.env.ORIGIN_URL_PROD;
      if (!ORIGIN_URL) {
        throw new Error("ORIGIN_URL_PROD are required");
      }
      return ORIGIN_URL;
    },
    allowHeaders: ["*"],
    allowMethods: ["*"],
  })
);
app.use(
  "*",
  cors({
    origin: (_origin, c: Context<ContextOptions>) => {
      const ORIGIN_URL = c.env.ORIGIN_URL_STAGING;
      if (!ORIGIN_URL) {
        throw new Error("ORIGIN_URL_STAGING are required");
      }
      return ORIGIN_URL;
    },
    allowHeaders: ["*"],
    allowMethods: ["*"],
  })
);
app.use(
  "*",
  basicAuth({
    username: "dev",
    password: "dev",
  })
);
app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const ORIGIN_URL_PROD = c.env.ORIGIN_URL_PROD;
  const ORIGIN_URL_STAGING = c.env.ORIGIN_URL_STAGING;
  if (!ORIGIN_URL_PROD || !ORIGIN_URL_STAGING) {
    throw new Error("ORIGIN_URL_PROD and ORIGIN_URL_STAGING are required");
  }

  const newUrl =
    (url.hostname.startsWith("proxy-prod")
      ? ORIGIN_URL_PROD
      : ORIGIN_URL_STAGING) +
    url.pathname +
    url.search;
  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Forwarded-Host", url.hostname);

  const res = await fetch(newUrl, {
    ...c.req.raw,
    headers,
  });
  return new Response(res.body, {
    ...res,
    webSocket: res.webSocket ?? undefined,
  });
});

export default app;
