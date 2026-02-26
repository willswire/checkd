import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

// Shim WorkerEntrypoint so the class can be instantiated in Node
vi.mock('cloudflare:workers', () => ({
	WorkerEntrypoint: class {
		ctx: unknown;
		env: unknown;
		constructor(ctx: unknown, env: unknown) {
			this.ctx = ctx;
			this.env = env;
		}
	},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnv(overrides: Partial<Env> = {}): Env {
	return {
		APPLE_KEY_ID: 'test-key-id',
		APPLE_PRIVATE_KEY: 'test-private-key',
		APPLE_DEVELOPER_ID: 'test-developer-id',
		...overrides,
	};
}

function makeCtx(): ExecutionContext {
	return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// fetch handler
// ---------------------------------------------------------------------------

describe('fetch handler', () => {
	it('responds with running message', async () => {
		const instance = new worker(makeCtx(), makeEnv());
		const response = await instance.fetch();
		expect(await response.text()).toBe('Checkd is running!');
	});

	it('responds with 200', async () => {
		const instance = new worker(makeCtx(), makeEnv());
		const response = await instance.fetch();
		expect(response.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// check handler
// ---------------------------------------------------------------------------

describe('check handler', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('returns false when device token header is missing', async () => {
		const instance = new worker(makeCtx(), makeEnv());
		expect(await instance.check(new Headers())).toBe(false);
	});

	it('returns false when device token header is empty', async () => {
		const instance = new worker(makeCtx(), makeEnv());
		expect(await instance.check(new Headers({ 'X-Apple-Device-Token': '' }))).toBe(false);
	});

	it('returns false when env vars are invalid (jwt generation fails)', async () => {
		const instance = new worker(makeCtx(), makeEnv());
		const headers = new Headers({ 'X-Apple-Device-Token': 'test-token' });
		expect(await instance.check(headers)).toBe(false);
	});

	it('treats missing X-Apple-Device-Development header as production', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const { generateKeyPair, exportPKCS8 } = await import('jose');
		const { privateKey } = await generateKeyPair('ES256');
		const pem = await exportPKCS8(privateKey);
		const instance = new worker(makeCtx(), makeEnv({ APPLE_PRIVATE_KEY: pem }));
		const headers = new Headers({ 'X-Apple-Device-Token': 'test-token' });
		await instance.check(headers);
		const calledUrl = (fetchSpy.mock.calls[0][0] as string);
		expect(calledUrl).toContain('api.devicecheck.apple.com');
		expect(calledUrl).not.toContain('api.development');
		fetchSpy.mockRestore();
	});

	it('uses development endpoint when X-Apple-Device-Development is true', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const { generateKeyPair, exportPKCS8 } = await import('jose');
		const { privateKey } = await generateKeyPair('ES256');
		const pem = await exportPKCS8(privateKey);
		const instance = new worker(makeCtx(), makeEnv({ APPLE_PRIVATE_KEY: pem }));
		const headers = new Headers({ 'X-Apple-Device-Token': 'test-token', 'X-Apple-Device-Development': 'true' });
		await instance.check(headers);
		const calledUrl = (fetchSpy.mock.calls[0][0] as string);
		expect(calledUrl).toContain('api.development.devicecheck.apple.com');
		fetchSpy.mockRestore();
	});

	it('returns true when upstream responds with 200', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const { generateKeyPair, exportPKCS8 } = await import('jose');
		const { privateKey } = await generateKeyPair('ES256');
		const pem = await exportPKCS8(privateKey);
		const instance = new worker(makeCtx(), makeEnv({ APPLE_PRIVATE_KEY: pem }));
		const headers = new Headers({ 'X-Apple-Device-Token': 'test-token' });
		expect(await instance.check(headers)).toBe(true);
		vi.restoreAllMocks();
	});

	it('returns false when upstream responds with non-200', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }));
		const { generateKeyPair, exportPKCS8 } = await import('jose');
		const { privateKey } = await generateKeyPair('ES256');
		const pem = await exportPKCS8(privateKey);
		const instance = new worker(makeCtx(), makeEnv({ APPLE_PRIVATE_KEY: pem }));
		const headers = new Headers({ 'X-Apple-Device-Token': 'test-token' });
		expect(await instance.check(headers)).toBe(false);
		vi.restoreAllMocks();
	});

	it('returns false when upstream fetch throws', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'));
		const { generateKeyPair, exportPKCS8 } = await import('jose');
		const { privateKey } = await generateKeyPair('ES256');
		const pem = await exportPKCS8(privateKey);
		const instance = new worker(makeCtx(), makeEnv({ APPLE_PRIVATE_KEY: pem }));
		const headers = new Headers({ 'X-Apple-Device-Token': 'test-token' });
		expect(await instance.check(headers)).toBe(false);
		vi.restoreAllMocks();
	});
});
