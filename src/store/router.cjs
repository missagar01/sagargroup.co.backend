const express = require("express");

const router = express.Router();
let storeRouterPromise = null;

async function buildStoreRouter() {
  const storeRoutesMod = await import("./src/routes/index.js");
  const storeRoutes = storeRoutesMod.default;

  const mountedRouter = express.Router();
  mountedRouter.use("/", storeRoutes);
  return mountedRouter;
}

function getStoreRouter() {
  if (!storeRouterPromise) {
    storeRouterPromise = buildStoreRouter().catch((error) => {
      storeRouterPromise = null;
      throw error;
    });
  }
  return storeRouterPromise;
}

router.use(async (req, res, next) => {
  try {
    const mountedRouter = await getStoreRouter();
    return mountedRouter(req, res, next);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
