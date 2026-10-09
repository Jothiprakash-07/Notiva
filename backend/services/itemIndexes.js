import Item from "../models/Item.js";
import DeletedItem from "../models/DeletedItem.js";

// Explicit initialization before listening; never drop existing indexes/data.
export async function prepareItemIndexes() {
  for (const [keys, options] of Item.schema.indexes()) {
    await Item.collection.createIndex(keys, options);
  }
}

export async function prepareDeletedItemIndexes() {
  for (const [keys, options] of DeletedItem.schema.indexes()) {
    await DeletedItem.collection.createIndex(keys, options);
  }
}
