// The fake server's data: one JSON file, replaced atomically on every change so
// a crash can't leave it half-written.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const EMPTY = { riders: [], heats: [], feedback: [] };

export function createStore(file) {
  let data = existsSync(file) ? { ...EMPTY, ...JSON.parse(readFileSync(file, "utf8")) } : structuredClone(EMPTY);
  return {
    get data() {
      return data;
    },
    // fn changes a copy of the data; the copy is saved and becomes current.
    update(fn) {
      const next = structuredClone(data);
      const result = fn(next);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
      renameSync(`${file}.tmp`, file);
      data = next;
      return result;
    },
  };
}
