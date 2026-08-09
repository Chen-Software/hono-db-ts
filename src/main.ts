import { WebService } from "./services/web-service";

const app = WebService;

const PORT = Number(Bun.env["PORT"] ?? 8080);

console.log(`Serving web-service on http://localhost:${PORT}`);

export default {
	port: PORT,
	fetch: app.fetch,
};
