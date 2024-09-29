import { Hono } from "hono";
import { cors } from "hono/cors";
import { Env } from "hono/types";

const app = new Hono<{
  Bindings: Env & {
    ORIGIN_URL: string;
    GOOGLE_CLOUD_PRINT_IDENTITY_TOKEN: string;
  };
}>();

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
app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const ORIGIN_URL = c.env.ORIGIN_URL;
  const GOOGLE_CLOUD_PRINT_IDENTITY_TOKEN =
    c.env.GOOGLE_CLOUD_PRINT_IDENTITY_TOKEN;
  const newUrl = ORIGIN_URL + url.pathname + url.search;
  // 限定公開
  const res = await fetch(newUrl, {...c.req.raw, headers: {
    ...c.req.raw.headers,
    Authorization: `Bearer ${GOOGLE_CLOUD_PRINT_IDENTITY_TOKEN}`,
  }});
  // 公開時
  // const res = await fetch(newUrl, c.req.raw);
  return new Response(res.body, {
    ...res,
    webSocket: res.webSocket ?? undefined,
  });
});

export default app;
