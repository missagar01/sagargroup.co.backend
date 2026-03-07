const express = require("express");

const router = express.Router();
let documentRouterPromise = null;

async function buildDocumentRouter() {
  const [
    dashboardRoutesMod,
    documentShareRoutesMod,
    loanRoutesMod,
    masterRoutesMod,
    mySubscriptionRoutesMod,
    paymentFmsRoutesMod,
    renewalRoutesMod,
    settingsRoutesMod,
    subscriptionPaymentRoutesMod,
    subscriptionRoutesMod,
    subscriptionApprovalRoutesMod,
    userLegacyRoutesMod,
    userRoutesMod,
    documentRoutesMod,
  ] = await Promise.all([
    import("./routes/dashboardRoutes.js"),
    import("./routes/documentShare.routes.js"),
    import("./routes/loan.routes.js"),
    import("./routes/master.js"),
    import("./routes/mySubscription.routes.js"),
    import("./routes/payment-fms.routes.js"),
    import("./routes/renewal.routes.js"),
    import("./routes/settings.routes.js"),
    import("./routes/subscription-pyament.routes.js"),
    import("./routes/subscriptionRoutes.js"),
    import("./routes/susbcriptionApprovalRoutes.js"),
    import("./routes/user.js"),
    import("./routes/userRoutes.js"),
    import("./routes/document-routes/document.routes.js"),
  ]);

  const dashboardRoutes = dashboardRoutesMod.default;
  const documentShareRoutes = documentShareRoutesMod.default;
  const loanRoutes = loanRoutesMod.default;
  const masterRoutes = masterRoutesMod.default;
  const mySubscriptionRoutes = mySubscriptionRoutesMod.default;
  const paymentFmsRoutes = paymentFmsRoutesMod.default;
  const renewalRoutes = renewalRoutesMod.default;
  const settingsRoutes = settingsRoutesMod.default;
  const subscriptionPaymentRoutes = subscriptionPaymentRoutesMod.default;
  const subscriptionRoutes = subscriptionRoutesMod.default;
  const subscriptionApprovalRoutes = subscriptionApprovalRoutesMod.default;
  const userLegacyRoutes = userLegacyRoutesMod.default;
  const userRoutes = userRoutesMod.default;
  const documentRoutes = documentRoutesMod.default;

  const mountedRouter = express.Router();

  mountedRouter.get("/health", (_req, res) => {
    res.json({
      success: true,
      service: "document",
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  mountedRouter.use("/dashboard", dashboardRoutes);
  mountedRouter.use("/document-share", documentShareRoutes);
  mountedRouter.use("/loan", loanRoutes);
  mountedRouter.use("/master", masterRoutes);
  mountedRouter.use("/my-subscriptions", mySubscriptionRoutes);
  mountedRouter.use("/payment-fms", paymentFmsRoutes);
  mountedRouter.use("/renewal", renewalRoutes);
  mountedRouter.use("/settings", settingsRoutes);
  mountedRouter.use("/subscription-payment", subscriptionPaymentRoutes);
  mountedRouter.use("/subscriptions", subscriptionRoutes);
  mountedRouter.use("/subscription-approvals", subscriptionApprovalRoutes);
  mountedRouter.use("/users-list", userLegacyRoutes);
  mountedRouter.use("/users", userRoutes);
  mountedRouter.use("/documents", documentRoutes);

  return mountedRouter;
}

function getDocumentRouter() {
  if (!documentRouterPromise) {
    documentRouterPromise = buildDocumentRouter().catch((error) => {
      documentRouterPromise = null;
      throw error;
    });
  }
  return documentRouterPromise;
}

router.use(async (req, res, next) => {
  try {
    const mountedRouter = await getDocumentRouter();
    return mountedRouter(req, res, next);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
