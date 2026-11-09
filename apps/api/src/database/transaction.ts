import mongoose, { type ClientSession } from "mongoose";

/**
 * Runs `fn` inside a MongoDB transaction. The driver's withTransaction retries the
 * callback on TransientTransactionError (e.g. write conflicts from concurrent
 * requests) and retries commit on UnknownTransactionCommitResult.
 * Requires a replica set (MongoDB Atlas always is one).
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
