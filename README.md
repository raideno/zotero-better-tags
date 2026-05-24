# Zotero Better Tags

Simple Zotero plugin that improves tag workflows.

## Build

```zsh
zip -r plugin.xpi manifest.json bootstrap.js chrome/
```

## Install

1. Open Zotero.
2. Go to Tools -> Add-ons.
3. Click the gear icon -> Install Add-on From File.
4. Select `plugin.xpi`.
5. Restart Zotero if prompted.

## Usage

Add tags in the form `property:Name:Value` to any item. Each unique `Name` becomes a new column in the item list, and the cell value is the `Value` from that tag. You can use the new columns to better filter and visualize items in your collection or library.

Example tags:

```text
property:Status:Reading
property:Priority:High
```
