import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import {  Env } from "hono/types";

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
app.use("*",
  basicAuth({
    username: "username",
    password: "password",
  })
)
app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const ORIGIN_URL = c.env.ORIGIN_URL;
  const newUrl = ORIGIN_URL + url.pathname + url.search;
  const res = await fetch(newUrl, c.req.raw);
  return new Response(res.body, {
    ...res,
    webSocket: res.webSocket ?? undefined,
  });
});

export default app;
