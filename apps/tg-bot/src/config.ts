import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  INDEXER_API_URL: z.string().url().default("http://localhost:42070"),
  WCHAN_VAULT_INDEXER_API_URL: z.string().url().default("http://localhost:42072"),
  KICK_GRACE_PERIOD_MINUTES: z.coerce.number().int().default(60),
  PRIVATE_GROUP_ID: z.coerce.number().int().optional(),
  MIN_STAKE_THRESHOLD: z.string().default("1000000000000000000000"), // 1000 sBNKRW
  VERIFY_URL: z.string().url().default("https://walletchan.com/verify"),
  STAKE_URL: z.string().url().default("https://stake.walletchan.com"),
  ADMIN_TG_ID: z.coerce.bigint(),
  PORT: z.coerce.number().int().default(3001),
  COINS_INDEXER_API_URL: z.string().url().default("http://localhost:42069"),
  COIN_ANNOUNCE_CHAT_ID: z.coerce.number().int().optional(),
  COIN_ANNOUNCE_THREAD_ID: z.coerce.number().int().optional(),
  PINATA_GATEWAY_URL: z.string().url().optional(),
  PINATA_GATEWAY_TOKEN: z.string().optional(),
  BASE_RPC_URL: z.string().url().optional(),
  GENERAL_CHAT_ID: z.coerce.number().int().optional(),
  GENERAL_THREAD_ID: z.coerce.number().int().optional(),
});

export const config = envSchema.parse(process.env);

export type Config = z.infer<typeof envSchema>;
