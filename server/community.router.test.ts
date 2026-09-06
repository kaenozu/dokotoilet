import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { Server } from "node:http";
import { CommunityStore, createCommunityRouter } from "./community";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

const reviewBody = {
  userName: "tester",
  overallScore: 4,
  cleanlinessScore: 4,
  odorScore: 4,
  suppliesScore: 4,
  comment: "確認済み施設の口コミです",
};

async function startApp(knownIds: Set<string>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "community-router-"));
  const store = new CommunityStore(path.join(dir, "community.json"));
  const app = express();
  app.use(express.json());
  app.use(
    "/api/community",
    createCommunityRouter(store, "test-salt", (id) => knownIds.has(id))
  );
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(500).json({ error: "internal server error" });
    }
  );

  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  servers.push(server);

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing address");
  return `http://127.0.0.1:${address.port}`;
}

describe("community review route external facility validation", () => {
  it("returns 404 and does not persist reviews for a fabricated external id", async () => {
    const baseUrl = await startApp(new Set(["google-ChIJknown"]));

    const response = await fetch(
      `${baseUrl}/api/community/toilets/google-ChIJfabricated/reviews`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reviewBody),
      }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "toilet not found" });

    const list = await fetch(`${baseUrl}/api/community/toilets`);
    const body = (await list.json()) as { externalReviews: Record<string, unknown> };
    expect(body.externalReviews).toEqual({});
  });

  it("accepts a review for a registered external facility id", async () => {
    const baseUrl = await startApp(new Set(["google-ChIJknown"]));

    const response = await fetch(
      `${baseUrl}/api/community/toilets/google-ChIJknown/reviews`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reviewBody),
      }
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      facilityId: string;
      reviewCount: number;
    };
    expect(body.facilityId).toBe("google-ChIJknown");
    expect(body.reviewCount).toBe(1);
  });
});
