import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('checkd worker', () => {
	it('responds to fetch', async () => {
		const response = await SELF.fetch('https://example.com');
		expect(await response.text()).toBe('Checkd is running!');
	});
});
