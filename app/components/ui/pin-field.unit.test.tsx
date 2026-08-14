import { expect, test } from "bun:test";
import { PinField } from "./pin-field";
import { Root as PinFieldRoot } from "./pin-field-primitive";

test("PinField - renders label, helper text, and hidden input", () => {
	const html = (
		<PinField
			interactive={false}
			id="otp"
			label="Verification code"
			helperText="Check your email"
			count={4}
		/>
	).toString();

	expect(html).toContain("Verification code");
	expect(html).toContain('for="otp-input-0"');
	expect(html).toContain('id="otp-input-0"');
	expect(html).toContain("Check your email");
	expect(html).toContain('type="hidden"');
});

test("PinField - validator flags an invalid completed value with an accessible error", () => {
	const html = (
		<PinFieldRoot
			id="otp"
			count={6}
			defaultValue={["0", "0", "0", "0", "0", "0"]}
			validator={(value: string) =>
				value !== "000000" || "Code cannot be all zeros"
			}
		/>
	).toString();

	expect(html).toContain("Code cannot be all zeros");
	expect(html).toContain('aria-live="polite"');
	expect(html).toContain('aria-invalid="true"');
	expect(html).toContain('data-invalid=""');
});

test("PinField - a valid completed value renders no error and marks every box complete", () => {
	const html = (
		<PinFieldRoot
			id="otp"
			count={4}
			defaultValue={["1", "2", "3", "4"]}
			validator={(value: string) => value !== "0000" || "Invalid code"}
		/>
	).toString();

	expect(html).not.toContain("Invalid code");
	expect(html).not.toContain("aria-invalid");
	// data-complete lands on the root plus all 4 boxes
	expect(html.match(/data-complete=""/g)?.length).toBe(5);
});

test("PinField - roving tabIndex stops Tab at the first empty box", () => {
	const html = (
		<PinFieldRoot id="otp" count={4} defaultValue={["1", "2", "", ""]} />
	).toString();

	// boxes 0/1 are filled, box 2 is the next to fill (marked active) — all
	// three stay reachable via Tab; box 3 is pulled out of tab order
	expect(html).toMatch(/data-index="0"[^>]*data-filled=""[^>]*tabIndex="0"/);
	expect(html).toMatch(/data-index="1"[^>]*data-filled=""[^>]*tabIndex="0"/);
	expect(html).toMatch(/data-index="2"[^>]*data-active=""[^>]*tabIndex="0"/);
	expect(html).toMatch(/data-index="3"[^>]*tabIndex="-1"/);
});

test("PinField - otp autofill targets only the active box, ignored elsewhere", () => {
	const html = (
		<PinFieldRoot id="otp" count={4} otp defaultValue={["1", "", "", ""]} />
	).toString();

	// box 1 is the active/next-to-fill box: gets the real autocomplete + full maxlength
	expect(html).toMatch(
		/data-index="1"[^>]*autoComplete="one-time-code"[^>]*maxLength="4"/,
	);
	// every other box opts out of autofill and asks password managers to ignore it
	expect(html).toMatch(
		/data-index="0"[^>]*autoComplete="off"[^>]*data-1p-ignore="true"/,
	);
	expect(html).toContain('data-1p-ignore="true"');
	expect(html).toContain('data-lpignore="true"');
	expect(html).toContain('data-protonpass-ignore="true"');
	expect(html).toContain('data-bwignore="true"');
});

test("PinField - without otp, no box advertises autocomplete or password-manager attrs", () => {
	const html = (
		<PinFieldRoot id="otp" count={4} defaultValue={["1", "", "", ""]} />
	).toString();

	expect(html).not.toContain("one-time-code");
	expect(html).not.toContain("data-1p-ignore");
	expect(html.match(/autoComplete="off"/g)?.length).toBe(4);
});

test("PinField - form id is forwarded to the hidden input for auto-submit/reset association", () => {
	const html = (
		<PinFieldRoot id="otp" count={4} form="signup-form" name="code" />
	).toString();

	expect(html).toMatch(/type="hidden"[^>]*form="signup-form"/);
	expect(html).toContain('name="code"');
});
