import Discord from "discord.js";
import { UniqueConstraintError, Transaction } from "sequelize";
import type { QueueConfig } from "./actions/database/schemas/queueConfigSchema";
import type { QueueEntrySchema } from "./actions/database/schemas/queueEntrySchema";
import { DEFAULT_ENTRY_DURATION, DEFAULT_SUBMISSION_COOLDOWN } from "./constants/queues/configs";
import { useDatabase } from "./actions/database/useDatabase";
import { useLogger } from "./logger";

const logger = useLogger();

export interface QueueEntry {
  queueMessageId: string;
  url: string;
  seconds: number;
  sentAt: Date;
  senderId: string;
}
export type UnsentQueueEntry = Omit<QueueEntry, "queueMessageId">;

/**
 * Converts a `QueueEntrySchema` instance to a `QueueEntry`.
 * @param storedEntry Queue entry data from the database.
 * @returns A `QueueEntry` object.
 */
function toQueueEntry(storedEntry: QueueEntrySchema): QueueEntry {
  return {
    queueMessageId: storedEntry.queueMessageId,
    url: storedEntry.url,
    seconds: storedEntry.seconds,
    sentAt: storedEntry.sentAt,
    senderId: storedEntry.senderId
  };
}

export class DuplicateEntryTimeError extends Error {
  readonly entry: QueueEntry;

  constructor(entry: QueueEntry) {
    super("Duplicate entry. Try again.");
    this.entry = entry;
  }
}

interface QueueEntryManager {
  /** The channel for this queue. */
  queueChannel: Discord.Channel;

  /** Retrieves the queue's configuration settings. */
  getConfig: () => Promise<QueueConfig>;

  /** Updates the provided properties of a queue's configuration settings. */
  updateConfig: (config: Partial<QueueConfig>) => Promise<void>;

  /** Adds the queue entry to the database. */
  create: (entry: QueueEntry) => Promise<QueueEntry>;

  /** Removes the queue entry from the database. */
  remove: (entry: QueueEntry) => Promise<void>;

  /** Fetches all entries in queue order. */
  fetchAll: () => Promise<Array<QueueEntry>>;

  /** Fetches the number of entries in the queue. */
  countAll: () => Promise<number>;

  /** Fetches all entries by the given user in order of submission. */
  fetchAllFrom: (senderId: string) => Promise<Array<QueueEntry>>;

  /** Fetches the number of entries from the given user in the queue. */
  countAllFrom: (senderId: string) => Promise<number>;

  /** Delete all entries for this queue channel. */
  clear: () => Promise<void>;
}

export async function useQueueStorage(
  queueChannel: Discord.TextChannel
): Promise<QueueEntryManager> {
  const db = await useDatabase();

  async function getConfig(transaction?: Transaction): Promise<QueueConfig> {
    const config = await db.QueueConfigs.findOne({
      where: {
        channelId: queueChannel.id
      },
      transaction
    });
    return {
      entryDurationSeconds: config?.entryDurationSeconds ?? DEFAULT_ENTRY_DURATION,
      cooldownSeconds: config?.cooldownSeconds ?? DEFAULT_SUBMISSION_COOLDOWN
    };
  }

  return {
    queueChannel,
    getConfig,
    async updateConfig(config) {
      await db.sequelize.transaction(async transaction => {
        const oldConfig = await getConfig(transaction);
        let entryDurationSeconds: number | null;
        if (config.entryDurationSeconds === undefined) {
          entryDurationSeconds = oldConfig.entryDurationSeconds;
        } else {
          entryDurationSeconds = config.entryDurationSeconds;
        }
        let cooldownSeconds: number | null;
        if (config.cooldownSeconds === undefined) {
          cooldownSeconds = oldConfig.cooldownSeconds;
        } else {
          cooldownSeconds = config.cooldownSeconds;
        }
        await db.QueueConfigs.upsert(
          {
            channelId: queueChannel.id,
            entryDurationSeconds,
            cooldownSeconds
          },
          { transaction }
        );
      });
    },
    async create(entry) {
      try {
        await db.sequelize.transaction(async transaction => {
          // Make sure the guild and channels are in there
          await db.Guilds.upsert(
            {
              id: queueChannel.guild.id
            },
            { transaction }
          );
          await db.Channels.upsert(
            {
              id: queueChannel.id,
              guildId: queueChannel.guild.id
            },
            { transaction }
          );

          // Make sure we have at least the default config
          await db.QueueConfigs.findOrCreate({
            where: {
              channelId: queueChannel.id
            },
            defaults: {
              channelId: queueChannel.id,
              entryDurationSeconds: DEFAULT_ENTRY_DURATION,
              cooldownSeconds: DEFAULT_SUBMISSION_COOLDOWN
            },
            transaction
          });

          // Add the entry
          await db.QueueEntries.create(
            {
              queueMessageId: entry.queueMessageId,
              url: entry.url,
              seconds: entry.seconds,
              guildId: queueChannel.guild.id,
              channelId: queueChannel.id,
              senderId: entry.senderId,
              sentAt: entry.sentAt
            },
            { transaction }
          );
        });
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          // Wait half a second, set the date to now, then try again.
          logger.error(error);
          throw new DuplicateEntryTimeError(entry);
        }
        throw error;
      }

      return entry;
    },
    async remove(entry) {
      await db.QueueEntries.destroy({
        where: {
          channelId: queueChannel.id,
          guildId: queueChannel.guild.id,
          queueMessageId: entry.queueMessageId
        }
      });
    },
    async fetchAll() {
      const entries = await db.QueueEntries.findAll({
        where: {
          channelId: queueChannel.id,
          guildId: queueChannel.guild.id
        }
      });
      return entries.map(toQueueEntry);
    },
    countAll() {
      return db.QueueEntries.count({
        where: {
          channelId: queueChannel.id,
          guildId: queueChannel.guild.id
        }
      });
    },
    async fetchAllFrom(senderId) {
      const entries = await db.QueueEntries.findAll({
        where: {
          channelId: queueChannel.id,
          guildId: queueChannel.guild.id,
          senderId
        }
      });
      return entries.map(toQueueEntry);
    },
    countAllFrom(senderId) {
      return db.QueueEntries.count({
        where: {
          channelId: queueChannel.id,
          guildId: queueChannel.guild.id,
          senderId
        }
      });
    },
    async clear() {
      await db.QueueEntries.destroy({
        where: {
          channelId: queueChannel.id,
          guildId: queueChannel.guild.id
        }
      });
    }
  };
}
