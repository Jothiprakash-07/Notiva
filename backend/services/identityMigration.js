import { NOTIVA_ID_COLLATION } from "./identity.js";
import User from "../models/user.js";

// Run before accepting requests. Keep the old unique index until its sparse
// replacement exists; no account records or legacy email addresses are removed.
export async function prepareIdentityIndexes() {
  const indexes = await User.collection.indexes().catch(error => {
    if (error.code === 26) return [];
    throw error;
  });
  const hasSparseEmail = indexes.some(index => index.key?.email === 1 && Object.keys(index.key).length === 1 && index.sparse && index.unique);
  if (!hasSparseEmail) await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true, name: "legacy_email_sparse" });
  for (const index of indexes) {
    if (index.key?.email === 1 && Object.keys(index.key).length === 1 && !index.sparse) await User.collection.dropIndex(index.name);
  }
  const identityIndexes = indexes.filter(index => index.key?.notivaId === 1 && Object.keys(index.key).length === 1);
  const hasCaseInsensitive = identityIndexes.some(index => index.unique && index.sparse &&
    index.collation?.locale === "en" && index.collation?.strength === 2);
  if (!hasCaseInsensitive) {
    await User.collection.createIndex({ notivaId: 1 }, { unique: true, sparse: true,
      name: "notivaId_case_insensitive", collation: NOTIVA_ID_COLLATION });
  }
  for (const index of identityIndexes) {
    if (!index.collation || index.collation.locale === "simple") await User.collection.dropIndex(index.name);
  }
}

export async function reconcileLegacyEmail(user) {
  if (user.recoveryEmail || !user.email) return user;
  const updated = await User.findOneAndUpdate(
    { _id: user._id, email: user.email, $or: [{ recoveryEmail: { $exists: false } }, { recoveryEmail: "" }, { recoveryEmail: null }] },
    { $set: { recoveryEmail: user.email, recoveryEmailVerified: false }, $unset: { recoveryEmailVerifiedAt: 1 } },
    { returnDocument: "after" },
  );
  return updated || await User.findById(user._id);
}
