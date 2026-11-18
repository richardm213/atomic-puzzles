// Read the public forum in a normal Firefox session when HTTP receives a challenge.
export async function createForumBrowserReader() {
  const { firefox } = await import("playwright");
  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage();
  return {
    async read(url) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForSelector(".forum-post__message-source", {
        state: "attached",
        timeout: 20_000,
      });
      const expected = new URL(url);
      const actual = new URL(page.url());
      if (
        actual.origin !== expected.origin ||
        actual.pathname !== expected.pathname ||
        actual.searchParams.get("page") !== expected.searchParams.get("page")
      )
        throw new Error("Forum browser left the requested Lichess page");
      return page.content();
    },
    close: () => browser.close(),
  };
}
