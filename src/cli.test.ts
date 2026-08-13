import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { run } from "./cli.ts";

// Captured output helpers
let stdout: string[];
let stderr: string[];

let logSpy: ReturnType<typeof spyOn>;
let errorSpy: ReturnType<typeof spyOn>;
let exitSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
	stdout = [];
	stderr = [];

	logSpy = spyOn(console, "log").mockImplementation((...args) => {
		stdout.push(args.join(" "));
	});
	errorSpy = spyOn(console, "error").mockImplementation((...args) => {
		stderr.push(args.join(" "));
	});
	// Prevent process.exit from killing the test runner
	exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as never);
});

afterEach(() => {
	logSpy.mockRestore();
	errorSpy.mockRestore();
	exitSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// echo
// ---------------------------------------------------------------------------
describe("echo", () => {
	it("prints a single word", () => {
		run(["echo", "hello"]);
		expect(stdout).toEqual(["hello"]);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("joins multiple words with a space", () => {
		run(["echo", "hello", "world"]);
		expect(stdout).toEqual(["hello world"]);
	});

	it("errors when no message is provided", () => {
		run(["echo"]);
		expect(stderr[0]).toContain("echo requires a message");
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------
describe("add", () => {
	it("adds two positive integers", () => {
		run(["add", "3", "4"]);
		expect(stdout).toEqual(["7"]);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("adds negative numbers", () => {
		run(["add", "-5", "3"]);
		expect(stdout).toEqual(["-2"]);
	});

	it("adds floats", () => {
		run(["add", "1.5", "2.5"]);
		expect(stdout).toEqual(["4"]);
	});

	it("errors when only one argument is given", () => {
		run(["add", "1"]);
		expect(stderr[0]).toContain("add requires two numbers");
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("errors on non-numeric input", () => {
		run(["add", "foo", "2"]);
		expect(stderr[0]).toContain('"a" must be a number');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

// ---------------------------------------------------------------------------
// subtract
// ---------------------------------------------------------------------------
describe("subtract", () => {
	it("subtracts b from a", () => {
		run(["subtract", "10", "3"]);
		expect(stdout).toEqual(["7"]);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("returns a negative result", () => {
		run(["subtract", "3", "10"]);
		expect(stdout).toEqual(["-7"]);
	});

	it("errors when only one argument is given", () => {
		run(["subtract", "5"]);
		expect(stderr[0]).toContain("subtract requires two numbers");
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("errors on non-numeric input", () => {
		run(["subtract", "10", "bar"]);
		expect(stderr[0]).toContain('"b" must be a number');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

// ---------------------------------------------------------------------------
// unknown / missing command
// ---------------------------------------------------------------------------
describe("unknown command", () => {
	it("errors and exits 1 for an unknown command", () => {
		run(["multiply"]);
		expect(stderr[0]).toContain('unknown command "multiply"');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("prints help and exits 0 when no command is given", () => {
		run([]);
		expect(stdout[0]).toContain("Usage:");
		expect(exitSpy).toHaveBeenCalledWith(0);
	});
});
