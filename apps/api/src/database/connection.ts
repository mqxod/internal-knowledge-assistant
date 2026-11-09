import mongoose from "mongoose";
import type { Logger } from "../config/logger.js";

export async function connectDatabase(uri: string, logger: Logger): Promise<typeof mongoose> {
  mongoose.set("strictQuery", true);
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    // Indexes are created explicitly at startup via syncIndexes().
    autoIndex: false,
  });
  logger.info("MongoDB connected");
  return mongoose;
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
