import type { MessageReaction, User } from "discord.js";
import { messageReactionAdd } from "./messageReactionAdd.js";
import { useTestLogger } from "../../tests/testUtils/logger.js";
const logger = useTestLogger();

describe("Reaction duplication", () => {
	const mockResendReact = jest.fn<Promise<unknown>, []>();

	let mockRandom: jest.SpyInstance<number, []>;
	let mockReaction: MessageReaction;
	let mockSender: User;

	beforeEach(() => {
		mockRandom = jest.spyOn(global.Math, "random").mockReturnValue(1);

		mockReaction = {
			me: false,
			client: {
				user: {
					id: "itz-meeee"
				}
			},
			message: {
				author: {
					id: "other-user"
				}
			},
			emoji: {
				name: "blue_square"
			},
			count: 1,
			react: mockResendReact,
			fetch: () => Promise.resolve(mockReaction)
		} as unknown as MessageReaction;

		mockSender = {
			bot: false,
			fetch: () => Promise.resolve(mockSender)
		} as unknown as User;
	});

	afterEach(() => {
		mockRandom.mockRestore();
	});

	test("sometimes ignores a user's react", async () => {
		mockRandom.mockReturnValue(0.5);
		await expect(
			messageReactionAdd.execute(mockReaction, mockSender, logger)
		).resolves.toBeUndefined();
		expect(mockResendReact).not.toHaveBeenCalled();
	});

	test("ignores emoji with an empty name", async () => {
		mockReaction.emoji.name = "";
		await expect(
			messageReactionAdd.execute(mockReaction, mockSender, logger)
		).resolves.toBeUndefined();
		expect(mockResendReact).not.toHaveBeenCalled();
	});

	test("ignores emoji with a null name", async () => {
		mockReaction.emoji.name = null;
		await expect(
			messageReactionAdd.execute(mockReaction, mockSender, logger)
		).resolves.toBeUndefined();
		expect(mockResendReact).not.toHaveBeenCalled();
	});

	test("ignores bot reacts", async () => {
		mockSender.bot = true;
		await expect(
			messageReactionAdd.execute(mockReaction, mockSender, logger)
		).resolves.toBeUndefined();
		expect(mockResendReact).not.toHaveBeenCalled();
	});

	test("ignores the bot's own reacts", async () => {
		mockReaction.me = true;
		await expect(
			messageReactionAdd.execute(mockReaction, mockSender, logger)
		).resolves.toBeUndefined();
		expect(mockResendReact).not.toHaveBeenCalled();
	});

	test("ignores :star:", async () => {
		mockReaction.emoji.name = "⭐";
		await expect(
			messageReactionAdd.execute(mockReaction, mockSender, logger)
		).resolves.toBeUndefined();
		expect(mockResendReact).not.toHaveBeenCalled();
	});
});
