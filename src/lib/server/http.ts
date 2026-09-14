import { request as httpsRequest, type RequestOptions } from 'node:https';

export interface HttpResponse {
	status: number;
	headers: Record<string, string | string[] | undefined>;
	body: Buffer;
}

export interface TlsClientOptions {
	cert?: Buffer | string;
	key?: Buffer | string;
	pfx?: Buffer;
	passphrase?: string;
}

/** Minimaler Node-HTTPS-Client mit optionalem mTLS-Client-Zertifikat — bewusst ohne fetch/undici,
 * damit das Zertifikat pro Request zuverlässig und ohne Versionsüberraschungen greift. */
export function rawRequest(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		body?: Buffer | string;
		tls?: TlsClientOptions;
	} = {}
): Promise<HttpResponse> {
	return new Promise((resolve, reject) => {
		const u = new URL(url);
		const reqOptions: RequestOptions = {
			method: options.method ?? 'GET',
			hostname: u.hostname,
			port: u.port || 443,
			path: u.pathname + u.search,
			headers: options.headers,
			...options.tls
		};
		const req = httpsRequest(reqOptions, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () =>
				resolve({
					status: res.statusCode ?? 0,
					headers: res.headers as Record<string, string | string[] | undefined>,
					body: Buffer.concat(chunks)
				})
			);
		});
		req.on('error', reject);
		if (options.body) req.write(options.body);
		req.end();
	});
}

export async function requestJson<T = unknown>(
	url: string,
	options: Parameters<typeof rawRequest>[1] = {}
): Promise<{ status: number; json: T }> {
	const res = await rawRequest(url, options);
	const text = res.body.toString('utf8');
	let json: T;
	try {
		json = text ? JSON.parse(text) : ({} as T);
	} catch {
		throw new Error(`Antwort von ${url} ist kein gültiges JSON (Status ${res.status}): ${text.slice(0, 300)}`);
	}
	return { status: res.status, json };
}

export function formBody(fields: Record<string, string>): string {
	return new URLSearchParams(fields).toString();
}
