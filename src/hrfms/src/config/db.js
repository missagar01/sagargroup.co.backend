const { getPgPool } = require("../../../../config/pg.js");
const { types } = require("pg");

// Keep DATE values as YYYY-MM-DD strings for HRFMS APIs.
types.setTypeParser(1082, (str) => str);

function getValidPool() {
  let p = getPgPool();
  if (p && (p._ending || p._ended)) {
    p = getPgPool();
  }
  return p;
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

module.exports = new Proxy(pool, {
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
