// @vitest-environment node
import { expect, test } from "vitest"

test("importing without a DOM does not throw", async () => {
	expect(typeof Element).toBe("undefined")

	const morphlex = await import("../../src/morphlex")

	expect(typeof morphlex.morph).toBe("function")
})
