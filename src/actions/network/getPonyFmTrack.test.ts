import { expectDefined, expectValueEqual } from "../../../tests/testUtils/expectations/jest.js";
import { Response } from "cross-fetch";
import { URL } from "node:url";
import { VideoError } from "../../errors/VideoError.js";

// Mock fetch
jest.mock("../../helpers/fetch.js", () => ({ fetchWithTimeout: jest.fn() }));
import { fetchWithTimeout } from "../../helpers/fetch.js";
const mockFetchWithTimeout = fetchWithTimeout as jest.Mock<
	Promise<Response>,
	[
		input: RequestInfo | globalThis.URL,
		timeoutSeconds?: number,
		init?: Omit<RequestInit | undefined, "signal">
	]
>;

// Import the unit under test
import { getPonyFmTrack } from "./getPonyFmTrack.js";

describe("Pony.FM track details", () => {
	beforeEach(() => {
		mockFetchWithTimeout.mockRejectedValue(new Error("Please mock a response."));
	});

	test.each`
		desc                         | url
		${"album link"}              | ${"https://pony.fm/albums/4761-heroes-the-label-compilation"}
		${"artist page"}             | ${"https://pony.fm/skyshard"}
		${"playlist"}                | ${"https://pony.fm/playlist/566-all-violin-melodys-original-mixes-remixes"}
		${"about page"}              | ${"https://pony.fm/about"}
		${"tracks page"}             | ${"https://pony.fm/tracks/"}
		${"invalid track"}           | ${"https://pony.fm/tracks/54321"}
		${"invalid track shortlink"} | ${"https://pony.fm/t54321"}
	`("throws with Pony.fm $desc", async ({ url }: { desc: string; url: string }) => {
		const error = new VideoError(`Malformed response from Pony.fm API`); // TODO: i18n?
		mockFetchWithTimeout.mockRejectedValue(error);

		await expect(() => getPonyFmTrack(new URL(url))).rejects.toThrow(VideoError);
	});

	const test1 =
		"https://pony.fm/tracks/46025-beneath-the-sea-ft-lectro-dub-studio-quinn-liv-learn-zelizine";
	test.each`
		desc                      | url
		${"long link"}            | ${test1}
		${"incomplete long link"} | ${"https://pony.fm/tracks/46025-beneath-the-sea-ft-"}
		${"short link"}           | ${"https://pony.fm/t46025"}
	`("returns correct length for $desc of Pony.fm track", async ({ url }: { url: string }) => {
		const duration = 385;
		mockFetchWithTimeout.mockResolvedValue(
			new Response(
				JSON.stringify({
					title: "sample",
					duration: `${duration}`,
					url: test1
				})
			)
		);

		const details = await getPonyFmTrack(new URL(url));
		expectValueEqual(
			details.url,
			"https://pony.fm/tracks/46025-beneath-the-sea-ft-lectro-dub-studio-quinn-liv-learn-zelizine"
		);
		expectDefined(details.duration.seconds);
		expectValueEqual(details.duration.seconds, duration);
	});
});
