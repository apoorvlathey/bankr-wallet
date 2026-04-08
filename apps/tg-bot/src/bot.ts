import { Bot, InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { users } from "./db/schema.js";
import { createVerificationToken } from "./services/verification.js";
import {
  getCombinedBalance,
  meetsThreshold,
  formatThreshold,
} from "./services/balance.js";
import { formatUnits } from "viem";
import { kickUser, sendKickDM } from "./services/group.js";

const isAdmin = (userId: number) => BigInt(userId) === config.ADMIN_TG_ID;
const isDM = (chatType: string) => chatType === "private";

export function createBot(): Bot {
  const bot = new Bot(config.BOT_TOKEN);

  // Admin-only group command — must be registered before the DM guard
  bot.command("chatid", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) return;
    const threadId = ctx.message?.message_thread_id;
    let text = `Chat ID: \`${ctx.chat.id}\``;
    if (threadId) {
      text += `\nTopic/Thread ID: \`${threadId}\``;
    }
    await ctx.reply(text, { parse_mode: "Markdown" });
  });

  // Admin-only: post a message (with any attachments) to the general channel
  bot.command("post", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) return;

    if (!ctx.message) return;

    if (!config.GENERAL_CHAT_ID) {
      await ctx.reply("GENERAL_CHAT_ID is not configured.");
      return;
    }

    // Must have either text (after /post) or an attachment (photo, video, etc.)
    const hasText = !!ctx.match;
    const hasAttachment =
      !!ctx.message.photo ||
      !!ctx.message.video ||
      !!ctx.message.document ||
      !!ctx.message.animation;

    if (!hasText && !hasAttachment) {
      await ctx.reply(
        "Usage: `/post <message>` — can include photos, videos, documents, or GIFs",
        { parse_mode: "Markdown" },
      );
      return;
    }

    // copyMessage sends the full message (text + media + formatting) without "Forwarded from"
    await bot.api.copyMessage(
      config.GENERAL_CHAT_ID,
      ctx.message.chat.id,
      ctx.message.message_id,
      {
        ...(config.GENERAL_THREAD_ID
          ? { message_thread_id: config.GENERAL_THREAD_ID }
          : {}),
      },
    );

    await ctx.reply("Posted.");
  });

  // Block all other commands in groups
  bot.use(async (ctx, next) => {
    if (ctx.chat && !isDM(ctx.chat.type) && !ctx.chatMember) return;
    await next();
  });

  // --- DM-only commands below ---

  bot.command("start", async (ctx) => {
    // Deep link: t.me/BotName?start=verify → auto-trigger /verify
    const payload = ctx.match;
    if (payload === "verify") {
      const tgId = BigInt(ctx.from!.id);
      const tgUsername = ctx.from!.username ?? undefined;
      const token = await createVerificationToken(tgId, tgUsername);
      const verifyUrl = `${config.VERIFY_URL}?token=${token}`;
      const keyboard = new InlineKeyboard().url("Verify Wallet", verifyUrl);

      await ctx.reply(
        `Click the button below to verify your wallet.\n\n` +
          `You'll need to:\n` +
          `1. Connect your wallet\n` +
          `2. Have at least ${formatThreshold()} sWCHAN staked\n` +
          `3. Sign a verification message\n\n` +
          `This link expires in 10 minutes.`,
        { reply_markup: keyboard },
      );
      return;
    }

    await ctx.reply(
      `Welcome to the WalletChan Token Gate Bot!\n\n` +
        `This bot manages access to the private WalletChan holders group.\n\n` +
        `You need at least ${formatThreshold()} sWCHAN staked to join.\n\n` +
        `Use /help to see available commands.`,
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `Available commands:\n\n` +
        `/verify — Link your wallet and get a group invite\n` +
        `/status — Check your wallet, balance, and eligibility\n` +
        `/help — Show this message`,
    );
  });

  bot.command("verify", async (ctx) => {
    const tgId = BigInt(ctx.from!.id);
    const tgUsername = ctx.from!.username ?? undefined;

    const token = await createVerificationToken(tgId, tgUsername);
    const verifyUrl = `${config.VERIFY_URL}?token=${token}`;

    const keyboard = new InlineKeyboard().url("Verify Wallet", verifyUrl);

    await ctx.reply(
      `Click the button below to verify your wallet.\n\n` +
        `You'll need to:\n` +
        `1. Connect your wallet\n` +
        `2. Have at least ${formatThreshold()} sWCHAN staked\n` +
        `3. Sign a verification message\n\n` +
        `This link expires in 10 minutes.`,
      { reply_markup: keyboard },
    );
  });

  bot.command("status", async (ctx) => {
    const tgId = BigInt(ctx.from!.id);

    const user = await db.query.users.findFirst({
      where: eq(users.tgId, tgId),
    });

    if (!user || !user.walletAddress) {
      await ctx.reply(
        `You haven't verified a wallet yet.\n\nUse /verify to get started.`,
      );
      return;
    }

    const balance = await getCombinedBalance(user.walletAddress);
    const eligible = meetsThreshold(balance);
    const formatted = formatUnits(balance, 18);
    const threshold = formatThreshold();

    await ctx.reply(
      `Wallet: \`${user.walletAddress}\`\n` +
        `Staked: ${parseFloat(formatted).toLocaleString()} sWCHAN\n` +
        `Threshold: ${threshold} sWCHAN\n` +
        `Eligible: ${eligible ? "Yes" : "No"}\n` +
        `Group Member: ${user.isMember ? "Yes" : "No"}`,
      { parse_mode: "Markdown" },
    );
  });

  // Track when users join/leave the private group
  // Kick unverified users who join directly (e.g. via leaked invite link)
  bot.on("chat_member", async (ctx) => {
    if (
      !config.PRIVATE_GROUP_ID ||
      ctx.chatMember.chat.id !== config.PRIVATE_GROUP_ID
    )
      return;

    const userId = BigInt(ctx.chatMember.new_chat_member.user.id);
    const status = ctx.chatMember.new_chat_member.status;
    const joined = status === "member" || status === "administrator";

    if (joined) {
      // Skip admin — never kick
      if (userId === config.ADMIN_TG_ID) return;

      // Check if user is verified
      const user = await db.query.users.findFirst({
        where: eq(users.tgId, userId),
      });

      if (!user || !user.walletAddress) {
        // Unverified — kick immediately
        console.log(
          `[ChatMember] Unverified user ${userId} joined, kicking...`,
        );
        await kickUser(bot, Number(userId));
        await sendKickDM(bot, Number(userId));
        return;
      }

      await db
        .update(users)
        .set({ isMember: true })
        .where(eq(users.tgId, userId));
    } else {
      await db
        .update(users)
        .set({ isMember: false })
        .where(eq(users.tgId, userId));
    }
  });

  // Register slash commands menu with Telegram
  bot.api.setMyCommands([
    {
      command: "verify",
      description: "Link your wallet and get a group invite",
    },
    { command: "status", description: "Check your verification status" },
    { command: "help", description: "Show available commands" },
  ]);

  return bot;
}
