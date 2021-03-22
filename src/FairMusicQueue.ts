import AsyncLock from "async-lock";
import { useLogger } from "./logger";

const lock = new AsyncLock();
const logger = useLogger();

/**
 *
 * @author caucow
 */
export class FairMusicQueueTest {
  // main runner method to test the fair queue concept
  static async main(): Promise<void> {
    //////// Just A Buncha Test Code ////////

    const queueManager = new FairMusicQueueTest();
    // Generate 4-8 users
    const numberOfTestUsers = Math.floor(Math.random() * 5 + 4);
    let submissionNumber = 0; // just to generate "unique" """submissions"""
    // More convenient to start at a high number and work towards zero for
    // testing fake user ids, so for this test, higher user IDs will try to
    // queue their songs first.
    for (let uNum = 0; uNum < numberOfTestUsers; uNum++) {
      // create fake discord user id, easy to recognize in the test output
      const userId = uNum * 1111;

      // Generate 2-4 submissions per user
      const numberOfTestSongs = Math.floor(Math.random() * 3 + 2);
      for (let i = 0; i < numberOfTestSongs; i++) {
        // proper implementation could return some kind of result to
        // pass on to the user, boolean here just for simplicity/testing
        await queueManager.trySubmission(
          userId,
          `https://TotallyAMusic.com/music/${userId}/${submissionNumber}`,
          Math.floor(Math.random() * 121 + 90)
        );
        submissionNumber += 1;
      }
    }

    // For debug, print out all the users currently in the queue and
    // all their submissions.
    logger.info("");
    logger.info("Printing master queue + local queues");
    for (const sub of queueManager.masterQueue) {
      logger.info(sub.userId);
      for (const music of sub.localQueue) {
        logger.info("    " + music.link);
      }
    }
    logger.info("End of master queue");
    logger.info("");

    let next: Submission | null = null;
    // Loop through submission queue until no submissions left.
    let countdownToNewbieJoining = 5;
    while (queueManager.pollNextSubmission() !== null) {
      next = await queueManager.pollNextSubmission();
      logger.info(
        `Playing submission: Link: ${next?.link ?? "null"} - Time: ${(
          (next?.secondsLong ?? 0) / 60
        ).toFixed(2)}:${((next?.secondsLong ?? 0) % 60).toFixed(2)}`
      );
      countdownToNewbieJoining -= 1;
      if (countdownToNewbieJoining === 0) {
        logger.info("");
        logger.info("Adding 'late join' user + submissions");
        const numberOfTestSongs = Math.floor(Math.random() * 3 + 2);
        const newbieUserId = 9999;
        for (let i = 0; i < numberOfTestSongs; i++) {
          // proper implementation could return some kind of result with details
          // to pass on to the user, boolean here just for simplicity/testing
          await queueManager.trySubmission(
            newbieUserId,
            `https://TotallyAMusic.com/music/${newbieUserId}/${submissionNumber}`,
            Math.floor(Math.random() * 121 + 90)
          );
          submissionNumber += 1;
        }
        logger.info("");
      }
    }
    ////////////// End Testing //////////////
  }

  // Queues users rather than songs. Each user keeps its own local song queue,
  // and is added to the end of the master queue again after each of their
  // songs is played, until they have no songs left.
  masterQueue: FairerQueue;

  // Discord's userId -> User object
  // Filled with fake userIds and dummy User objects for testing but this
  // would be the persistent user/record storage
  userMap: Record<number, User | undefined>;

  // Old/already-played user submissions will be forgotten over time, this
  // defines how long that takes.
  // Possibly, users that no longer have any current/historical
  // submissions can themselves be forgotten (not implemented in this test).
  // millis/sec * sec/min * 300 minutes
  static maxSubmissionCacheTime: number = 1000 * 60 * 300;

  // Cooldown between submissions by the same user, in milliseconds.
  // Set to 0 for testing, can be higher to prevent spam.
  recentSubmissionCooldown = 1000 * 60 * 0;

  // Maximum queued submissions per person
  // - once this limit is reached, the user's first song must be played
  // before they can submit again
  // - could probably set this higher given the fairer queueing system
  maxPersonalSubmissions = 3;

  // Maximum song length, stored in seconds
  maxSubmissionLength = 60 * 10;

  constructor() {
    this.masterQueue = new FairerQueue();
    this.userMap = {};
  }

  // returns true if the song was submitted, false otherwise
  // could be made to return some kind of String result or something
  // rather than printing out some debug
  async trySubmission(userId: number, link: string, seconds: number): Promise<boolean> {
    if (seconds > this.maxSubmissionLength) {
      logger.info(
        `Submissioni denied, too long: User: ${userId} - Link: ${link} - Time: ${(
          seconds / 60
        ).toFixed(2)}:${(seconds % 60).toFixed(2)}`
      );
      return false;
    }
    // Get an existing User or create a new one if one doesn't exist.
    const user: User = this.userMap[userId] ?? new User(userId);
    const recent = await user.getMostRecentSubmission();
    if (recent !== null && Date.now() - recent.timeCreated < this.recentSubmissionCooldown) {
      logger.info(
        `Submissioni denied, too recent: User: ${userId} - Link: ${link} - Time: ${(
          seconds / 60
        ).toFixed(2)}:${(seconds % 60).toFixed(2)}`
      );
      return false; // Could not submit, too recent
    }
    if (user.localQueue.length >= this.maxPersonalSubmissions) {
      logger.info(
        `Submission denied, too many submissions by user: User: ${userId} - Link: ${link} - Time: ${(
          seconds / 60
        ).toFixed(2)}:${(seconds % 60).toFixed(2)}`
      );
      return false; // Could not submit, too many submissions
    }
    const submission: Submission = { link, secondsLong: seconds, timeCreated: Date.now() };
    // Add submission to user's local queue, also cleaning user's history
    // cache. This should be run before adding to the master queue.
    await user.addSubmission(submission);
    // Add user to master queue if not already in it (FairerQueue handles
    // that limitation itself)
    await this.masterQueue.add(user);

    logger.info(
      `Submission added! User: ${userId} - Link: ${submission.link} - Time: ${(
        submission.secondsLong / 60
      ).toFixed(2)}:${(submission.secondsLong % 60).toFixed(2)}`
    );

    return true;
  }

  async pollNextSubmission(): Promise<Submission | null> {
    // Loop until there's no more users in the queue (so no more submissions)
    // OR until a submission is found and returned.
    while (!(await this.masterQueue.isEmpty())) {
      const user = await this.masterQueue.poll();

      // Get next submission from user
      const nextSubmission = user?.pollSubmission() ?? null;
      if (nextSubmission !== null) {
        // Add user back to master queue if they have more submissions
        if (user?.hasSubmission()) {
          await this.masterQueue.add(user);
        }
        return nextSubmission;
      }
    }
    return null;
  }

  getTotalSubmissionTime(): number {
    let total = 0;
    for (const user of this.masterQueue) {
      for (const sub of user.localQueue) {
        total += sub.secondsLong;
      }
    }
    return total;
  }
}

function peek<T>(linkedList: Array<T>): T | null {
  if (linkedList.length === 0) {
    return null;
  }
  return linkedList[0];
}

function peekLast<T>(linkedList: Array<T>): T | null {
  if (linkedList.length === 0) {
    return null;
  }
  return linkedList[linkedList.length - 1];
}

// Custom wrapper class around a LinkedList queue that can push
// new users who haven't played a song yet in front of people who have.
// This way latecomers get to join the party as soon as possible while those
// that showed up early still get to hear at least their first submission
// before getting shifted back in the line.
class FairerQueue {
  // The actual queue.
  private queue: Array<User> = [];

  // synchronized so we can make sure we're not double-adding a user in
  // case of spam/lag spikes.
  add(user: User): Promise<void> {
    return lock.acquire("queue", done => {
      // Only add user to the queue if they're not already in it.
      if (!this.queue.includes(user)) {
        if (user.history.length !== 0) {
          // User has played a song before, no special treatment so
          // add them straight to the back of the queue.
          this.queue.push(user);
        } else {
          // User has not played a song before, put them in line
          // before users that have already played a song.
          let insertPosition = 0;
          for (const nextUser of this.queue) {
            if (nextUser.history.length !== 0) {
              // Found a user that has already played a song,
              // break the loop, insertPosition = that user's position.
              break;
            }
            insertPosition++;
          }
          this.queue.splice(insertPosition, 0, user);
        }
      }

      done();
    });
  }

  isEmpty(): Promise<boolean> {
    return lock.acquire("queue", done => {
      done(undefined, this.queue.length === 0);
    });
  }

  peek(): Promise<User | null> {
    return lock.acquire("queue", done => {
      done(undefined, peek(this.queue));
    });
  }

  poll(): Promise<User | null> {
    return lock.acquire("queue", done => {
      const result = this.queue.pop() ?? null;
      done(undefined, result);
    });
  }

  [Symbol.iterator]() {
    return this.queue.values();
  }
}

// Container object for Users (discord userId + local queue and history)
class User {
  readonly userId: number;
  localQueue: Array<Submission>;
  history: Array<Submission>;

  constructor(userId: number) {
    this.userId = userId;
    this.localQueue = [];
    this.history = [];
  }

  hasSubmission(): Promise<boolean> {
    return lock.acquire("localQueue", done => {
      done(undefined, this.localQueue.length !== 0);
    });
  }

  getMostRecentSubmission(): Promise<Submission | null> {
    return lock.acquire(["localQueue", "history"], done => {
      if (this.localQueue.length !== 0) {
        return done(undefined, peekLast(this.localQueue));
      }
      if (this.history.length !== 0) {
        return done(undefined, peekLast(this.history));
      }
      return done(undefined, null);
    });
  }

  async addSubmission(sub: Submission): Promise<void> {
    await this.cleanOld();
    return lock.acquire("localQueue", done => {
      this.localQueue.push(sub);
      done();
    });
  }

  // Get next submission (if one exists), remove it from local queue and
  // add to history queue/list
  async pollSubmission(): Promise<Submission | null> {
    await this.cleanOld();
    return lock.acquire(["localQueue", "history"], done => {
      const next = this.localQueue.pop() ?? null;
      if (next !== null) {
        this.history.push(next);
      }
      done(undefined, next);
    });
  }

  // Clear out submissions that are too old/free up memory.
  cleanOld(): Promise<void> {
    return lock.acquire("history", done => {
      const oldestAllowed = Date.now() - FairMusicQueueTest.maxSubmissionCacheTime;
      while (
        this.history.length !== 0 &&
        (peek(this.history)?.timeCreated ?? Number.MIN_VALUE) < oldestAllowed
      ) {
        this.history.pop();
      }
      done();
    });
  }
}

// Container object for submissions
interface Submission {
  link: string;
  secondsLong: number;
  timeCreated: number;
}
