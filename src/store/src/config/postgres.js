import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getPgPool: getSharedPgPool } = require("../../../../config/pg.js");

function getValidPool() {
  let p = getSharedPgPool();
  if (p && (p._ending || p._ended)) {
    p = getSharedPgPool();
  }
  return p;
}

export function getPgPool() {
  return getValidPool();
}

export async function withPgClient(handler) {
  const client = await getValidPool().connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

export async function withPgTransaction(handler) {
  return withPgClient(async (client) => {
    try {
      await client.query("BEGIN");
      const result = await handler(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

const pool = {
  query: async function (text, params) {
    const p = getValidPool();
    return p.query(text, params);
  },
  connect: async function () {
    const p = getValidPool();
    return p.connect();
  },
  end: function () {
    const p = getValidPool();
    return p.end ? p.end() : Promise.resolve();
  },
};

const proxyPool = new Proxy(pool, {
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }
    const p = getValidPool();
    const value = p[prop];
    if (typeof value === "function") {
      return value.bind(p);
    }
    return value;
  },
});

export default proxyPool;
