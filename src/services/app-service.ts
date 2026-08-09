import { typiaValidator } from "@hono/typia-validator";
import { Hono } from "hono";
import typia from "typia";

import { type IBbsArticle } from "../models/ibbs-article";

// build a reusable validator from the type
const validate = typia.createValidate<IBbsArticle>();

const AppService = new Hono();

AppService.get("/", (c) => c.json({ status: "ok" }));

AppService.get("/info", (c) =>
	c.json({ status: "ok", service: "web-service" }),
);

AppService.post(
	"/",
	typiaValidator("json", validate),
	(c) => {
		const data = c.req.valid("json"); // typed as IBbsArticle
		return c.json({
			id: data.id,
			title: data.title,
			body: data.body,
			created_at: data.created_at,
		});
	},
);

AppService.onError((err, c) => {
	console.error(err);
	return c.json({ status: "error", message: err.message }, 500);
});

export { AppService };
