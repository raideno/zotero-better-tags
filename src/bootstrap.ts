type PropertyColumnsInstance = {
  init: () => Promise<void>;
  destroy: () => Promise<void>;
};

const ServicesAPI = Services as unknown as {
  scriptloader: { loadSubScript: (uri: string) => void };
};
const ZoteroAPI = Zotero

let PropertyColumns: PropertyColumnsInstance | undefined;

async function startup(
  { id, version, rootURI }: { id: string; version: string; rootURI: string },
  reason: string,
): Promise<void> {
  ZoteroAPI.debug(
    "[PropertyColumns] bootstrap startup() called, version " + version,
  );
  try {
    ServicesAPI.scriptloader.loadSubScript(
      rootURI + "chrome/content/propertyColumn.js",
    );
    ZoteroAPI.debug("[PropertyColumns] Script loaded OK");
    const PropertyColumnsPlugin = (globalThis as any)
      .PropertyColumnsPlugin as new (rootURI: string) => PropertyColumnsInstance;
    PropertyColumns = new PropertyColumnsPlugin(rootURI);
    await PropertyColumns.init();
  } catch (e) {
    const error = e as Error;
    ZoteroAPI.debug(
      "[PropertyColumns] FATAL ERROR in startup: " +
        error +
        "\n" +
        error.stack,
    );
  }
}

async function shutdown(
  { id, version, rootURI }: { id: string; version: string; rootURI: string },
  reason: string,
): Promise<void> {
  ZoteroAPI.debug("[PropertyColumns] bootstrap shutdown() called");
  if (PropertyColumns) {
    await PropertyColumns.destroy();
    PropertyColumns = undefined;
  }
}

function install(data: unknown, reason: string): void {}
function uninstall(data: unknown, reason: string): void {}
