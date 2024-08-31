import { WorkerEntrypoint } from 'cloudflare:workers';
import * as jose from 'jose';

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
	 * @param headers - The request headers object
	 * @returns A promise that resolves to a boolean indicating the success of the check
	 */
	async check(headers: Headers): Promise<boolean> {
		try {
			// Retrieve device token and environment type from the request headers
			const deviceToken = this.getDeviceToken(headers);
			const isDevelopment = this.isDevelopmentEnvironment(headers);

			// Create the claim object for the JWT
			const claim = this.createClaim(deviceToken);

			// Generate the JWT using the claim
			const jwt = await this.generateJWT(claim);

			// Get the upstream endpoint based on the environment type
			const upstreamEndpoint = this.getUpstreamEndpoint(isDevelopment);

			// Send the claim to the upstream endpoint and retrieve the response
			const upstreamResponse = await this.sendUpstreamRequest(upstreamEndpoint, jwt, claim);

			// Check if the upstream response status is 200 (OK)
			return upstreamResponse.status === 200;
		} catch (error) {
			console.error('Error during device check:', error);
			return false;
		}
	}

	/**
	 * Retrieves the device token from the request headers
	 * @param headers - The request headers object
	 * @returns The device token as a string
	 * @throws Error if the device token is missing
	 */
	private getDeviceToken(headers: Headers): string {
		const deviceToken = headers.get('X-Apple-Device-Token');
		if (!deviceToken) {
			throw new Error('Device token is missing');
		}
		return deviceToken;
	}

	/**
	 * Determines if the environment is a development environment
	 * @param headers - The request headers object
	 * @returns A boolean indicating if the environment is for development
	 */
	private isDevelopmentEnvironment(headers: Headers): boolean {
		return headers.get('X-Apple-Device-Development') === 'true';
	}

	/**
	 * Creates the claim object for the JWT
	 * @param deviceToken - The device token string
	 * @returns The claim object containing device_token, transaction_id, and timestamp
	 */
	private createClaim(deviceToken: string): DeviceClaim {
		const currentTimestamp = Date.now();
		return {
			device_token: deviceToken,
			transaction_id: `trns-${currentTimestamp}`,
			timestamp: currentTimestamp,
		};
	}

	/**
	 * Generates a JWT using the claim object
	 * @param claim - The claim object to be signed
	 * @returns A promise that resolves to the generated JWT string
	 */
	private async generateJWT(claim: DeviceClaim): Promise<string> {
		const kid = this.env.APPLE_KEY_ID;
		const privateKey = await jose.importPKCS8(this.env.APPLE_PRIVATE_KEY, 'ES256');

		return new jose.SignJWT(claim)
			.setProtectedHeader({ alg: 'ES256', kid })
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
		const requestInit: RequestInit = {
			method: 'POST',
			body: JSON.stringify(claim),
			headers: {
				Authorization: `Bearer ${jwt}`,
				'Content-Type': 'application/json',
			},
		};

		try {
			return await fetch(upstreamEndpoint, requestInit);
		} catch (error) {
			console.error('Failed to send request to upstream endpoint:', error);
			throw new Error('Failed to send request to upstream');
		}
	}
}
