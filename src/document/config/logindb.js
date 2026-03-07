import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getLoginPool } = require("../../../config/pg.js");

function getValidPool() {
  let p = getLoginPool();
  if (p && (p._ending || p._ended)) {
    p = getLoginPool();
  }
  return p;
}

const loginPool = {
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

const proxyLoginPool = new Proxy(loginPool, {
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

export default proxyLoginPool;
