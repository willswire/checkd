import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPair, exportPKCS8, decodeJwt } from 'jose';
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
		CF_TEAM_NAME: 'test-team',
		CF_AUD_TAG: 'test-aud-tag',
		...overrides,
	};
}

function makeCtx(): ExecutionContext {
	return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

async function makeValidEnv(): Promise<Env> {
	const { privateKey } = await generateKeyPair('ES256', {extractable: true});
	const pem = await exportPKCS8(privateKey);
	return makeEnv({ APPLE_PRIVATE_KEY: pem });
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
		const instance = new worker(makeCtx(), await makeValidEnv());
		await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token' }));
		const calledUrl = fetchSpy.mock.calls[0][0] as string;
		expect(calledUrl).toContain('api.devicecheck.apple.com');
		expect(calledUrl).not.toContain('api.development');
	});

	it('uses development endpoint when X-Apple-Device-Development is true', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const instance = new worker(makeCtx(), await makeValidEnv());
		await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token', 'X-Apple-Device-Development': 'true' }));
		const calledUrl = fetchSpy.mock.calls[0][0] as string;
		expect(calledUrl).toContain('api.development.devicecheck.apple.com');
	});

	it('calls the validate_device_token endpoint', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const instance = new worker(makeCtx(), await makeValidEnv());
		await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token' }));
		const calledUrl = fetchSpy.mock.calls[0][0] as string;
		expect(calledUrl).toContain('/v1/validate_device_token');
	});

	it('sends a POST request upstream', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const instance = new worker(makeCtx(), await makeValidEnv());
		await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token' }));
		const calledInit = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(calledInit.method).toBe('POST');
	});

	it('sends device_token, transaction_id, and timestamp in the request body', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const instance = new worker(makeCtx(), await makeValidEnv());
		await instance.check(new Headers({ 'X-Apple-Device-Token': 'my-device-token' }));
		const calledInit = fetchSpy.mock.calls[0][1] as RequestInit;
		const body = JSON.parse(calledInit.body as string);
		expect(body.device_token).toBe('my-device-token');
		expect(typeof body.transaction_id).toBe('string');
		expect(body.transaction_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		expect(typeof body.timestamp).toBe('number');
		expect(body.timestamp).toBeGreaterThan(0);
	});

	it('sends Authorization: Bearer <JWT> header upstream', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const instance = new worker(makeCtx(), await makeValidEnv());
		await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token' }));
		const calledInit = fetchSpy.mock.calls[0][1] as RequestInit;
		const authHeader = (calledInit.headers as Record<string, string>)['Authorization'];
		expect(authHeader).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
	});

	it('does not leak device payload into the JWT claims', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const env = await makeValidEnv();
		const instance = new worker(makeCtx(), env);
		await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token' }));
		const calledInit = fetchSpy.mock.calls[0][1] as RequestInit;
		const authHeader = (calledInit.headers as Record<string, string>)['Authorization'];
		const token = authHeader.replace('Bearer ', '');
		const claims = decodeJwt(token);
		expect(claims).not.toHaveProperty('device_token');
		expect(claims).not.toHaveProperty('transaction_id');
		expect(claims).not.toHaveProperty('timestamp');
		expect(claims).toHaveProperty('iss', env.APPLE_DEVELOPER_ID);
		expect(claims).toHaveProperty('iat');
		expect(claims).toHaveProperty('exp');
	});

	it('returns true when upstream responds with 200', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));
		const instance = new worker(makeCtx(), await makeValidEnv());
		expect(await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token' }))).toBe(true);
	});

	// Apple returns 200 with body "Bit State Not Found" when no bits have been set yet —
	// this is still a valid/genuine device, so it should resolve to true.
	it('returns true when upstream responds with 200 Bit State Not Found', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Bit State Not Found', { status: 200 }));
		const instance = new worker(makeCtx(), await makeValidEnv());
		expect(await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token' }))).toBe(true);
	});

	it.each([
		[400, 'Bad Device Token'],
		[400, 'Bad Authorization Token'],
		[401, 'Invalid Authorization Token'],
		[401, 'Authorization Token Expired'],
		[403, 'Forbidden'],
		[429, 'Too Many Requests'],
		[500, 'Server Error'],
		[503, 'Service Unavailable'],
	])('returns false when upstream responds with %i (%s)', async (status, body) => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status }));
		const instance = new worker(makeCtx(), await makeValidEnv());
		expect(await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token' }))).toBe(false);
	});

	it('returns false when upstream fetch throws', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'));
		const instance = new worker(makeCtx(), await makeValidEnv());
		expect(await instance.check(new Headers({ 'X-Apple-Device-Token': 'test-token' }))).toBe(false);
	});
});
