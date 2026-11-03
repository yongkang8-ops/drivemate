import type { Locator } from "@playwright/test";

// Reproduce Chrome Translate's observed replacement of React-owned text nodes.
export async function replaceTranslatedText(panel: Locator) {
  await panel.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent?.trim() && !node.parentElement?.closest('[translate="no"], .notranslate, svg')) nodes.push(node);
    }
    for (const node of nodes) {
      const outer = document.createElement("font");
      const inner = document.createElement("font");
      inner.textContent = node.textContent;
      outer.append(inner);
      node.replaceWith(outer);
    }
  });
}
