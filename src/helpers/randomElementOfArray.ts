import { randomInt } from "./randomInt.js";

/**
 * Returns a random element from an array.
 *
 * @param array The array
 * @returns A random element of the array.
 */
export function randomElementOfArray<T>(array: NonEmptyArray<T>): T;

/**
 * Returns a random element from an array.
 *
 * @param array The array
 * @returns A random element of the array.
 */
export function randomElementOfArray<T>(array: Array<T>): T | undefined;

export function randomElementOfArray<T>(array: Array<T>): T | undefined {
	return array[randomInt(array.length)];
}
