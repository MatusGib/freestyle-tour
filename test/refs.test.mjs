import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRefs, resolvePath } from "../tools/refs.mjs";

const sorted = (refs) => [...refs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

test("resolvePath resolves relative paths and rejects other hosts", () => {
  assert.equal(resolvePath("/_next/static/chunks/a.js", "./b.js"), "/_next/static/chunks/b.js");
  assert.equal(resolvePath("/x/y.css", "../f.ttf"), "/f.ttf");
  assert.equal(resolvePath("/a.js", "https://example.com/x.js"), null);
});

test("HTML: src and href attributes are hard references; the page itself and other hosts are skipped", () => {
  const html = `<link rel="stylesheet" href="/_next/static/css/a.css" data-rsc-css-href="/x.css"/><script src="/_next/static/chunks/b.js"></script><a href="/">home</a><a href="https://example.com/">x</a><img src="/wordmark.svg">`;
  assert.deepEqual(sorted(extractRefs("/", html)), [
    { path: "/_next/static/chunks/b.js", hard: true },
    { path: "/_next/static/css/a.css", hard: true },
    { path: "/wordmark.svg", hard: true },
  ]);
});

test("modules: imports and _next paths are hard; guessed chunk names and root files are soft", () => {
  const js = `import{a as b}from"./dep-AAAAAAAA.js";const m=["_next/static/chunks/lazy-BBBBBBBB.js"];import("./scene-CCCCCCCC.js");x="named-DDDDDDDD.js";y="/fonts/f.ttf";z="//other.example/p.png";`;
  assert.deepEqual(sorted(extractRefs("/_next/static/chunks/page-XXXXXXXX.js", js)), [
    { path: "/_next/static/chunks/dep-AAAAAAAA.js", hard: true },
    { path: "/_next/static/chunks/lazy-BBBBBBBB.js", hard: true },
    { path: "/_next/static/chunks/named-DDDDDDDD.js", hard: false },
    { path: "/_next/static/chunks/scene-CCCCCCCC.js", hard: true },
    { path: "/fonts/f.ttf", hard: false },
  ]);
});

test("stylesheets: url() references are hard; data URLs are skipped", () => {
  const css = `@font-face{src:url(/fonts/oswald.ttf)}.a{background:url("img/bg.png")}.b{background:url(data:image/png;base64,AAA)}`;
  assert.deepEqual(sorted(extractRefs("/_next/static/css/a.css", css)), [
    { path: "/_next/static/css/img/bg.png", hard: true },
    { path: "/fonts/oswald.ttf", hard: true },
  ]);
});

test("other files have no references", () => {
  assert.deepEqual(extractRefs("/fonts/f.ttf", `url(/x.png) "/y.svg"`), []);
});
