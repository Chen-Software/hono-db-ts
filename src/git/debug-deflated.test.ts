import { test } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as git from "isomorphic-git";
import { nodeFs } from "@/git/fs-node";

test("debug: deflated format vs loose file bytes", async () => {
	const dir = mkdtempSync(join(tmpdir(), "cf-debug-"));
	try {
		const fs = nodeFs();
		await git.init({ fs, dir, defaultBranch: "main" });
		await fs.promises.writeFile(join(dir, "README.md"), "# Hello\n");
		await git.add({ fs, dir, filepath: "README.md" });
		await git.commit({ fs, dir, message: "c1", author: { name: "x", email: "x@e.com" }, committer: { name: "x", email: "x@e.com" } });

		const oid = await git.resolveRef({ fs, dir, ref: "HEAD" });
		const { tree } = await git.readTree({ fs, dir, oid: (await git.readCommit({ fs, dir, oid })).commit.tree });
		const fileOid = (tree as any[]).find((e: any) => e.path === "README.md")!.oid;
		console.log("blob oid:", fileOid);

		const loosePath = join(dir, ".git", "objects", fileOid.slice(0, 2), fileOid.slice(2));
		const loose = readFileSync(loosePath);
		console.log("loose len:", loose.length, "first4:", [...loose.slice(0, 4)]);

		const deflated: any = await git.readObject({ fs, dir, oid: fileOid, format: "deflated" });
		const defBuf = deflated.object instanceof Uint8Array ? deflated.object : new Uint8Array(deflated.object as ArrayBuffer);
		console.log("deflated len:", defBuf.length, "first4:", [...defBuf.slice(0, 4)]);

		const identical = defBuf.length === loose.length && defBuf.every((b: number, i: number) => b === loose[i]);
		console.log("deflated === loose file bytes?", identical);

		const content: any = await git.readObject({ fs, dir, oid: fileOid, format: "content" });
		const cBuf = content.object instanceof Uint8Array ? content.object : new Uint8Array(content.object as ArrayBuffer);
		console.log("content:", JSON.stringify(new TextDecoder().decode(cBuf)));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
