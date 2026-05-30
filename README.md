# Zotero Better Tags

Simple Zotero plugin that improves tag workflows.

## Build

```zsh
npm install
npm run build
npm run pack
```

Outputs to `dist/`. The `pack` script generates `plugin.xpi` from `dist/`.

## Install

1. Open Zotero.
2. Go to Tools -> Add-ons.
3. Click the gear icon -> Install Add-on From File.
4. Select `plugin.xpi`.
5. Restart Zotero if prompted.

## Usage

Add tags in the form `property:Name:Value` to any item. Each unique `Name` becomes a new column in the item list, and the cell value is the `Value` from that tag. You can use the new columns to better filter and visualize items in your collection or library.

Column labels use the prefix set in the Zotero preference `extensions.property-columns@zotero-plugin.local.columnPrefix`. Leave it empty for no prefix. If unset, the default prefix is `[Property] `.

Example tags:

```text
property:Status:Reading
property:Priority:High
```
