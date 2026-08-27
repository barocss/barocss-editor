/**
 * What a product's **menubar** offers, as data.
 *
 * ## Why the shape is shared and the content is not
 *
 * The same split `PanelRow` already makes. *Which* commands a product puts in 파일 is a fact about
 * that product — a deck saves to a library and a page publishes to an address — but *what a menu
 * entry is* is the same everywhere: a name, something it runs, and the chord it is bound to. Three
 * products each declaring their own `MenuEntry` interface is the fault this repository keeps
 * finding, one layer up from the one it usually finds it at.
 *
 * ## Why it is declared at all
 *
 * Because a surface that declares nothing cannot be asked, and the harness has now found that four
 * times. The menubar is the fourth place a reader can reach a command — after the toolbar, the
 * keyboard and the panel — and it arrived carrying capabilities that had been parked on `window`
 * for want of anywhere to put them: `window.exportSite` in the site builder, `window.wordPrintPages`
 * in Word. `every-command-can-be-reached` counts commands, so a capability that is not one is
 * invisible to every check here; declaring the surface is what starts the question being asked.
 *
 * ## The one thing an entry may be that is not a command
 *
 * A **view**. How many boards a reader has open, whether the outline pane is showing, whether they
 * are presenting — none of those is a fact about the document, so none of them is a command, and an
 * entry that declared one would be telling the harness a command exists which does not.
 *
 * Answered by the app in one `switch`, which is the same contract `PropertySheet` has with a
 * product's own control kinds: the model says *what*, and the layer that knows the window says *how*.
 */

export interface MenuEntryModel {
  /** The command a pick runs — everything that changes the **document**. */
  command?: string;
  /** Or what a **view** entry means, answered by the app. Exactly one of the two. */
  view?: string;
  /** What it is given, when the entry is one case of a command. */
  payload?: Record<string, unknown>;
  label: string;
  /** The chord, drawn beside the name — this is where a reader learns one. */
  hint?: string;
  /**
   * That this entry acts on **something only the app knows** — the page open, the slide on screen.
   *
   * Declared rather than left to the app to guess, because the alternative was measured in the site
   * builder and it is a dead menu entry: a command whose `canExecute` needs a `nodeId` is greyed
   * *forever* from a menubar that sends none. An entry that can never be enabled is worse than one
   * that is not there.
   */
  needs?: string;
}

export interface MenuBlockModel {
  id: string;
  items: MenuEntryModel[];
}

export interface MenuModel {
  id: string;
  /** What the trigger says — 파일, 편집, 보기. */
  label: string;
  blocks: MenuBlockModel[];
}

/** Every command a menubar can run — the harness's question, answered by the model. */
export function menuCommands(menus: MenuModel[]): string[] {
  return [
    ...new Set(
      menus.flatMap((menu) =>
        menu.blocks.flatMap((block) =>
          block.items.map((one) => one.command).filter((one): one is string => !!one)
        )
      )
    )
  ];
}

/** The id an entry is drawn with, so the model and the app agree on one name. */
export function menuId(menu: MenuModel, block: MenuBlockModel, index: number): string {
  return `${menu.id}.${block.id}.${index}`;
}

/** One entry, by that id. */
export function menuEntry(menus: MenuModel[], id: string): MenuEntryModel | undefined {
  for (const menu of menus) {
    for (const block of menu.blocks) {
      for (const [index, item] of block.items.entries()) {
        if (menuId(menu, block, index) === id) return item;
      }
    }
  }
  return undefined;
}

/**
 * What is wrong with a menubar's declaration, said once for every product that has one.
 *
 * Three faults, each of which was met while building the first one:
 *
 * - an entry that is **neither** a command nor a view says nothing a reader can act on;
 * - an entry that is **both** is a product that has not decided whether it changes the document;
 * - two entries with **one name** is a reader asking which of them they used last time. An
 *   accessible name has to be unique in a menubar the same way it does in a panel.
 */
export function menuFaults(menus: MenuModel[]): string[] {
  const faults: string[] = [];
  const seen = new Set<string>();

  for (const menu of menus) {
    for (const block of menu.blocks) {
      for (const item of block.items) {
        const where = `${menu.label} › ${item.label}`;
        if (Boolean(item.command) === Boolean(item.view)) {
          faults.push(`${where} — an entry runs a command or changes a view, and says exactly one`);
        }
        if (!item.label.trim()) faults.push(`${menu.label} — an entry with no name`);
        if (seen.has(item.label)) faults.push(`${where} — two entries called the same thing`);
        seen.add(item.label);
      }
    }
  }
  return faults;
}
