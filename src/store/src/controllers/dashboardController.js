import {
  fetchAllTasks,
  fetchPendingTasks,
  fetchCompletedTasks,
  fetchDepartmentWiseCount,
  fetchPaymentTypeDistribution,
  fetchVendorWiseCosts
} from "../services/dashboardServices.js";

export const getDashboardMetrics = async (req, res) => {
  try {
    const tasks = await fetchAllTasks();
    const pending = await fetchPendingTasks();
    const completed = await fetchCompletedTasks();
    const deptWise = await fetchDepartmentWiseCount();
    const paymentDist = await fetchPaymentTypeDistribution();
    const vendorCosts = await fetchVendorWiseCosts();

    console.log(`✅ Dashboard: ${tasks.length} tasks, ${pending.length} pending, ${completed.length} completed`);

    return res.json({
      success: true,
      data: {
        tasks,
        pendingCount: pending.length,
        completedCount: completed.length,
        totalRepairCost: tasks.reduce((a, b) => a + Number(b.total_bill_amount || 0), 0),
        departmentStatus: deptWise,
        paymentTypeDistribution: paymentDist,
        vendorWiseCosts: vendorCosts
      }
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    console.error("Error details:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
      details: error.message
    });
  }
};
