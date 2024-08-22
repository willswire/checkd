import { WorkerEntrypoint } from 'cloudflare:workers';
import * as jose from 'jose';

// Constant for JWT algorithm
const ALGORITHM = 'ES256';

// Define the claim interface extending JWTPayload
interface DeviceClaim extends jose.JWTPayload {
	device_token: string;
	transaction_id: string;
	timestamp: number;
}

// Main class extending WorkerEntrypoint with the environment type
export default class extends WorkerEntrypoint<Env> {
	// Fetch method to check if the worker is running
	async fetch(): Promise<Response> {
		return new Response('Checkd is running!');
	}

	/**
	 * Method to check the device token by calling the upstream Apple endpoint
	 * @param request - The incoming request object
	 * @returns A promise that resolves to a boolean indicating the success of the check
	 */
	async check(request: Request): Promise<boolean> {
		try {
			// Retrieve device token and environment type from the request headers
			const deviceToken: string = this.getDeviceToken(request);
			const isDevelopment: boolean = this.isDevelopmentEnvironment(request);

			// Create the claim object for the JWT
			const claim: DeviceClaim = this.createClaim(deviceToken);

			// Generate the JWT using the claim
			const jwt: string = await this.generateJWT(claim);

			// Get the upstream endpoint based on the environment type
			const upstreamEndpoint: string = this.getUpstreamEndpoint(isDevelopment);

			// Send the claim to the upstream endpoint and retrieve the response
			const upstreamResponse: Response = await this.sendUpstreamRequest(upstreamEndpoint, jwt, claim);

			// Handle the upstream response and return the result
			return this.handleUpstreamResponse(upstreamResponse);
		} catch (error) {
			// Return false in the event of an exception
			return false;
		}
	}

	/**
	 * Retrieves the device token from the request headers
	 * @param request - The incoming request object
	 * @returns The device token as a string
	 * @throws Error if the device token is missing
	 */
	private getDeviceToken(request: Request): string {
		const deviceToken = request.headers.get('X-Apple-Device-Token');
		if (!deviceToken) {
			throw new Error('Device token is missing');
		}
		return deviceToken;
	}

	/**
	 * Determines if the environment is a development environment
	 * @param request - The incoming request object
	 * @returns A boolean indicating if the environment is for development
	 */
	private isDevelopmentEnvironment(request: Request): boolean {
		return request.headers.get('X-Apple-Device-Development') === 'true';
	}

	/**
	 * Creates the claim object for the JWT
	 * @param deviceToken - The device token string
	 * @returns The claim object containing device_token, transaction_id, and timestamp
	 */
	private createClaim(deviceToken: string): DeviceClaim {
		return {
			device_token: deviceToken,
			transaction_id: `trns-${Date.now()}`,
			timestamp: Date.now(),
		};
	}

	/**
	 * Generates a JWT using the claim object
	 * @param claim - The claim object to be signed
	 * @returns A promise that resolves to the generated JWT string
	 */
	private async generateJWT(claim: DeviceClaim): Promise<string> {
		const kid: string = this.env.APPLE_KEY_ID;
		const privateKey = await jose.importPKCS8(this.env.APPLE_PRIVATE_KEY, ALGORITHM);

		return new jose.SignJWT(claim)
			.setProtectedHeader({ alg: ALGORITHM, kid })
			.setIssuedAt()
			.setIssuer(this.env.APPLE_DEVELOPER_ID)
			.setExpirationTime('1h')
			.sign(privateKey);
	}

	/**
	 * Retrieves the upstream endpoint URL based on the environment type
	 * @param isDevelopment - Boolean indicating if the environment is for development
	 * @returns The upstream endpoint URL as a string
	 */
	private getUpstreamEndpoint(isDevelopment: boolean): string {
		const environment = isDevelopment ? 'api.development' : 'api';
		return `https://${environment}.devicecheck.apple.com/v1/validate_device_token`;
	}

	/**
	 * Sends the claim to the upstream endpoint and retrieves the response
	 * @param upstreamEndpoint - The upstream endpoint URL
	 * @param jwt - The generated JWT string
	 * @param claim - The claim object to be sent
	 * @returns A promise that resolves to the upstream response object
	 */
	private async sendUpstreamRequest(upstreamEndpoint: string, jwt: string, claim: DeviceClaim): Promise<Response> {
		return fetch(upstreamEndpoint, {
			method: 'POST',
			body: JSON.stringify(claim),
			headers: {
				Authorization: `Bearer ${jwt}`,
				'Content-Type': 'application/json',
			},
		});
	}

	/**
	 * Handles the upstream response
	 * @param upstreamResponse - The upstream response object
	 * @returns A promise that resolves to a boolean indicating the success of the operation
	 * @throws Error if the upstream response is not successful
	 */
	private async handleUpstreamResponse(upstreamResponse: Response): Promise<boolean> {
		if (upstreamResponse.status !== 200) {
			const errorText = await upstreamResponse.text();
			throw new Error(`Upstream response error: ${upstreamResponse.status} - ${errorText}`);
		}

		return true;
	}
}
