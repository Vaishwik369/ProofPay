// Tiny JSON-file store so judges can run the project with zero database setup.
import fs from 'node:fs';

const FILE = process.env.DATA_FILE || './data.json';

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { mandates: {} };
  }
}
function save(db) {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

export const store = {
  all: () => Object.values(load().mandates).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: (id) => load().mandates[id] || null,
  put: (m) => {
    const db = load();
    db.mandates[m.id] = m;
    save(db);
    return m;
  },
};
