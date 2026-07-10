import { MongoClient } from "mongodb";

const MONGODB_URI =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/?directConnection=true";
const DB_NAME = process.env.MONGODB_DB ?? "toeic_vocab";

let client: MongoClient | null = null;

export async function getClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
  }
  return client;
}

export async function getDb() {
  const c = await getClient();
  return c.db(DB_NAME);
}
