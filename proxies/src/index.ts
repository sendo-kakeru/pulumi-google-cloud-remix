import { Hono } from "hono";
import { env } from "hono/adapter";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (_origin, c) => {
      const { ORIGIN_URL } = env(c);
      return ORIGIN_URL;
    },
    allowHeaders: ["*"],
    allowMethods: ["*"],
  })
);
app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const { ORIGIN_URL } = env(c);

  const newUrl = ORIGIN_URL + url.pathname + url.search;
  const res = await fetch(newUrl, c.req.raw);
  return new Response(res.body, {
    ...res,
    webSocket: res.webSocket ?? undefined,
  });
});

export default app;
