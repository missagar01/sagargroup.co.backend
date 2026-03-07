/**
 * Performance Monitoring Utility
 * 
 * Simple utility to measure and log dashboard query performance
 * Add this to your dashboardService.js to monitor improvements
 */

class PerformanceMonitor {
    constructor() {
        this.enabled = process.env.PERF_MONITORING === 'true';
        this.metrics = new Map();
    }

    start(label) {
        if (!this.enabled) return null;
        const startTime = process.hrtime.bigint();
        return { label, startTime };
    }

    end(timer) {
        if (!this.enabled || !timer) return;

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - timer.startTime) / 1_000_000; // Convert to milliseconds

        // Store metric
        if (!this.metrics.has(timer.label)) {
            this.metrics.set(timer.label, []);
        }
        this.metrics.get(timer.label).push(duration);

        // Log if slow (> 100ms)
        if (duration > 100) {
            console.warn(`⚠️  SLOW QUERY: ${timer.label} took ${duration.toFixed(2)}ms`);
        } else {
            console.log(`✅ ${timer.label}: ${duration.toFixed(2)}ms`);
        }
    }

    getStats(label = null) {
        if (!this.enabled) return null;

        if (label) {
            const values = this.metrics.get(label) || [];
            return this.calculateStats(label, values);
        }

        const allStats = {};
        for (const [key, values] of this.metrics.entries()) {
            allStats[key] = this.calculateStats(key, values);
        }
        return allStats;
    }

    calculateStats(label, values) {
        if (values.length === 0) {
            return { label, count: 0, avg: 0, min: 0, max: 0 };
        }

        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        return {
            label,
            count: values.length,
            avg: avg.toFixed(2),
            min: min.toFixed(2),
            max: max.toFixed(2)
        };
    }

    logSummary() {
        if (!this.enabled) return;

        console.log('\n📊 Performance Summary:');
        console.log('─'.repeat(80));

        const stats = this.getStats();
        for (const [label, data] of Object.entries(stats)) {
            const status = data.avg < 100 ? '✅' : data.avg < 500 ? '⚠️ ' : '❌';
            console.log(
                `${status} ${label.padEnd(40)} | Avg: ${String(data.avg).padStart(8)}ms | ` +
                `Min: ${String(data.min).padStart(8)}ms | Max: ${String(data.max).padStart(8)}ms | ` +
                `Count: ${data.count}`
            );
        }
        console.log('─'.repeat(80));
    }

    reset() {
        this.metrics.clear();
    }
}

// Usage Example in dashboardService.js:
/*

const perfMonitor = new PerformanceMonitor();

async getDashboardStats() {
  const totalTimer = perfMonitor.start('Total Dashboard Load');
  const client = await pool.connect();
  
  try {
    // Monitor individual queries
    const queryTimer = perfMonitor.start('Summary Query');
    const summaryResult = await client.query(queries.summary);
    perfMonitor.end(queryTimer);
    
    // ... rest of your code ...
    
    perfMonitor.end(totalTimer);
    perfMonitor.logSummary();
    
    return data;
  } finally {
    client.release();
  }
}

*/

module.exports = PerformanceMonitor;
