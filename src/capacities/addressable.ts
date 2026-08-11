import typia, { type tags } from "typia";

interface Addressable<T extends "uri"> {
	uri: string & tags.Format<"uri">;
	url: (string | T) & tags.Format<"uri">;
}

const isAddressable = typia.createIs<Addressable<"uri">>();
const validateAddressable = typia.createValidate<Addressable<"uri">>();
console.log(
	isAddressable({
		uri: "http://localhost:3000",
		url: "https://localhost:3000",
	}),
);
console.log(
	validateAddressable({
		uri: "http://localhost:3000",
		url: "https://localhost:3000",
	}),
);

export { type Addressable, isAddressable, validateAddressable };
