import { test, expect } from "vitest"
import { morphDocument } from "../../src/morphlex"

test("morphing an entire document", () => {
	const parser = new DOMParser()
	const originalDocument = parser.parseFromString(
		`
			<html>
				<head>
					<title>Original Title</title>
					<meta name="description" content="original">
				</head>
				<body>
					<div id="content">Original Content</div>
				</body>
			</html>
		`,
		"text/html",
	)

	morphDocument(
		originalDocument,
		`
			<html>
				<head>
					<title>New Title</title>
					<meta name="description" content="new">
				</head>
				<body>
					<div id="content">New Content</div>
				</body>
			</html>
		`,
	)

	expect(originalDocument.querySelector("title")?.textContent).toBe("New Title")
	expect(originalDocument.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("new")
	expect(originalDocument.querySelector("#content")?.textContent).toBe("New Content")
})

test("morphing a document preserves id-based matching from the document root", () => {
	const parser = new DOMParser()
	const originalDocument = parser.parseFromString(
		`<html><body><main><section id="keep">before</section><p>tail</p></main></body></html>`,
		"text/html",
	)

	morphDocument(
		originalDocument,
		`<html><body><main><p>tail</p><section id="keep">after</section></main></body></html>`,
	)

	const kept = originalDocument.querySelector("#keep")
	expect(kept?.textContent).toBe("after")
	expect(originalDocument.querySelector("main")?.lastElementChild).toBe(kept)
})
