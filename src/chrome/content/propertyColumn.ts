class PropertyColumnsPlugin {
  private rootURI: string;
  private _columnKeys: Map<string, string>;
  private _notifierID: string | null;
  private _initialized: boolean;

  constructor(rootURI: string) {
    this.rootURI = rootURI;
    this._columnKeys = new Map();
    this._notifierID = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    await Zotero.initializationPromise;
    await this._refreshColumns();

    this._notifierID = Zotero.Notifier.registerObserver(
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
            await this._refreshColumns();
          }
        },
      },
      ["item", "collection-item"],
      "PropertyColumns",
    );
  }

  async destroy() {
    if (this._notifierID) {
      Zotero.Notifier.unregisterObserver(this._notifierID);
      this._notifierID = null;
    }
    for (const [name, key] of this._columnKeys) {
      try {
        await Zotero.ItemTreeManager.unregisterColumns(key);
      } catch (e) {
        // ignore unregister errors
      }
    }
    this._columnKeys.clear();
    this._initialized = false;
  }

  private async _refreshColumns() {
    try {
      const propertyNames = await this._discoverPropertyNames();
      const desired = new Set(propertyNames);

      for (const name of this._columnKeys.keys()) {
        if (!desired.has(name)) {
          try {
            await Zotero.ItemTreeManager.unregisterColumns(
              this._columnKeys.get(name) as string,
            );
          } catch (e) {
            // ignore unregister errors
          }
          this._columnKeys.delete(name);
        }
      }

      for (const name of propertyNames) {
        if (!this._columnKeys.has(name)) {
          await this._registerColumn(name);
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

  private async _discoverPropertyNames() {
    const names = new Set<string>();
    const libraryID = Zotero.Libraries.userLibraryID;
    const search = new Zotero.Search();

    search.addCondition("noChildren", "true", "");
    search.addCondition("libraryID", "is", String(libraryID));

    const ids = await search.search();
    const items = await Zotero.Items.getAsync(ids);
    for (const item of items) {
      for (const { tag } of item.getTags()) {
        const parsed = this._parsePropertyTag(tag);
        if (parsed) names.add(parsed.name);
      }
    }
    return [...names].sort();
  }

  private async _registerColumn(propertyName: string) {
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
            const parsed = this._parsePropertyTag(tag);
            if (parsed && parsed.name === propertyName) return parsed.value;
          }
          return "";
        },
        flex: 1,
      });

      if (registeredKey == false) throw Error("No column registered");

      this._columnKeys.set(propertyName, registeredKey);
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

  private _parsePropertyTag(tag: string) {
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

(
  globalThis as { PropertyColumnsPlugin?: typeof PropertyColumnsPlugin }
).PropertyColumnsPlugin = PropertyColumnsPlugin;
