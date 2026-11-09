import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

let replSet: MongoMemoryReplSet | undefined;

/** A single-node replica set so MongoDB transactions behave exactly as on Atlas. */
export async function setup(project: TestProject) {
  const systemBinary = process.env.MONGOMS_SYSTEM_BINARY ?? (await findSystemMongod());
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    ...(systemBinary ? { binary: { systemBinary } } : {}),
  });
  project.provide("mongoUri", replSet.getUri());
}

export async function teardown() {
  await replSet?.stop();
}

async function findSystemMongod(): Promise<string | undefined> {
  const { existsSync } = await import("node:fs");
  return ["/opt/homebrew/bin/mongod", "/usr/local/bin/mongod", "/usr/bin/mongod"].find((p) => existsSync(p));
}

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
