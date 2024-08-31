export default {
	async fetch(request, env, ctx): Promise<Response> {
		const isValid = await env.CHECKD.check(request.headers);
		if (isValid) {
			return new Response('Device Check Succeeded!');
		} else {
			return new Response('Device Check Failed', { status: 401 });
		}
	},
} satisfies ExportedHandler<Env>;
