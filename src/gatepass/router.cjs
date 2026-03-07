const express = require("express");

const router = express.Router();
let gatepassRouterPromise = null;

async function buildGatepassRouter() {
  const [
    requestRoutesMod,
    personRoutesMod,
    approveRoutesMod,
    closePassRoutesMod,
  ] = await Promise.all([
    import("./routes/requestRoutes.js"),
    import("./routes/personRoutes.js"),
    import("./routes/approveRoutes.js"),
    import("./routes/closePassRoutes.js"),
  ]);

  const requestRoutes = requestRoutesMod.default;
  const personRoutes = personRoutesMod.default;
  const approveRoutes = approveRoutesMod.default;
  const closePassRoutes = closePassRoutesMod.default;

  const mountedRouter = express.Router();

  mountedRouter.get("/health", (_req, res) => {
    res.json({
      success: true,
      service: "gatepass",
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  mountedRouter.use("/requests", requestRoutes);
  mountedRouter.use("/request", requestRoutes);
  mountedRouter.use("/persons", personRoutes);
  mountedRouter.use("/person", personRoutes);
  mountedRouter.use("/approvals", approveRoutes);
  mountedRouter.use("/approve", approveRoutes);
  mountedRouter.use("/close-pass", closePassRoutes);
  mountedRouter.use("/close", closePassRoutes);

  return mountedRouter;
}

function getGatepassRouter() {
  if (!gatepassRouterPromise) {
    gatepassRouterPromise = buildGatepassRouter().catch((error) => {
      gatepassRouterPromise = null;
      throw error;
    });
  }
  return gatepassRouterPromise;
}

router.use(async (req, res, next) => {
  try {
    const mountedRouter = await getGatepassRouter();
    return mountedRouter(req, res, next);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
