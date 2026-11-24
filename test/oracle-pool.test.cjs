const assert = require("node:assert/strict");
const { test } = require("node:test");

require("dotenv").config = () => ({ parsed: {} });
const ssh = require("../config/sshTunnel");
let session;
const listeners = new Set();
ssh.getTunnelSession = () => session;
ssh.onTunnelStateChange = (listener) => listeners.add(listener);
const { createOraclePool } = require("../config/oraclePool");

Object.assign(process.env, {
  SSH_HOST: "localhost",
  SSH_USER: "local-test",
  TEST_ORACLE_USER: "local-test",
  TEST_ORACLE_PASSWORD: "local-test",
  TEST_ORACLE_CONNECTION_STRING: "oracle-test.invalid/test",
  TEST_ORACLE_CONNECT_TIMEOUT: "1",
  TEST_ORACLE_QUEUE_TIMEOUT: "10",
});

function changeTunnel(port) {
  session = port ? { oracle: { port } } : null;
  for (const listener of listeners) listener({ type: port ? "connected" : "disconnected" });
}

function fakePool() {
  const state = { closed: [], released: [], probes: 0 };
  return {
    state,
    async getConnection() {
      return {
        async execute() { state.probes += 1; },
        async close(options) { state.released.push(options); },
      };
    },
    async close(seconds) { state.closed.push(seconds); },
  };
}

test("late Oracle creation is closed and cannot replace a newer tunnel generation", async () => {
  changeTunnel();
  const old = fakePool();
  const replacement = fakePool();
  let finishCreation;
  const creation = new Promise((resolve) => { finishCreation = resolve; });
  const calls = [];
  const manager = createOraclePool({
    async createPool(options) {
      calls.push(options);
      return calls.length === 1 ? creation : replacement;
    },
  }, "Test", "TEST", () => true);
  const obsolete = assert.rejects(manager.initPool(), /configuration changed/);
  changeTunnel(32152);
  const first = manager.initPool();
  assert.equal(first, manager.initPool());
  assert.equal(await first, replacement);
  assert.match(calls[1].connectString, /CONNECT_TIMEOUT=1/);
  assert.match(calls[1].connectString, /PORT=32152/);
  finishCreation(old);
  await obsolete;
  assert.deepEqual(old.state.closed, [0]);
  assert.equal(await manager.initPool(), replacement);
  await manager.closePool();
  assert.deepEqual(replacement.state.closed, [0]);
  listeners.clear();
});

test("Oracle saturation is returned to the caller without retiring the pool", async () => {
  changeTunnel(32153);
  const pool = fakePool();
  const manager = createOraclePool({
    async createPool() { return pool; },
  }, "Test", "TEST", () => true);
  await manager.initPool();
  const checkOut = pool.getConnection;
  pool.getConnection = async () => { throw Object.assign(new Error("queue deadline"), { code: "NJS-040" }); };
  await assert.rejects(manager.getConnection(), { code: "NJS-040" });
  assert.deepEqual(pool.state.closed, []);
  pool.getConnection = checkOut;
  const connection = await manager.getConnection();
  assert.equal(connection.callTimeout, 30000);
  await connection.close();
  await manager.closePool();
  listeners.clear();
});

test("failed Oracle probe closes the candidate and timed-out checkouts are dropped", async () => {
  changeTunnel(32154);
  const broken = fakePool();
  broken.getConnection = async () => { throw new Error("Oracle probe checkout failed"); };
  const replacement = fakePool();
  let calls = 0;
  const manager = createOraclePool({
    async createPool() { return ++calls === 1 ? broken : replacement; },
  }, "Test", "TEST", () => true);
  await assert.rejects(manager.initPool(), /probe checkout failed/);
  assert.deepEqual(broken.state.closed, [0]);

  changeTunnel();
  changeTunnel(32155);
  await manager.initPool();
  const connection = await replacement.getConnection();
  let releaseCheckout;
  replacement.getConnection = () => new Promise((resolve) => { releaseCheckout = resolve; });
  await assert.rejects(manager.getConnection(), /operation timed out/);
  releaseCheckout(connection);
  await new Promise(setImmediate);
  assert.deepEqual(replacement.state.released, [undefined, { drop: true }]);
  await manager.closePool();
  listeners.clear();
});
