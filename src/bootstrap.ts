class PropertyColumnsPlugin {
  private rootURI: string;
  private columnKeys: Map<string, string>;
  private observer: string | null;
  private isInitialized: boolean;

  constructor(rootURI: string) {
    this.rootURI = rootURI;
    this.columnKeys = new Map();
    this.observer = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    await Zotero.initializationPromise;
    await this.refresh();

    this.observer = Zotero.Notifier.registerObserver(
      {
        notify: async (
          event: string,
          type: string,
          ids: number[] | string[] | undefined,
          extraData: unknown,
        ) => {
          if (
            ["item", "collection-item"].includes(type) &&
            ["add", "modify", "delete", "trash"].includes(event)
          ) {
            await this.refresh();
          }
        },
      },
      ["item", "collection-item"],
      "PropertyColumns",
    );
  }

  async destroy() {
    if (this.observer) {
      Zotero.Notifier.unregisterObserver(this.observer);
      this.observer = null;
    }
    for (const [name, key] of this.columnKeys) {
      try {
        await Zotero.ItemTreeManager.unregisterColumns(key);
      } catch (e) {
        // ignore unregister errors
      }
    }
    this.columnKeys.clear();
    this.isInitialized = false;
  }

  private async refresh() {
    try {
      const propertyNames = await this.discoverPropertyNames();
      const desired = new Set(propertyNames);

      for (const [name, value] of this.columnKeys.entries()) {
        if (!desired.has(name)) {
          try {
            await Zotero.ItemTreeManager.unregisterColumns(
              value
            );
          } catch (e) {
            // ignore unregister errors
          }
          this.columnKeys.delete(name);
        }
      }

      for (const name of propertyNames) {
        if (!this.columnKeys.has(name)) {
          await this.registerColumn(name);
        }
      }
    } catch (e) {
      const error = e as Error;
      Zotero.debug(
        "[PropertyColumns] ERROR in _refreshColumns: " +
          error +
          "\n" +
          error.stack,
      );
    }
  }

  private async discoverPropertyNames() {
    const names = new Set<string>();
    const libraryID = Zotero.Libraries.userLibraryID;
    const search = new Zotero.Search();

    search.addCondition("noChildren", "true", "");
    search.addCondition("libraryID", "is", String(libraryID));

    const ids = await search.search();
    const items = await Zotero.Items.getAsync(ids);
    for (const item of items) {
      for (const { tag } of item.getTags()) {
        const parsed = this.parsePropertyTag(tag);
        if (parsed) names.add(parsed.name);
      }
    }
    return [...names].sort();
  }

  private async registerColumn(propertyName: string) {
    try {
      const registeredKey = await Zotero.ItemTreeManager.registerColumns({
        dataKey: "propcol_" + propertyName.replace(/[^a-zA-Z0-9_]/g, "_"),
        label: propertyName,
        pluginID: "property-columns@zotero-plugin.local",
        dataProvider: (
          item: { getTags: () => Array<{ tag: string }> },
          _key: string,
        ) => {
          for (const { tag } of item.getTags()) {
            const parsed = this.parsePropertyTag(tag);
            if (parsed && parsed.name === propertyName) return parsed.value;
          }
          return "";
        },
        flex: 1,
      });

      if (registeredKey == false) throw Error("No column registered");

      this.columnKeys.set(propertyName, registeredKey);
    } catch (e) {
      const error = e as Error;
      Zotero.debug(
        "[PropertyColumns] ERROR registering column '" +
          propertyName +
          "': " +
          error,
      );
    }
  }

  private parsePropertyTag(tag: string) {
    if (!tag.startsWith("property:")) return null;
    const rest = tag.slice("property:".length);
    const colonIdx = rest.indexOf(":");
    if (colonIdx === -1) return null;
    const name = rest.slice(0, colonIdx).trim();
    const value = rest.slice(colonIdx + 1).trim();
    if (!name) return null;
    return { name, value };
  }
}

let PropertyColumns: PropertyColumnsPlugin | undefined;

async function startup(
  { id, version, rootURI }: { id: string; version: string; rootURI: string },
  reason: string,
) {
  Zotero.debug(
    "[PropertyColumns] bootstrap startup() called, version " + version,
  );
  try {
    PropertyColumns = new PropertyColumnsPlugin(rootURI);
    await PropertyColumns.init();
  } catch (e) {
    const error = e as Error;
    Zotero.debug(
      "[PropertyColumns] FATAL ERROR in startup: " + error + "\n" + error.stack,
    );
  }
}

async function shutdown(
  { id, version, rootURI }: { id: string; version: string; rootURI: string },
  reason: string,
) {
  Zotero.debug("[PropertyColumns] bootstrap shutdown() called");
  if (PropertyColumns) {
    await PropertyColumns.destroy();
    PropertyColumns = undefined;
  }
}

function install(data: unknown, reason: string): void {}
function uninstall(data: unknown, reason: string): void {}
