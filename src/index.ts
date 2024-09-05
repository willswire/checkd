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
	async fetch(): Promise<Response> {
		return new Response('Checkd is running!');
	}

	async check(headers: Headers): Promise<boolean> {
		try {
			// Log all headers
			headers.forEach((value, key) => {
				console.log(`${key}: ${value}`);
			});

			// Validate Cloudflare Access token or Apple Device token
			if (headers.has('Cf-Access-Jwt-Assertion')) {
				console.log('validating Cloudflare Access Token');
				return await this.validateCloudflareAccessToken(headers);
			} else if (headers.has('X-Apple-Device-Token')) {
				console.log('validating Apple Device Token');
				return await this.validateAppleDeviceToken(headers);
			} else {
				console.log('no valid tokens present');
				return false;
			}
		} catch (error) {
			console.error('Error during check operation:', error);
			return false;
		}
	}

	/**
	 * Validates the Cloudflare Access token
	 * @param headers - The request headers
	 * @returns A promise that resolves to a boolean indicating whether the token is valid
	 */
	private async validateCloudflareAccessToken(headers: Headers): Promise<boolean> {
		const token = headers.get('Cf-Access-Jwt-Assertion');
		if (!token) return false;

		const teamName = this.env.CF_TEAM_NAME;
		const audTag = this.env.CF_AUD_TAG;
		const certsUrl = `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`;

		try {
			const JWKS = jose.createRemoteJWKSet(new URL(certsUrl));

			const { payload, protectedHeader } = await jose.jwtVerify(token, JWKS, {
				audience: audTag,
				issuer: `https://${teamName}.cloudflareaccess.com`,
			});

			console.log('Token payload:', payload);
			console.log('Protected header:', protectedHeader);

			return true;
		} catch (error) {
			console.error('Error verifying Cloudflare Access token:', error);
			return false;
		}
	}

	/**
	 * Validates the Apple Device token by calling the upstream Apple endpoint
	 * @param headers - The request headers
	 * @returns A promise that resolves to a boolean indicating the success of the validation
	 */
	private async validateAppleDeviceToken(headers: Headers): Promise<boolean> {
		try {
			const deviceToken = this.getRequiredHeader(headers, 'X-Apple-Device-Token');
			const isDevelopment = headers.get('X-Apple-Device-Development') === 'true';
			const claim = this.createDeviceClaim(deviceToken);
			const jwt = await this.generateAppleJWT(claim);
			const upstreamUrl = this.getAppleEndpoint(isDevelopment);
			const response = await this.sendToApple(upstreamUrl, jwt, claim);

			return response.status === 200;
		} catch (error) {
			console.error('Error during device token validation:', error);
			return false;
		}
	}

	/**
	 * Retrieves the required header value
	 * @param headers - The request headers object
	 * @param headerName - The name of the header to retrieve
	 * @returns The header value as a string
	 * @throws Error if the header is missing
	 */
	private getRequiredHeader(headers: Headers, headerName: string): string {
		const value = headers.get(headerName);
		if (!value) throw new Error(`${headerName} is missing`);
		return value;
	}

	/**
	 * Creates the claim object for the Apple JWT
	 * @param deviceToken - The device token string
	 * @returns The claim object containing deviceToken, transactionId, and timestamp
	 */
	private createDeviceClaim(deviceToken: string): DeviceClaim {
		const timestamp = Date.now();
		return {
			device_token: deviceToken,
			transaction_id: `trns-${timestamp}`,
			timestamp: timestamp,
		};
	}

	/**
	 * Generates a JWT for Apple validation
	 * @param claim - The claim object to be signed
	 * @returns A promise that resolves to the generated JWT string
	 */
	private async generateAppleJWT(claim: DeviceClaim): Promise<string> {
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
	 * Retrieves the Apple endpoint URL based on the environment type
	 * @param isDevelopment - Boolean indicating if the environment is for development
	 * @returns The Apple endpoint URL as a string
	 */
	private getAppleEndpoint(isDevelopment: boolean): string {
		const environment = isDevelopment ? 'api.development' : 'api';
		return `https://${environment}.devicecheck.apple.com/v1/validate_device_token`;
	}

	/**
	 * Sends the claim to the Apple endpoint and retrieves the response
	 * @param url - The Apple endpoint URL
	 * @param jwt - The generated JWT string
	 * @param claim - The claim object to be sent
	 * @returns A promise that resolves to the upstream response object
	 */
	private async sendToApple(url: string, jwt: string, claim: DeviceClaim): Promise<Response> {
		const requestInit: RequestInit = {
			method: 'POST',
			body: JSON.stringify(claim),
			headers: {
				Authorization: `Bearer ${jwt}`,
				'Content-Type': 'application/json',
			},
		};

		try {
			return await fetch(url, requestInit);
		} catch (error) {
			console.error('Failed to send request to Apple endpoint:', error);
			throw new Error('Failed to send request to Apple');
		}
	}
}
