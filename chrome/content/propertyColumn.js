class PropertyColumnsPlugin {
  constructor(rootURI) {
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
        notify: async (event, type, ids, extraData) => {
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
        await Zotero.ItemTreeManager.unregisterColumn(key);
      } catch (e) {}
    }
    this._columnKeys.clear();
    this._initialized = false;
  }

  async _refreshColumns() {
    try {
      const propertyNames = await this._discoverPropertyNames();
      const desired = new Set(propertyNames);

      for (const name of this._columnKeys.keys()) {
        if (!desired.has(name)) {
          try {
            await Zotero.ItemTreeManager.unregisterColumn(
              this._columnKeys.get(name),
            );
          } catch (e) {}
          this._columnKeys.delete(name);
        }
      }

      for (const name of propertyNames) {
        if (!this._columnKeys.has(name)) {
          await this._registerColumn(name);
        }
      }
    } catch (e) {
      Zotero.debug(
        "[PropertyColumns] ERROR in _refreshColumns: " + e + "\n" + e.stack,
      );
    }
  }

  async _discoverPropertyNames() {
    const names = new Set();
    const libraryID = Zotero.Libraries.userLibraryID;
    const s = new Zotero.Search();
    s.libraryID = libraryID;
    s.addCondition("noChildren", "true", "");
    const ids = await s.search();
    const items = await Zotero.Items.getAsync(ids);
    for (const item of items) {
      for (const { tag } of item.getTags()) {
        const parsed = this._parsePropertyTag(tag);
        if (parsed) names.add(parsed.name);
      }
    }
    return [...names].sort();
  }

  async _registerColumn(propertyName) {
    try {
      const registeredKey = await Zotero.ItemTreeManager.registerColumn({
        dataKey: "propcol_" + propertyName.replace(/[^a-zA-Z0-9_]/g, "_"),
        label: propertyName,
        pluginID: "property-columns@zotero-plugin.local",
        dataProvider: (item, _key) => {
          for (const { tag } of item.getTags()) {
            const parsed = this._parsePropertyTag(tag);
            if (parsed && parsed.name === propertyName) return parsed.value;
          }
          return "";
        },
        flex: 1,
      });
      this._columnKeys.set(propertyName, registeredKey);
    } catch (e) {
      Zotero.debug(
        "[PropertyColumns] ERROR registering column '" +
          propertyName +
          "': " +
          e,
      );
    }
  }

  _parsePropertyTag(tag) {
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
