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

	expect(document.title).toBe("New Title")
	expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("new")
	expect(document.querySelector("#content")?.textContent).toBe("New Content")
})
