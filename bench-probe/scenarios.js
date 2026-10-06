// Runs in page. Each scenario: { name, from: html, to: html, setup?(root), options? }
;(function () {
	const range = (n) => Array.from({ length: n }, (_, i) => i)
	const ul = (items) => `<ul>${items.join("")}</ul>`
	const keyed = (ids, f = (i) => `Row ${i}`) => ul(ids.map((i) => `<li id="r${i}">${f(i)}</li>`))
	const unkeyed = (ids, f = (i) => `Row ${i}`) => ul(ids.map((i) => `<li>${f(i)}</li>`))
	const N = 1000
	const ids = range(N)
	let seed = 1
	const rnd = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647)
	const shuffled = ids.slice().sort(() => rnd() - 0.5)
	const row = (i, edit) =>
		`<tr id="t${i}"><td class="id">${i}</td><td><a href="/item/${i}">Item ${i}${edit ? "!" : ""}</a></td><td>${i * 3}</td><td><button class="del">x</button></td></tr>`
	const urow = (i, edit) =>
		`<tr><td class="id">${i}</td><td><a>Item ${i}${edit ? "!" : ""}</a></td><td>${i * 3}</td><td><button class="del">x</button></td></tr>`
	const card = (i, edit) =>
		`<article class="card"><header><h3>Title ${i}</h3><span class="meta">by user ${i % 17}</span></header><p>Body text for card ${i}${edit ? " (edited)" : ""} with <em>some</em> inline <strong>markup</strong>.</p><footer><a href="/c/${i}">Open</a> <button type="button">Like</button></footer></article>`
	const nested = (d, txt) => (d === 0 ? `<span>${txt}</span>` : `<div class="d${d}">${nested(d - 1, txt)}</div>`)
	window.SCENARIOS = [
		{ name: "keyed 1000 unchanged", from: keyed(ids), to: keyed(ids) },
		{ name: "keyed 1000 edit all", from: keyed(ids), to: keyed(ids, (i) => `Row ${i}!`) },
		{ name: "keyed 1000 edit every 10th", from: keyed(ids), to: keyed(ids, (i) => (i % 10 ? `Row ${i}` : `Row ${i}!`)) },
		{ name: "keyed 1000 remove first", from: keyed(ids), to: keyed(ids.slice(1)) },
		{ name: "keyed 1000 insert first", from: keyed(ids), to: keyed([-1, ...ids]) },
		{ name: "keyed 1000 swap 2", from: keyed(ids), to: keyed(ids.map((i) => (i === 1 ? 998 : i === 998 ? 1 : i))) },
		{ name: "keyed 1000 reverse", from: keyed(ids), to: keyed(ids.slice().reverse()) },
		{ name: "keyed 1000 shuffle", from: keyed(ids), to: keyed(shuffled) },
		{ name: "keyed 1000 replace all", from: keyed(ids), to: keyed(ids.map((i) => i + N)) },
		{ name: "unkeyed 1000 unchanged", from: unkeyed(ids), to: unkeyed(ids) },
		{ name: "unkeyed 1000 edit all", from: unkeyed(ids), to: unkeyed(ids, (i) => `Row ${i}!`) },
		{ name: "unkeyed 1000 edit every 10th", from: unkeyed(ids), to: unkeyed(ids, (i) => (i % 10 ? `Row ${i}` : `Row ${i}!`)) },
		{ name: "unkeyed 1000 append 1", from: unkeyed(ids), to: unkeyed([...ids, N]) },
		{ name: "unkeyed 1000 remove first", from: unkeyed(ids), to: unkeyed(ids.slice(1)) },
		{ name: "unkeyed 1000 reverse", from: unkeyed(ids), to: unkeyed(ids.slice().reverse()) },
		{ name: "table 500 keyed edit all", from: `<table><tbody>${range(500).map((i) => row(i)).join("")}</tbody></table>`, to: `<table><tbody>${range(500).map((i) => row(i, true)).join("")}</tbody></table>` },
		{ name: "table 500 unkeyed edit all", from: `<table><tbody>${range(500).map((i) => urow(i)).join("")}</tbody></table>`, to: `<table><tbody>${range(500).map((i) => urow(i, true)).join("")}</tbody></table>` },
		{ name: "cards 300 edit every 5th", from: `<main>${range(300).map((i) => card(i)).join("")}</main>`, to: `<main>${range(300).map((i) => card(i, i % 5 === 0)).join("")}</main>` },
		{ name: "cards 300 insert 10 at front", from: `<main>${range(300).map((i) => card(i)).join("")}</main>`, to: `<main>${range(-10, 0).concat(range(300)).map((i) => card(i)).join("")}</main>` },
		{ name: "2000 small parents edit", from: `<div>${range(2000).map((i) => `<div><span>${i}</span></div>`).join("")}</div>`, to: `<div>${range(2000).map((i) => `<div><span>${i + 1}</span></div>`).join("")}</div>` },
		{ name: "attr churn 1000", from: `<div>${range(1000).map((i) => `<i class="a${i % 3}" data-x="${i}"></i>`).join("")}</div>`, to: `<div>${range(1000).map((i) => `<i class="a${(i + 1) % 3}" data-x="${i}" title="t"></i>`).join("")}</div>` },
		{ name: "deep 200 x depth 10 edit", from: `<div>${range(200).map((i) => nested(10, i)).join("")}</div>`, to: `<div>${range(200).map((i) => nested(10, i + "!")).join("")}</div>` },
		{ name: "identical 1000 parent attr", from: `<ul class="a">${"<li>x</li>".repeat(1000)}</ul>`, to: `<ul class="b">${"<li>x</li>".repeat(1000)}</ul>` },
		{ name: "icons 1000 one changed", from: `<div>${range(1000).map((i) => `<i class="icon"></i>`).join("")}</div>`, to: `<div>${range(1000).map((i) => `<i class="${i === 500 ? "icon on" : "icon"}"></i>`).join("")}</div>` },
		{ name: "links 500 hrefs change", from: `<nav>${range(500).map((i) => `<a href="/a/${i}">Link ${i}</a>`).join("")}</nav>`, to: `<nav>${range(500).map((i) => `<a href="/b/${i}">Link ${i}</a>`).join("")}</nav>` },
		{ name: "links 500 text change", from: `<nav>${range(500).map((i) => `<a href="/a/${i}">Link ${i}</a>`).join("")}</nav>`, to: `<nav>${range(500).map((i) => `<a href="/a/${i}">Link ${i}!</a>`).join("")}</nav>` },
		{ name: "inputs 300 renamed", from: `<form>${range(300).map((i) => `<input name="a${i}">`).join("")}</form>`, to: `<form>${range(300).map((i) => `<input name="b${i}">`).join("")}</form>` },
		{ name: "tiny append", from: unkeyed(range(3)), to: unkeyed(range(4)) },
		{ name: "tiny text edit", from: "<div><p>Hello</p></div>", to: "<div><p>World</p></div>" },
		{
			name: "form 200 checkboxes preserve",
			from: `<form>${range(200).map((i) => `<label><input type="checkbox" name="c${i}"> C${i}</label>`).join("")}</form>`,
			to: `<form>${range(200).map((i) => `<label><input type="checkbox" name="c${i}"${i % 7 ? "" : " checked"}> C${i}</label>`).join("")}</form>`,
			options: { preserveChanges: true },
			setup: (root) => root.querySelectorAll("input").forEach((e, i) => { if (i % 3 === 0) e.checked = true }),
		},
		{
			name: "form 200 text inputs dirty",
			from: `<form>${range(200).map((i) => `<input name="f${i}" value="v${i}">`).join("")}</form>`,
			to: `<form>${range(200).map((i) => `<input name="f${i}" value="w${i}">`).join("")}</form>`,
			options: { preserveChanges: true },
			setup: (root) => root.querySelectorAll("input").forEach((e, i) => { if (i % 2 === 0) e.value += "x" }),
		},
		{
			name: "unnamed checkboxes 100 dirty",
			from: `<div>${range(100).map((i) => `<label><input type="checkbox"> C${i}</label>`).join("")}</div>`,
			to: `<div>${range(100).map((i) => `<label><input type="checkbox"> C${i}</label>`).join("")}<p>new</p></div>`,
			options: { preserveChanges: true },
			setup: (root) => root.querySelectorAll("input").forEach((e, i) => { if (i % 2 === 0) e.checked = true }),
		},
	]
})()
