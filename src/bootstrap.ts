class PropertyColumnsPlugin {
  private rootURI: string;
  private columnKeys: Map<string, string>;
  private observer: string | null;
  private prefObserver: symbol | null;
  private isInitialized: boolean;
  private static readonly COLUMN_PREFIX_PREF =
    "extensions.property-columns@zotero-plugin.local.columnPrefix";
  private static readonly VALUE_SEPARATOR_PREF =
    "extensions.property-columns@zotero-plugin.local.valueSeparator";
  private static readonly DEFAULT_COLUMN_PREFIX = "[Property] ";
  private static readonly DEFAULT_VALUE_SEPARATOR = ", ";

  constructor(rootURI: string) {
    this.rootURI = rootURI;
    this.columnKeys = new Map();
    this.observer = null;
    this.prefObserver = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    await Zotero.initializationPromise;
    this.ensureColumnPrefixPref();
    this.ensureValueSeparatorPref();
    this.registerPrefObserver();
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
    if (this.prefObserver !== null) {
      Zotero.Prefs.unregisterObserver(this.prefObserver);
      this.prefObserver = null;
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
            await Zotero.ItemTreeManager.unregisterColumns(value);
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
        label: this.getColumnLabel(propertyName),
        pluginID: "property-columns@zotero-plugin.local",
        dataProvider: (
          item: { getTags: () => Array<{ tag: string }> },
          _key: string,
        ) => {
          const values: string[] = [];
          for (const { tag } of item.getTags()) {
            const parsed = this.parsePropertyTag(tag);
            if (parsed && parsed.name === propertyName) values.push(parsed.value);
          }
          if (!values.length) return "";
          return values.join(this.getValueSeparator());
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

  private getColumnLabel(propertyName: string) {
    const prefix = this.getColumnPrefix();
    if (!prefix) return propertyName;
    return prefix + propertyName;
  }

  private getColumnPrefix() {
    const value = Zotero.Prefs.get(PropertyColumnsPlugin.COLUMN_PREFIX_PREF);
    if (value === undefined || value === null)
      return PropertyColumnsPlugin.DEFAULT_COLUMN_PREFIX;
    return String(value);
  }

  private getValueSeparator() {
    const value = Zotero.Prefs.get(PropertyColumnsPlugin.VALUE_SEPARATOR_PREF);
    if (value === undefined || value === null)
      return PropertyColumnsPlugin.DEFAULT_VALUE_SEPARATOR;
    return String(value);
  }

  private ensureColumnPrefixPref() {
    const value = Zotero.Prefs.get(PropertyColumnsPlugin.COLUMN_PREFIX_PREF);
    if (value === undefined) {
      Zotero.Prefs.set(
        PropertyColumnsPlugin.COLUMN_PREFIX_PREF,
        PropertyColumnsPlugin.DEFAULT_COLUMN_PREFIX,
      );
    }
  }

  private ensureValueSeparatorPref() {
    const value = Zotero.Prefs.get(PropertyColumnsPlugin.VALUE_SEPARATOR_PREF);
    if (value === undefined) {
      Zotero.Prefs.set(
        PropertyColumnsPlugin.VALUE_SEPARATOR_PREF,
        PropertyColumnsPlugin.DEFAULT_VALUE_SEPARATOR,
      );
    }
  }

  private registerPrefObserver() {
    if (this.prefObserver !== null) return;
    this.prefObserver = Zotero.Prefs.registerObserver(
      PropertyColumnsPlugin.COLUMN_PREFIX_PREF,
      () => {
        void this.rebuildColumns();
      },
    );
  }

  private async rebuildColumns() {
    for (const key of this.columnKeys.values()) {
      try {
        await Zotero.ItemTreeManager.unregisterColumns(key);
      } catch (e) {
        // ignore unregister errors
      }
    }
    this.columnKeys.clear();
    await this.refresh();
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
