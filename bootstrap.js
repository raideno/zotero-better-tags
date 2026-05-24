var PropertyColumns;

async function startup({ id, version, rootURI }, reason) {
  Zotero.debug(
    "[PropertyColumns] bootstrap startup() called, version " + version,
  );
  try {
    Services.scriptloader.loadSubScript(
      rootURI + "chrome/content/propertyColumns.js",
    );
    Zotero.debug("[PropertyColumns] Script loaded OK");
    PropertyColumns = new PropertyColumnsPlugin(rootURI);
    await PropertyColumns.init();
  } catch (e) {
    Zotero.debug(
      "[PropertyColumns] FATAL ERROR in startup: " + e + "\n" + e.stack,
    );
  }
}

async function shutdown({ id, version, rootURI }, reason) {
  Zotero.debug("[PropertyColumns] bootstrap shutdown() called");
  if (PropertyColumns) {
    await PropertyColumns.destroy();
    PropertyColumns = undefined;
  }
}

function install(data, reason) {}
function uninstall(data, reason) {}
