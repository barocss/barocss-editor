/**
 * Notion HTML cleaning utility
 *
 * HTML copied from Notion pages includes data-*, class-based block metadata
 * and wrapper divs, etc. This class performs minimal cleaning to make it
 * easier for HTMLConverter to parse.
 */
export class NotionHTMLCleaner {
  /**
   * Cleans Notion HTML.
   *
   * @param html Original HTML copied from Notion
   * @returns Cleaned HTML (based on body inner content)
   */
  clean(html: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (!doc.body) {
      return html;
    }

    // Remove style / script tags
    this._removeElements(doc.body, ['style', 'script']);

    // Notion usually has multiple div blocks at the top level,
    // and each div represents one block.
    // Here, we keep the wrapper as a whole, but leave unnecessary style/class as-is
    // and let subsequent parser rules utilize data-*, class.

    return doc.body.innerHTML;
  }

  private _removeElements(root: Element, tagNames: string[]): void {
    for (const tag of tagNames) {
      const elements = root.getElementsByTagName(tag);
      for (let i = elements.length - 1; i >= 0; i--) {
        elements[i].remove();
      }
    }
  }
}


