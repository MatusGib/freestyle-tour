// Prepares the snapshot's page for local use. Cloudflare's bot-check script is
// removed (it only exists on fristajlo.ws) and the mod loader is added right
// after <head>, so it runs before the game's own modules.
export const LOADER_TAG = '<script type="module" src="/__mods/loader.js"></script>';

export function prepareHtml(html) {
  if (!html.includes("<head>")) throw new Error("The snapshot page has no <head> tag");
  const withoutBotCheck = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (tag) => (tag.includes("/cdn-cgi/challenge-platform/") ? "" : tag));
  return withoutBotCheck.replace("<head>", `<head>${LOADER_TAG}`);
}
