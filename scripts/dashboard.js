#!/usr/bin/env node
/**
 * Dashboard — Real-time system observability
 * Generates a live system status report.
 * 
 * Run: node scripts/dashboard.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const Dashboard = {
  generate() {
    const report = {
      timestamp: new Date().toISOString(),
      system: this.getSystemInfo(),
      health: this.getHealthScore(),
      modules: this.getModuleStatus(),
      recent: this.getRecentEvents()
    };
    fs.writeFileSync('scripts/dashboard-data.json', JSON.stringify(report, null, 2));
    return report;
  },

  getSystemInfo() {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      memory: {
        total: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
        free: `${Math.round(os.freemem() / 1024 / 1024)} MB`
      },
      loadAvg: os.loadavg().slice(0, 3),
      uptime: `${Math.round(os.uptime() / 60)} min`
    };
  },

  getHealthScore() {
    try {
      const content = fs.readFileSync('memory/system-health-score.md', 'utf-8');
      const lines = content.split('\n');
      const scores = {};
      for (const line of lines) {
        const match = line.match(/^\| (\w[\w\s]+) \| (\d+) \|/);
        if (match && !match[1].includes('Metric') && !match[1].includes('Average')) {
          scores[match[1].trim()] = parseInt(match[2]);
        }
      }
      return scores;
    } catch {
      return { error: 'Cannot read health score' };
    }
  },

  getModuleStatus() {
    const modules = [
      'policy-engine.js', 'watchdog.js', 'reporting.js', 'self-healing.js',
      'autonomous-config.js', 'task-decomposer.js', 'workflow-state.js',
      'notification-filter.js', 'runtime.js'
    ];
    const status = {};
    for (const mod of modules) {
      const p = path.join('scripts', mod);
      try {
        const content = fs.readFileSync(p, 'utf-8');
        const lines = content.split('\n').length;
        status[mod] = { exists: true, lines, bytes: Buffer.byteLength(content) };
      } catch {
        status[mod] = { exists: false };
      }
    }
    return status;
  },

  getRecentEvents() {
    try {
      const execLog = fs.readFileSync('memory/execution-log.md', 'utf-8');
      return { logExists: true, logSize: Buffer.byteLength(execLog) };
    } catch {
      return { logExists: false };
    }
  },

  format(report) {
    let output = `SYSTEM DASHBOARD\n${'='.repeat(40)}\n\n`;
    output += `Timestamp: ${report.timestamp}\n\n`;

    output += `-- System --\n`;
    output += `  Host: ${report.system.hostname} (${report.system.platform})\n`;
    output += `  Memory: ${report.system.memory.free} free / ${report.system.memory.total}\n`;
    output += `  Uptime: ${report.system.uptime}\n\n`;

    output += `-- Health Scores --\n`;
    if (!report.health.error) {
      for (const [key, val] of Object.entries(report.health)) {
        output += `  ${key}: ${val}/100\n`;
      }
    }
    output += '\n';

    output += `-- Modules --\n`;
    for (const [name, info] of Object.entries(report.modules)) {
      output += `  ${info.exists ? 'OK' : 'MISS'} ${name}`;
      if (info.exists) output += ` (${info.lines} lines, ${info.bytes} bytes)`;
      output += '\n';
    }

    output += `\n-- Execution Log --\n`;
    output += `  ${report.recent.logExists ? 'Available' : 'Not found'}\n`;

    return output;
  }
};

const report = Dashboard.generate();
console.log(Dashboard.format(report));
