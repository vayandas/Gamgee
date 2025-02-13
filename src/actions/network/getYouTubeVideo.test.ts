import type { videoInfo, getInfoOptions } from "ytdl-core";
import { expectDefined, expectValueEqual } from "../../../tests/testUtils/expectations/jest.js";
import { InvalidYouTubeUrlError, UnavailableError } from "../../errors/index.js";
import { URL } from "node:url";

// Mock ytdl
jest.mock("ytdl-core", () => ({
	validateURL: jest.requireActual<typeof import("ytdl-core")>("ytdl-core").validateURL,
	getBasicInfo: jest.fn()
}));
import { getBasicInfo } from "ytdl-core";
const mockGetBasicInfo = getBasicInfo as jest.Mock<
	Promise<videoInfo>,
	[url: string, options?: getInfoOptions]
>;

// Import the unit under test
import { getYouTubeVideo } from "./getYouTubeVideo.js";

describe("YouTube track details", () => {
	beforeEach(() => {
		mockGetBasicInfo.mockRejectedValue(new Error("Please mock a response."));
	});

	test.each`
		id               | url
		${"9Y8ZGLiqXba"} | ${"https://youtu.be/9Y8ZGLiqXba"}
		${"dmneTS-Gows"} | ${"https://www.youtube.com/watch?v=dmneTS-Gows"}
	`("throws with unavailable video ($id)", async ({ url }: { url: string }) => {
		const error = new UnavailableError(new URL(url));
		mockGetBasicInfo.mockRejectedValue(error);
		await expect(() => getYouTubeVideo(new URL(url))).rejects.toThrow(error);
	});

	test.each`
		desc                | url                                                                            | error
		${"SoundCloud URL"} | ${"https://soundcloud.com/sparkeemusic/deadmau5-strobe-sparkee-nudisco-remix"} | ${InvalidYouTubeUrlError}
		${"too-short URL"}  | ${"https://www.youtube.com/watch?v=9Y8ZGL"}                                    | ${InvalidYouTubeUrlError}
	`("throws with $desc", async ({ url, error }: { url: string; error: typeof Error }) => {
		// should throw due to a local check, shouldn't have to mock the network response here
		await expect(() => getYouTubeVideo(new URL(url))).rejects.toThrow(error);
	});

	const url = "https://www.youtube.com/watch?v=9Y8ZGLiqXB8";

	test.each`
		desc                                      | url                                                                                                                    | result                                           | duration
		${"is already good"}                      | ${"https://youtube.com/watch?v=9RAQsdTQIcs"}                                                                           | ${"https://www.youtube.com/watch?v=9RAQsdTQIcs"} | ${174}
		${"is for mobile"}                        | ${"https://m.youtube.com/watch?v=9Y8ZGLiqXB8"}                                                                         | ${url}                                           | ${346}
		${"is shortened"}                         | ${"https://youtu.be/9Y8ZGLiqXB8"}                                                                                      | ${url}                                           | ${346}
		${"has extra info"}                       | ${"https://youtu.be/9Y8ZGLiqXB8 Text and stuff"}                                                                       | ${url}                                           | ${346}
		${"spams repeat characters"}              | ${"https://youtu.be/9Y8ZGLiqXB8!!!!!!!!!!!!!!!!!!!!!!!!!!!!"}                                                          | ${url}                                           | ${346}
		${"spams random characters"}              | ${"https://youtu.be/9Y8ZGLiqXB8kdasu997ru53"}                                                                          | ${url}                                           | ${346}
		${"is a playlist"}                        | ${"https://www.youtube.com/watch?v=2rzoPFLRhqE&list=RDMM&start_radio=1&ab_channel=LucaStricagnoli"}                    | ${"https://www.youtube.com/watch?v=2rzoPFLRhqE"} | ${225}
		${"has channel info"}                     | ${"https://www.youtube.com/watch?v=nY1WVAoMnYc&ab_channel=JonathanYoung"}                                              | ${"https://www.youtube.com/watch?v=nY1WVAoMnYc"} | ${216}
		${"has time codes"}                       | ${"https://www.youtube.com/watch?v=NFw-FrYmAEw&t=10s"}                                                                 | ${"https://www.youtube.com/watch?v=NFw-FrYmAEw"} | ${1980}
		${"is shortened w/ unicode title"}        | ${"https://youtu.be/GgwUenaQqlM"}                                                                                      | ${"https://www.youtube.com/watch?v=GgwUenaQqlM"} | ${267}
		${"is a playlist entry w/ unicode title"} | ${"https://www.youtube.com/watch?v=GgwUenaQqlM&list=PLOKsOCrQbr0OCj6faA0kck1LwhQW-aj63&index=5"}                       | ${"https://www.youtube.com/watch?v=GgwUenaQqlM"} | ${267}
		${"has extra info w/ unicode title"}      | ${"https://www.youtube.com/watch?v=GgwUenaQqlM&ab_channel=TOHOanimation%E3%83%81%E3%83%A3%E3%83%B3%E3%83%8D%E3%83%AB"} | ${"https://www.youtube.com/watch?v=GgwUenaQqlM"} | ${267}
		${"is a short livestream VOD"}            | ${"https://youtu.be/5XbLY7IIqkY"}                                                                                      | ${"https://www.youtube.com/watch?v=5XbLY7IIqkY"} | ${426}
	`(
		"returns info for a YouTube link that $desc, $duration seconds long",
		async ({ url, result, duration }: { url: string; result: string; duration: number }) => {
			// These links *should* work on real YouTube, but we shouldn't hit the network while testing
			mockGetBasicInfo.mockResolvedValue({
				videoDetails: {
					availableCountries: [
						/* ... */ "US" /* ... */ // truncated for testing purposes
					],
					lengthSeconds: `${duration}`,
					isLiveContent: true,
					video_url: result,
					title: "sample"
				}
			} as unknown as videoInfo);

			const details = await getYouTubeVideo(new URL(url));
			expectValueEqual(details.url, result);
			expectDefined(details.duration.seconds);
			expectValueEqual(details.duration.seconds, duration);
		}
	);

	test("returns infinite duration for a livestream", async () => {
		// lofi hip hop radio - beats to relax/study to
		const url = "https://www.youtube.com/watch?v=jfKfPfyJRdk";
		mockGetBasicInfo.mockResolvedValue({
			videoDetails: {
				availableCountries: [
					/* ... */ "US" /* ... */ // truncated for testing purposes
				],
				lengthSeconds: "0",
				isLiveContent: true,
				video_url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
				title: "lofi hip hop radio - beats to relax/study to"
			}
		} as unknown as videoInfo);

		const details = await getYouTubeVideo(new URL(url));
		expectValueEqual(details.url, url);
		expectDefined(details.duration.seconds);
		expectValueEqual(details.duration.seconds, Number.POSITIVE_INFINITY);
	});
});
