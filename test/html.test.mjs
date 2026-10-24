import { test } from "node:test";
import assert from "node:assert/strict";
import { LOADER_TAG, prepareHtml } from "../server/html.mjs";

const PAGE = `<!doctype html><html><head><script src="/_next/static/chunks/a.js"></script></head><body><header class="topbar"></header><script>self.__x=1</script><script>(function(){var s='/cdn-cgi/challenge-platform/scripts/jsd/main.js'})()</script></body></html>`;

test("the loader goes right after <head>, once", () => {
  const html = prepareHtml(PAGE);
  assert.ok(html.startsWith(`<!doctype html><html><head>${LOADER_TAG}<script src="/_next/static/chunks/a.js">`));
  assert.equal(html.split(LOADER_TAG).length - 1, 1);
  assert.ok(html.includes(`<header class="topbar"></header>`));
});

test("Cloudflare's bot check is removed and other scripts stay", () => {
  const html = prepareHtml(PAGE);
  assert.ok(!html.includes("/cdn-cgi/"));
  assert.ok(html.includes("<script>self.__x=1</script>"));
});

test("a page without <head> is refused", () => {
  assert.throws(() => prepareHtml("<html><body></body></html>"), /no <head> tag/);
});
