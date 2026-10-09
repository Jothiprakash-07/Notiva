import Item from "../models/Item.js";
import DeletedItem from "../models/DeletedItem.js";
import { readItemDeletions } from "../services/itemDeletions.js";
import { publicItem, validateItemBody, validClientItemId } from "../services/itemData.js";

const fail = (res, code, message) => res.status(code).json({ success: false, message });
const scope = req => ({ ownerUserId: req.user._id, clientItemId: req.params.clientItemId });
const errorResponse = (res, error) => {
  if (error.code === 11000) return fail(res, 409, "An item with this ID already exists.");
  if (["ValidationError", "CastError", "StrictModeError"].includes(error.name)) return fail(res, 400, "Invalid item.");
  return fail(res, 503, "Item service unavailable. Try again.");
};
export async function getItemDeletions(req, res) {
  const value = req.query.since;
  if (value !== undefined && (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)))) {
    return fail(res, 400, "Invalid deletion cursor.");
  }
  try {
    const result = await readItemDeletions(req.user._id, value ? new Date(value) : undefined);
    return res.json({ success: true, ...result });
  } catch (error) { return errorResponse(res, error); }
}
export async function createItem(req, res) {
  const invalid = validateItemBody(req.body);
  if (invalid) return fail(res, 400, invalid);
  const { id, clientItemId, ...data } = req.body;
  try {
    // Preserve tombstone duplicate protection after the payload is purged.
    if (await DeletedItem.exists({ ownerUserId: req.user._id, clientItemId: clientItemId ?? id })) {
      return fail(res, 409, "An item with this ID already exists.");
    }
    const item = await Item.create({ ...data, clientItemId: clientItemId ?? id, ownerUserId: req.user._id });
    // The first lookup may have raced with archive creation and payload removal.
    // Soft-delete only this newly inserted document if its ID became retired.
    if (await DeletedItem.exists({ ownerUserId: req.user._id, clientItemId: clientItemId ?? id })) {
      await Item.findOneAndUpdate({ _id: item._id, deletedAt: null },
        { $set: { deletedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: "after", runValidators: true });
      return fail(res, 409, "An item with this ID already exists.");
    }
    return res.status(201).json({ success: true, item: publicItem(item) });
  } catch (error) { return errorResponse(res, error); }
}
export async function getItems(req, res) {
  try {
    const items = await Item.find({ ownerUserId: req.user._id, deletedAt: null });
    return res.json({ success: true, items: items.map(publicItem) });
  } catch (error) { return errorResponse(res, error); }
}
export async function getItem(req, res) {
  if (!validClientItemId(req.params.clientItemId)) return fail(res, 400, "Invalid clientItemId.");
  try {
    const item = await Item.findOne({ ...scope(req), deletedAt: null });
    if (!item) return fail(res, 404, "Item not found.");
    return res.json({ success: true, item: publicItem(item) });
  } catch (error) { return errorResponse(res, error); }
}
export async function updateItem(req, res) {
  const invalid = validateItemBody(req.body, true);
  if (invalid || !validClientItemId(req.params.clientItemId)) return fail(res, 400, invalid || "Invalid clientItemId.");
  try {
    const values = { ...req.body }, unset = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === null && !["category", "priority", "alertBefore"].includes(key)) { unset[key] = 1; delete values[key]; }
    }
    const item = await Item.findOneAndUpdate({ ...scope(req), deletedAt: null },
      { $set: values, ...(Object.keys(unset).length ? { $unset: unset } : {}), $inc: { revision: 1 } }, { returnDocument: "after", runValidators: true });
    if (!item) return fail(res, 404, "Item not found.");
    return res.json({ success: true, item: publicItem(item) });
  } catch (error) { return errorResponse(res, error); }
}
export async function deleteItem(req, res) {
  if (!validClientItemId(req.params.clientItemId)) return fail(res, 400, "Invalid clientItemId.");
  try {
    const item = await Item.findOneAndUpdate({ ...scope(req), deletedAt: null },
      { $set: { deletedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: "after", runValidators: true });
    // A retried delete succeeds without incrementing an existing tombstone.
    if (!item && !await Item.findOne(scope(req))) return fail(res, 404, "Item not found.");
    return res.json({ success: true });
  } catch (error) { return errorResponse(res, error); }
}
