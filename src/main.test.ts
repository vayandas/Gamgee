// Mock the client to track constructor and 'login' calls
const mockConstructClient = jest.fn();
const mockLogin = jest.fn();
class MockClient {
	login = mockLogin;

	constructor(...args: Array<unknown>) {
		mockConstructClient(...args);
	}
}

const Discord = jest.requireActual<typeof import("discord.js")>("discord.js");
jest.mock("discord.js", () => ({
	...Discord,
	Client: MockClient
}));

// Don't test against the production token
const mockToken = "TEST_TOKEN";
process.env["DISCORD_TOKEN"] = mockToken;

// Mock the event handler index so we can track it
jest.mock("./events");
import { registerEventHandlers } from "./events/index.js";
const mockRegisterEventHandlers = registerEventHandlers as jest.Mock;

// Mock the logger to track output
import type { Logger } from "./logger.js";
const mockLoggerError = jest.fn();
const mockLogger = {
	error: mockLoggerError
} as unknown as Logger;

// Import the unit under test
import { _main } from "./main";

// A basic error to test with
const loginError = new Error("Failed to log in. This is a test.");

describe("main", () => {
	beforeEach(() => {
		mockConstructClient.mockReturnValue(undefined);
		mockLogin.mockResolvedValue(mockToken);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test("disables @everyone pings", async () => {
		await expect(_main(mockLogger)).resolves.toBeUndefined();
		expect(mockConstructClient).toHaveBeenCalledWith(
			expect.objectContaining({
				allowedMentions: {
					parse: ["roles", "users"],
					repliedUser: true
				}
			})
		);
	});

	test("calls registerEventHandlers", async () => {
		await expect(_main(mockLogger)).resolves.toBeUndefined();
		expect(mockRegisterEventHandlers).toHaveBeenCalledWith(new MockClient());
	});

	test("calls login", async () => {
		await expect(_main(mockLogger)).resolves.toBeUndefined();
		expect(mockLogin).toHaveBeenCalledWith(mockToken);
	});

	test("reports login errors", async () => {
		mockLogin.mockRejectedValueOnce(loginError);
		await expect(_main(mockLogger)).resolves.toBeUndefined();
		expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining("log in"));
	});
});
