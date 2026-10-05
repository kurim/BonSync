// Startpunkt für den Produktionsbetrieb (`npm start`, Docker).
//
// adapter-node 6 liest die Umgebungsvariable ORIGIN nicht mehr; die Origin wird pro Request aus
// Host-Header und Protokoll abgeleitet, wobei das Protokoll ohne Header-Angabe auf "https" fällt.
// Im Heimnetz per http:// würde dadurch SvelteKits CSRF-Schutz jedes Formular ablehnen. Damit
// `ORIGIN` in der .env wie bisher funktioniert, werden Protokoll und Host daraus abgeleitet und
// der App über interne Header mitgegeben (vor dem Laden des Adapters, der die Namen beim Import liest).
import http from 'node:http';

const PROTOCOL_HEADER = 'x-bonsync-origin-protocol';
const HOST_HEADER = 'x-bonsync-origin-host';

if (process.env.ORIGIN) {
	const { protocol, host } = new URL(process.env.ORIGIN);
	process.env.PROTOCOL_HEADER = PROTOCOL_HEADER;
	process.env.HOST_HEADER = HOST_HEADER;

	const emit = http.Server.prototype.emit;
	http.Server.prototype.emit = function (event, req, ...rest) {
		if (event === 'request') {
			req.headers[PROTOCOL_HEADER] = protocol.slice(0, -1);
			req.headers[HOST_HEADER] = host;
		}
		return emit.call(this, event, req, ...rest);
	};
}

await import('./build/index.js');
