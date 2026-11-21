import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHalfSeasonRange, getIndoorSeasonRange, getSeasonRange } from './season-range.ts';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

test('indoor: start day opens the new season', () => {
	assert.deepEqual(getIndoorSeasonRange(day(2026, 11, 21)), { from: '2026-11-21', to: '2027-03-21' });
});

test('indoor: 31 Dec and 1 Jan belong to the same season', () => {
	assert.deepEqual(getIndoorSeasonRange(day(2026, 12, 31)), { from: '2026-11-21', to: '2027-03-21' });
	assert.deepEqual(getIndoorSeasonRange(day(2027, 1, 1)), { from: '2026-11-21', to: '2027-03-21' });
});

test('indoor: 21 Mar is the last day of the running season', () => {
	assert.deepEqual(getIndoorSeasonRange(day(2027, 3, 21)), { from: '2026-11-21', to: '2027-03-21' });
});

test('indoor: 22 Mar and summer point at the coming season', () => {
	assert.deepEqual(getIndoorSeasonRange(day(2027, 3, 22)), { from: '2027-11-21', to: '2028-03-21' });
	assert.deepEqual(getIndoorSeasonRange(day(2027, 7, 15)), { from: '2027-11-21', to: '2028-03-21' });
});

test('getSeasonRange picks indoor or half-season', () => {
	const d = day(2026, 11, 21);
	assert.deepEqual(getSeasonRange(true, d), { from: '2026-11-21', to: '2027-03-21' });
	assert.deepEqual(getSeasonRange(false, d), { from: '2026-08-01', to: '2026-12-31' });
});

test('half-season unchanged', () => {
	assert.deepEqual(getHalfSeasonRange(day(2027, 3, 1)), { from: '2027-01-01', to: '2027-07-31' });
});
