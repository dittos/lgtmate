import { Hono } from "hono";
import { fetchGithubGraphql, fetchGithubJson, getGithubStatus } from "../../github-api";
import { getRouteNumber } from "../../hono/utils";

type GraphqlBody = {
  operationName?: string | null;
  query?: string;
  variables?: Record<string, boolean | number | string | null | undefined>;
};

export const githubRoutes = new Hono();

githubRoutes.get("/status", async (c) => {
  try {
    const output = await getGithubStatus();
    return c.json({ ok: true, output });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown GitHub CLI error"
      },
      500
    );
  }
});

githubRoutes.post("/graphql", async (c) => {
  let body: GraphqlBody;

  try {
    body = await c.req.json<GraphqlBody>();
  } catch {
    return c.json({ message: "Missing GraphQL request body" }, 400);
  }

  if (!body.query) {
    return c.json({ message: "Missing GraphQL query" }, 400);
  }

  try {
    const payload = await fetchGithubGraphql({
      operationName: body.operationName,
      query: body.query,
      variables: body.variables
    });

    return c.json(payload);
  } catch (error) {
    return c.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to fetch GitHub GraphQL API"
      },
      500
    );
  }
});

githubRoutes.get("/repos/:owner/:repo/pulls/:number/files", async (c) => {
  const number = getRouteNumber(c.req.param("number"), "pull request number");
  const accept = c.req.header("accept");
  const searchParams = new URL(c.req.url).searchParams;

  try {
    const payload = await fetchGithubJson(
      `/repos/${c.req.param("owner")}/${c.req.param("repo")}/pulls/${number}/files`,
      {
        headers: { accept },
        searchParams
      }
    );

    return c.json(payload);
  } catch (error) {
    return c.json(
      { message: error instanceof Error ? error.message : "Failed to fetch GitHub API" },
      500
    );
  }
});

githubRoutes.get("/repos/:owner/:repo/pulls/:number", async (c) => {
  const number = getRouteNumber(c.req.param("number"), "pull request number");
  const accept = c.req.header("accept");
  const searchParams = new URL(c.req.url).searchParams;

  try {
    const payload = await fetchGithubJson(
      `/repos/${c.req.param("owner")}/${c.req.param("repo")}/pulls/${number}`,
      {
        headers: { accept },
        searchParams
      }
    );

    return c.json(payload);
  } catch (error) {
    return c.json(
      { message: error instanceof Error ? error.message : "Failed to fetch GitHub API" },
      500
    );
  }
});
