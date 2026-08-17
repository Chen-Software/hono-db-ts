import { test, expect } from "bun:test";
import { parseWorkflow, workflowMatchesEvent, WorkflowParseError } from "./workflow";

const PUSH_WORKFLOW = `on: [push]
jobs:
  build:
    runs-on: [ubuntu-latest]
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Test
        run: bun test
`;

test("parseWorkflow: parses on/jobs/runs-on/steps", () => {
	const wf = parseWorkflow(PUSH_WORKFLOW);
	expect(wf.on).toEqual(["push"]);
	expect(wf.jobs?.build["runs-on"]).toEqual(["ubuntu-latest"]);
	expect(wf.jobs?.build.steps).toHaveLength(2);
	expect(wf.jobs?.build.steps?.[0].uses).toBe("actions/checkout@v4");
	expect(wf.jobs?.build.steps?.[1].run).toBe("bun test");
});

test("parseWorkflow: object form of on (e.g. on: { push: { branches: [...] } })", () => {
	const wf = parseWorkflow(`on:
  push:
    branches: [main]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`);
	expect(typeof wf.on).toBe("object");
	expect(workflowMatchesEvent(wf, "push")).toBe(true);
	expect(workflowMatchesEvent(wf, "pull_request")).toBe(false);
});

test("parseWorkflow: rejects non-mapping roots and invalid YAML", () => {
	expect(() => parseWorkflow("- just\n- a\n- list")).toThrow(WorkflowParseError);
	expect(() => parseWorkflow("on: [push\n  broken: :::")).toThrow(WorkflowParseError);
});

test("workflowMatchesEvent: array / string / absent on", () => {
	expect(workflowMatchesEvent({ on: ["push", "pull_request"], jobs: {} }, "push")).toBe(true);
	expect(workflowMatchesEvent({ on: ["push"], jobs: {} }, "pull_request")).toBe(false);
	expect(workflowMatchesEvent({ on: "push", jobs: {} }, "push")).toBe(true);
	expect(workflowMatchesEvent({ jobs: {} }, "push")).toBe(false);
	expect(workflowMatchesEvent({}, "push")).toBe(false);
});
