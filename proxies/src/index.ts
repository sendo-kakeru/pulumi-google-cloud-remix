import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { Env } from "hono/types";

const app = new Hono<{ Bindings: Env & { ORIGIN_URL: string } }>();

app.use(
  "*",
  cors({
    origin: (_origin, c) => {
      const ORIGIN_URL = c.env.ORIGIN_URL;
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
  const ORIGIN_URL = c.env.ORIGIN_URL;
  const newUrl = ORIGIN_URL + url.pathname + url.search;
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
