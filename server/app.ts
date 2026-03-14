import { Hono } from "hono";
import { analyzerRoutes } from "./routes/api/analyzer";
import { githubRoutes } from "./routes/api/github";

const app = new Hono();

app.onError((error, c) => {
  console.error("[api] request failed", {
    method: c.req.method,
    path: c.req.path,
    error: error.message
  });

  return c.json(
    {
      ok: false,
      error: error.message || "Unexpected API error"
    },
    500
  );
});

app.notFound((c) => {
  return c.json({ ok: false, error: "Not found" }, 404);
});

app.get("/api/health", (c) => {
  return c.json({ ok: true });
});

app.route("/api/github", githubRoutes);
app.route("/api/analyzer", analyzerRoutes);

export default app;
