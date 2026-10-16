import type { BrowserContext, Page } from "@playwright/test";

/**
 * Everything the browser keeps for the page: cookies, localStorage,
 * sessionStorage and IndexedDB (values, and ciphertext bytes read as text).
 */
export async function storageDump(page: Page, context: BrowserContext) {
  const pageData = await page.evaluate(async () => {
    const web = [localStorage, sessionStorage]
      .flatMap((s) =>
        Array.from({ length: s.length }, (_, i) => {
          const key = s.key(i)!;
          return `${key}=${s.getItem(key)}`;
        }),
      )
      .join("\n");
    const idb: string[] = [];
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const values = await new Promise<unknown[]>((resolve, reject) => {
          const request = db
            .transaction(store, "readonly")
            .objectStore(store)
            .getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        for (const value of values) {
          if (value instanceof CryptoKey) {
            idb.push(`CryptoKey extractable=${value.extractable}`);
            continue;
          }
          const { ciphertext } = (value ?? {}) as { ciphertext?: ArrayBuffer };
          idb.push(
            ciphertext
              ? new TextDecoder().decode(ciphertext)
              : JSON.stringify(value),
          );
        }
      }
      db.close();
    }
    return { web, idb: idb.join("\n") };
  });
  const cookies = (await context.cookies())
    .map((c) => `${c.name}=${c.value}`)
    .join("\n");
  return `${cookies}\n${pageData.web}\n${pageData.idb}`;
}

/** Block models.dev and OpenRouter, so the settings use public/models.json. */
export async function useStaticCatalog(page: Page) {
  await page.route(/^https:\/\/(models\.dev|openrouter\.ai)\//, (route) =>
    route.abort(),
  );
}
