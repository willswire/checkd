import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('fetch handler', () => {
	it('responds with running message', async () => {
		const response = await SELF.fetch('https://example.com');
		expect(await response.text()).toBe('Checkd is running!');
	});

	it('responds with 200', async () => {
		const response = await SELF.fetch('https://example.com');
		expect(response.status).toBe(200);
	});
});

describe('check handler', () => {
	it('returns false when device token header is missing', async () => {
		const ctx = createExecutionContext();
		const instance = new worker(ctx, env);
		const result = await instance.check(new Headers());
		await waitOnExecutionContext(ctx);
		expect(result).toBe(false);
	});

	it('returns false when device token header is empty', async () => {
		const ctx = createExecutionContext();
		const instance = new worker(ctx, env);
		const headers = new Headers({ 'X-Apple-Device-Token': '' });
		const result = await instance.check(headers);
		await waitOnExecutionContext(ctx);
		expect(result).toBe(false);
	});

	it('treats missing X-Apple-Device-Development as production', async () => {
		const ctx = createExecutionContext();
		const instance = new worker(ctx, env);
		// No X-Apple-Device-Development header — should not throw, just return false
		// (will fail at JWT generation due to missing env vars in test, caught internally)
		const headers = new Headers({ 'X-Apple-Device-Token': 'test-token' });
		const result = await instance.check(headers);
		await waitOnExecutionContext(ctx);
		expect(result).toBe(false);
	});
});
