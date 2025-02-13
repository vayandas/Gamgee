import { channelMention, userMention } from "discord.js";
import { expectNull, expectToContain, expectValueEqual } from "./testUtils/expectations/chai";
import {
	requireEnv,
	setIsQueueAdmin,
	setIsQueueCreator,
	commandResponseInTestChannel,
	sendCommand,
	waitForMessage,
	sendMessageWithDefaultClient,
	sendCommandWithDefaultClient,
	useTesterClient
} from "./discordUtils";

const UUT_ID = requireEnv("BOT_TEST_ID");
const QUEUE_CHANNEL_ID = requireEnv("QUEUE_CHANNEL_ID");

const QUEUE_COMMAND = "quo";

describe("Command as admin", function () {
	const url = "https://youtu.be/dQw4w9WgXcQ";
	const NO_QUEUE = "no queue";
	const NEW_QUEUE = "New queue";

	beforeEach(async function () {
		const title = this.test?.fullTitle();
		await sendMessageWithDefaultClient(`**'${title ?? "null"}'**`);

		await setIsQueueCreator(true);
		await commandResponseInTestChannel(`${QUEUE_COMMAND} teardown`, "deleted");

		// Add the Queue Admin role to the tester bot
		await setIsQueueCreator(false);
		await setIsQueueAdmin(true);
	});

	describe("unknown input", function () {
		it("does nothing", async function () {
			const content = await commandResponseInTestChannel("dunno what this does");
			expectNull(content);
		});
	});

	describe("queue", function () {
		describe("when the queue is set up", function () {
			beforeEach(async function () {
				await setIsQueueCreator(true);
				await commandResponseInTestChannel(
					`${QUEUE_COMMAND} setup ${channelMention(QUEUE_CHANNEL_ID)}`,
					NEW_QUEUE
				);
				await commandResponseInTestChannel(
					`${QUEUE_COMMAND} whitelist ${userMention(UUT_ID)}`,
					"is allowed"
				);
			});

			{
				const keys = [
					"entry-duration-max", //
					"cooldown",
					"count"
				];
				for (const key of keys) {
					it(`allows the tester to set ${key} limits on the queue`, async function () {
						const content = await commandResponseInTestChannel(`${QUEUE_COMMAND} limit ${key} 3`);
						expectToContain(content?.toLowerCase(), `set to **3`);
					});
				}
			}

			it("can manage the blacklist", async function () {
				// read blacklist, should be empty
				const firstCheck = await commandResponseInTestChannel(
					`${QUEUE_COMMAND} blacklist`,
					"Song Request Blacklist for"
				);
				expectToContain(firstCheck, "Nobody");

				// add to blacklist
				const firstAdd = await commandResponseInTestChannel(
					`${QUEUE_COMMAND} blacklist ${userMention(UUT_ID)}`,
					"is no longer allowed"
				);
				expectToContain(firstAdd, `<@!${UUT_ID}> is no longer allowed`);

				// read blacklist, should contain user
				const secondCheck = await commandResponseInTestChannel(
					`${QUEUE_COMMAND} blacklist`,
					"Song Request Blacklist for"
				);
				expectToContain(secondCheck, userMention(UUT_ID));

				// add to blacklist again, should have no duplicates
				const secondAdd = await commandResponseInTestChannel(
					`${QUEUE_COMMAND} blacklist ${userMention(UUT_ID)}`,
					"is no longer allowed"
				);
				expectToContain(secondAdd, `<@!${UUT_ID}> is no longer allowed`);

				const thirdCheck = await commandResponseInTestChannel(
					`${QUEUE_COMMAND} blacklist`,
					"Song Request Blacklist for"
				);
				expectToContain(
					thirdCheck,
					userMention(UUT_ID) // TODO: Make sure this is the only match
				);

				// remove from blacklist
				const remove = await commandResponseInTestChannel(
					`${QUEUE_COMMAND} whitelist ${userMention(UUT_ID)}`,
					"is allowed"
				);
				expectToContain(remove, `<@!${UUT_ID}> is allowed`);

				// read blacklist, should be empty again
				const fourthCheck = await commandResponseInTestChannel(
					`${QUEUE_COMMAND} blacklist`,
					"Song Request Blacklist for"
				);
				expectToContain(fourthCheck, "Nobody");
			});

			it("removes a user from the blacklist when the blacklist was already empty", async function () {
				const expected = "is allowed to submit song requests";
				const content = await commandResponseInTestChannel(
					`${QUEUE_COMMAND} whitelist ${userMention(UUT_ID)}`,
					expected
				);
				expectToContain(content, expected);
			});
		});

		describe("when the queue is not set up", function () {
			const NO_QUEUE = "no queue";

			it("url request does nothing", async function () {
				const content = await commandResponseInTestChannel(`sr ${url}`, NO_QUEUE);
				expectToContain(content?.toLowerCase(), NO_QUEUE);
			});

			it("url request with embed hidden does nothing", async function () {
				const content = await commandResponseInTestChannel(`sr <${url}>`, NO_QUEUE);
				expectToContain(content?.toLowerCase(), NO_QUEUE);
			});
		});

		describe("no queue yet", function () {
			beforeEach(async function () {
				await sendMessageWithDefaultClient(`**Setup**`);
				await setIsQueueCreator(true);
				await setIsQueueAdmin(true);

				await commandResponseInTestChannel(`${QUEUE_COMMAND} teardown`, "deleted");

				await setIsQueueCreator(false);
				await sendMessageWithDefaultClient(`**Run**`);
			});

			it("fails to set up a queue without a channel mention", async function () {
				await setIsQueueCreator(true);
				await useTesterClient(async client => {
					const cmdMessage = await sendCommand(client, `${QUEUE_COMMAND} setup`);
					const response = await waitForMessage(
						msg => msg.author.id === UUT_ID && msg.channel.id === cmdMessage.channel.id
					);
					expectToContain(response?.content, "name a text channel");
				});
			});

			{
				const keys = [
					"entry-duration-max", //
					"cooldown",
					"count"
				];
				for (const key of keys) {
					it(`fails to set ${key} limits on the queue`, async function () {
						const content = await commandResponseInTestChannel(`${QUEUE_COMMAND} limit ${key} 3`);
						expectToContain(content?.toLowerCase(), NO_QUEUE);
					});
				}
			}

			{
				const keys = [
					"entry-duration-max", //
					"cooldown",
					"count"
				];
				for (const key of keys) {
					it(`allows the tester to get the queue's global ${key} limit`, async function () {
						const content = await commandResponseInTestChannel(`${QUEUE_COMMAND} limit ${key}`);
						expectToContain(content?.toLowerCase(), NO_QUEUE);
					});
				}
			}

			it("allows the tester to set up a queue", async function () {
				await setIsQueueCreator(true);
				await sendCommandWithDefaultClient(
					`${QUEUE_COMMAND} setup ${channelMention(QUEUE_CHANNEL_ID)}`
				);
				const response = await waitForMessage(
					msg => msg.author.id === UUT_ID && msg.channel.id === QUEUE_CHANNEL_ID
				);
				expectToContain(response?.content, "This is a queue now.");
			});
		});
	});

	describe("video", function () {
		const info = `Rick Astley - Never Gonna Give You Up (Official Music Video): (3 minutes, 33 seconds)`;
		const needSongLink = `You're gonna have to add a song link to that.`;

		it("asks for a song link", async function () {
			const content = await commandResponseInTestChannel("video", needSongLink);
			expectValueEqual(content, needSongLink);
		});

		it("returns the title and duration of a song with normal spacing", async function () {
			const content = await commandResponseInTestChannel(`video ${url}`, info);
			expectValueEqual(content, info);
		});

		it("returns the title and duration of a song with suboptimal spacing", async function () {
			const content = await commandResponseInTestChannel(`video             ${url}`, info);
			expectValueEqual(content, info);
		});

		it("returns the title and duration of a song with embed hidden", async function () {
			const content = await commandResponseInTestChannel(`video <${url}>`, info);
			expectValueEqual(content, info);
		});
	});
});
