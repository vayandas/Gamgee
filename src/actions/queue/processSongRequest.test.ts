import "../../../tests/testUtils/leakedHandles.js";

jest.mock("../../actions/messages/index.js");
jest.mock("../getVideoDetails.js");
jest.mock("./useQueue.js");
jest.mock("../../useGuildStorage.js");
jest.mock("../../useQueueStorage.js");

// ** Gather mockable actions

import { deleteMessage } from "../../actions/messages/index.js";
const mockDeleteMessage = deleteMessage as jest.Mock<Promise<boolean>>;

import type { VideoDetails } from "../getVideoDetails.js";
import { getVideoDetails } from "../getVideoDetails.js";
const mockGetVideoDetails = getVideoDetails as jest.Mock<Promise<VideoDetails | null>>;

import type { Guild, Message, TextChannel } from "discord.js";
import { playtimeTotalInQueue, pushEntryToQueue } from "./useQueue.js";
const mockPlaytimeTotalInQueue = playtimeTotalInQueue as jest.Mock<Promise<number>>;
const mockPushEntryToQueue = pushEntryToQueue as jest.Mock<
	Promise<QueueEntry>,
	[UnsentQueueEntry, TextChannel]
>;

import { isQueueOpen, setQueueOpen } from "../../useGuildStorage.js";
const mockIsQueueOpen = isQueueOpen as jest.Mock<Promise<boolean>, [Guild]>;
const mockSetQueueOpen = setQueueOpen as jest.Mock<Promise<void>, [boolean, Guild]>;

import {
	countAllStoredEntriesFromSender,
	getLatestStoredEntryFromSender,
	getStoredQueueConfig
} from "../../useQueueStorage.js";
import type { QueueConfig, QueueEntry, UnsentQueueEntry } from "../../useQueueStorage.js";
const mockCountAllStoredEntriesFromSender = countAllStoredEntriesFromSender as jest.Mock<
	Promise<number>
>;
const mockGetLatestStoredEntryFromSender = getLatestStoredEntryFromSender as jest.Mock<
	Promise<QueueEntry | null>
>;
const mockGetStoredQueueConfig = getStoredQueueConfig as jest.Mock<Promise<QueueConfig>>;

const mockDeleteInvocation = jest.fn();
const mockReplyPrivately = jest.fn();
const mockFollowUp = jest.fn();

const mockChannelSend = jest.fn() as jest.Mock<Promise<unknown>, [string]>;

// ** Import the unit-under-test

import type { CommandContext, MessageCommandContext } from "../../commands/CommandContext.js";
import type { SongRequest } from "./processSongRequest.js";
import { processSongRequest } from "./processSongRequest.js";
import { URL } from "node:url";
import { useTestLogger } from "../../../tests/testUtils/logger.js";

describe("Song request pipeline", () => {
	let config: QueueConfig;
	let context: CommandContext;
	let request: SongRequest;
	let newEntry: QueueEntry;

	beforeEach(() => {
		// ** Reset mocks for each run

		const GUILD_ID = "the-guild-1234";
		const QUEUE_CHANNEL_ID = "queue-channel-1234";

		config = {
			blacklistedUsers: [],
			channelId: QUEUE_CHANNEL_ID,
			cooldownSeconds: null,
			entryDurationMaxSeconds: null,
			entryDurationMinSeconds: null,
			queueDurationSeconds: null,
			submissionMaxQuantity: null
		};

		context = {
			type: "message",
			deleteInvocation: mockDeleteInvocation,
			replyPrivately: mockReplyPrivately,
			followUp: mockFollowUp,
			message: {
				id: "some-message-1234",
				content: "This is a message object. Trust me, bro"
			},
			user: {
				id: "the-user"
			}
		} as unknown as CommandContext;

		request = {
			context,
			logger: useTestLogger(),
			publicPreemptiveResponse: null,
			queueChannel: {
				id: QUEUE_CHANNEL_ID,
				guild: {
					id: GUILD_ID
				} as unknown as Guild,
				send: mockChannelSend
			} as unknown as TextChannel,
			songUrl: new URL("https://localhost:9999/")
		};

		newEntry = {
			channelId: QUEUE_CHANNEL_ID,
			guildId: GUILD_ID,
			haveCalledNowPlaying: [],
			isDone: false,
			queueMessageId: "the-queue-message-1234",
			seconds: 1,
			senderId: context.user.id,
			sentAt: new Date(),
			url: request.songUrl.href
		};

		mockDeleteMessage.mockResolvedValue(true);
		mockGetVideoDetails.mockResolvedValue(null);
		mockPlaytimeTotalInQueue.mockResolvedValue(0);
		mockPushEntryToQueue.mockResolvedValue(newEntry);
		mockIsQueueOpen.mockResolvedValue(true);
		mockSetQueueOpen.mockResolvedValue(undefined);
		mockCountAllStoredEntriesFromSender.mockResolvedValue(0);
		mockGetLatestStoredEntryFromSender.mockResolvedValue(null);
		mockGetStoredQueueConfig.mockResolvedValue(config);
		mockDeleteInvocation.mockResolvedValue(undefined);
		mockReplyPrivately.mockResolvedValue(undefined);
		mockFollowUp.mockResolvedValue(undefined);
		mockChannelSend.mockResolvedValue(undefined);
	});

	test("(message) rejects the request if the entry is longer than the queue's configured max entry length", async () => {
		// mock the queue's duration max
		config.entryDurationMaxSeconds = 10;
		mockGetStoredQueueConfig.mockResolvedValue(config);

		// mock the video getter for a long song
		const entrySeconds = 100;
		mockGetVideoDetails.mockResolvedValue({
			title: "Long Song",
			duration: { seconds: entrySeconds },
			url: newEntry.url
		});

		await expect(processSongRequest(request)).resolves.toBeUndefined();

		expect(mockDeleteMessage).toHaveBeenCalledOnce();
		expect(mockDeleteMessage).toHaveBeenCalledWith((context as MessageCommandContext).message);
	});

	test("(interaction) rejects the request if the entry is longer than the queue's configured max entry length", async () => {
		// mock the queue's duration max
		config.entryDurationMaxSeconds = 10;
		mockGetStoredQueueConfig.mockResolvedValue(config);

		// mock the video getter for a long song
		const entrySeconds = 100;
		mockGetVideoDetails.mockResolvedValue({
			title: "Long Song",
			duration: { seconds: entrySeconds },
			url: newEntry.url
		});

		context = { ...context, type: "interaction" } as unknown as CommandContext;
		request.context = context;
		request.publicPreemptiveResponse = { id: "a-message" } as unknown as Message;
		await expect(processSongRequest(request)).resolves.toBeUndefined();

		expect(mockDeleteMessage).toHaveBeenCalledOnce();
		expect(mockDeleteMessage).toHaveBeenCalledWith(request.publicPreemptiveResponse);
	});

	test("closes the queue automatically just as entries exceed queue-length limits", async () => {
		// mock the queue limits to disable cooldown, enable long submissions, enable queue cap
		config.queueDurationSeconds = 250;
		mockGetStoredQueueConfig.mockResolvedValue(config);

		// mock the video getter to consider any URL to be really long
		const entrySeconds = 100; // 3 of these should fill the queue
		mockGetVideoDetails.mockResolvedValue({
			title: "Long Song",
			duration: { seconds: entrySeconds },
			url: newEntry.url
		});

		// mock the queue closer so it behaves as tho the unit closed the queue appropriately
		let isQueueOpen = true;
		mockSetQueueOpen.mockImplementation(async toBeOpen => {
			isQueueOpen = toBeOpen;
			mockIsQueueOpen.mockResolvedValue(isQueueOpen);
			return await Promise.resolve(undefined);
		});

		// mock the queue appender so it tracks entry durations
		let queueDuration = 0;
		mockPushEntryToQueue.mockImplementation(async entry => {
			queueDuration += entry.seconds;
			mockPlaytimeTotalInQueue.mockResolvedValue(queueDuration);
			return await Promise.resolve(newEntry);
		});

		// These should fit, then close the queue
		await expect(processSongRequest(request)).resolves.toBeUndefined();
		await expect(processSongRequest(request)).resolves.toBeUndefined();
		await expect(processSongRequest(request)).resolves.toBeUndefined();

		expect(mockReplyPrivately).not.toHaveBeenCalled(); // no rejections yet

		// These should not fit now that the queue is closed
		await expect(processSongRequest(request)).resolves.toBeUndefined();
		await expect(processSongRequest(request)).resolves.toBeUndefined();

		// expect the queue close command to have been fired, and only 3 entries pushed
		expect(mockPushEntryToQueue).toHaveBeenCalledTimes(3); // 3 successful pushes
		expect(mockSetQueueOpen).toHaveBeenCalledOnce(); // 1 queue closure
		expect(mockSetQueueOpen).toHaveBeenCalledWith(false, request.queueChannel.guild);
		expect(mockReplyPrivately).toHaveBeenCalledTimes(2); // 2 rejections
	});
});
