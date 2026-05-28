import { refreshDashboardData } from './src/services/dashboardServices.js';

async function run() {
  try {
    console.log('Refreshing dashboard data...');
    const result = await refreshDashboardData();
    console.log('Dashboard Data Payload:');
    console.log(JSON.stringify({
      pendingCount: result.pendingCount,
      completedCount: result.completedCount,
      totalRepairCost: result.totalRepairCost,
      summary: result.summary,
      pendingIndentsCount: result.pendingIndents?.length,
      historyIndentsCount: result.historyIndents?.length,
      poPendingCount: result.poPending?.length,
      poHistoryCount: result.poHistory?.length,
      repairPendingCount: result.repairPending?.length,
      repairHistoryCount: result.repairHistory?.length,
      returnableDetailsCount: result.returnableDetails?.length,
      feedbacksCount: result.feedbacks?.length
    }, null, 2));
  } catch (err) {
    console.error('Error refreshing dashboard:', err);
  } finally {
    process.exit(0);
  }
}

run();
