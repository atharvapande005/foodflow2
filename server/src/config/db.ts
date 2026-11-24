import path from "path";
import fs from "fs";
import os from "os";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let memoryServer: MongoMemoryServer | null = null;

const DATA_DIR = path.join(process.cwd(), ".data");
const LOCK_FILES = ["mongod.lock", "WiredTiger.lock"];

type ParsedVersion = { raw: string; parts: number[] };

const compareVersions = (a: ParsedVersion, b: ParsedVersion): number => {
  for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i += 1) {
    const diff = (a.parts[i] || 0) - (b.parts[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const binaryCacheDirs = (): string[] => {
  const dirs = [
    process.env.MONGOMS_DOWNLOAD_DIR,
    path.join(os.homedir(), ".cache", "mongodb-binaries"),
    path.join(process.cwd(), "node_modules", ".cache", "mongodb-memory-server", "mongodb-binaries"),
  ];
  return dirs.filter((dir): dir is string => Boolean(dir));
};

/**
 * An existing .data directory was written by a specific mongod major version.
 * Opening it with an older binary fails with "needs upgrade" (exit code 62),
 * so prefer the newest cached binary whenever a store already exists.
 */
const preferredBinaryVersion = (): string | undefined => {
  if (process.env.MONGOMS_VERSION) return process.env.MONGOMS_VERSION;
  if (!fs.existsSync(path.join(DATA_DIR, "WiredTiger"))) return undefined;

  const versions: ParsedVersion[] = [];
  for (const dir of binaryCacheDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const match = /^mongod-.*?-(\d+\.\d+\.\d+)(?:-[^/]*)?(?:\.exe)?$/i.exec(file);
      if (match) {
        versions.push({ raw: match[1], parts: match[1].split(".").map(Number) });
      }
    }
  }

  versions.sort(compareVersions);
  return versions.at(-1)?.raw;
};

// On Windows a running mongod keeps these locked, so deletion fails -> it is alive.
// If deletion succeeds the lock was stale (crashed/killed process) and safe to clear.
const clearStaleLocks = (dir: string): void => {
  for (const name of LOCK_FILES) {
    try {
      fs.unlinkSync(path.join(dir, name));
      console.warn(`[Database] Removed stale lock file: ${name}`);
    } catch {
      // Still held by a running mongod - leave it alone.
    }
  }
};

const startEmbedded = async (dbPath?: string, version?: string): Promise<string> => {
  if (dbPath) {
    fs.mkdirSync(dbPath, { recursive: true });
    clearStaleLocks(dbPath);
  }
  memoryServer = await MongoMemoryServer.create({
    instance: {
      // First-time WiredTiger initialization on a slow disk can exceed the
      // library's 10s default. Give the persistent store time so the app does
      // not silently fall back to a throwaway database.
      launchTimeout: 60_000,
      ...(dbPath ? { dbPath, storageEngine: "wiredTiger" } : {}),
    },
    ...(version ? { binary: { version } } : {}),
  });
  return memoryServer.getUri();
};

export const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;


  if (uri) {
    try {
      const conn = await mongoose.connect(uri);
      console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
      return;
    } catch (error) {
      console.error(
        `[Database] MongoDB connection failed: ${error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw new Error("Could not connect to the configured MongoDB database.");
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("MONGODB_URI is required in production.");
  }


  try {
    const version = preferredBinaryVersion();
    if (version) console.log(`[Database] Using cached MongoDB ${version} for the local store`);
    const memUri = await startEmbedded(DATA_DIR, version);
    await mongoose.connect(memUri);
    console.log(`[Database] Embedded database ready, data stored in ${DATA_DIR}`);
  } catch (error) {
    console.error(
      `[Database] Persistent local database failed to start: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    console.warn("[Database] Starting with a temporary database (data will NOT survive restarts).");
    memoryServer?.stop({ doCleanup: true }).catch(() => undefined);
    memoryServer = null;
    const memUri = await startEmbedded();
    await mongoose.connect(memUri);
    console.log("[Database] Temporary embedded database ready (no persistence)");
  }
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
  if (memoryServer) {
    // doCleanup:false keeps the data files on disk so they survive restarts
    await memoryServer.stop({ doCleanup: false });
    memoryServer = null;
  }
};