import Session from "../models/Session.js";
export function sessionDouble() {
  const originals = Object.fromEntries(["findOne", "findOneAndUpdate", "create", "updateOne"].map(k => [k, Session[k]]));
  const rows = [];
  const copy = value => value ? structuredClone(value) : value;
  function matches(row, query) {
    return Object.entries(query).every(([key, value]) => {
      if (key === "$or") return value.some(q => matches(row, q));
      const actual = row[key];
      if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([op, operand]) => {
        if (op === "$gt") return actual > operand;
        if (op === "$lt") return actual < operand;
        if (op === "$elemMatch") return actual?.some(c => matches(c, operand));
        throw Error(`Unsupported session filter ${op}`);
      });
      if (value instanceof Date) return +actual === +value;
      return value === null ? actual == null : actual === value;
    });
  }
  Session.findOne = async query => copy(rows.find(row => matches(row, query)) || null);
  Session.create = async row => {
    if (rows.some(r => r.userId === row.userId || r.sessionId === row.sessionId)) throw { code: 11000 };
    rows.push(copy(row)); return copy(row);
  };
  Session.findOneAndUpdate = async (query, change) => {
    const row = rows.find(row => matches(row, query));
    if (!row) return null;
    Object.assign(row, copy(change.$set || {}));
    if (change.$push?.challenges) row.challenges = [...row.challenges, ...copy(change.$push.challenges.$each)].slice(change.$push.challenges.$slice);
    return copy(row);
  };
  Session.updateOne = async (q, change) => ({ modifiedCount: await Session.findOneAndUpdate(q, change) ? 1 : 0 });
  return { rows, restore: () => Object.assign(Session, originals) };
}
