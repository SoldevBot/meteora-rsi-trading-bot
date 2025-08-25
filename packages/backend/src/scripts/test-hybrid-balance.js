#!/usr/bin/env node

console.log('Testing new hybrid balance history system...');
console.log('📊 Strategy: Hourly snapshots for last 24h + Daily averages for older data\n');

// Test the new hybrid balance system
const now = Date.now();
const oneDayAgo = now - (24 * 60 * 60 * 1000);

// Simulate balance history
const balanceHistory = [];

// Add hourly entries for the last 24 hours (24 entries)
console.log('📅 Adding hourly entries for last 24 hours...');
for (let i = 23; i >= 0; i--) {
  const timestamp = now - (i * 60 * 60 * 1000); // Every hour
  balanceHistory.push({
    sol: 10 + Math.random() * 2,
    usdc: 1000 + Math.random() * 100,
    timestamp: timestamp,
    type: 'hourly'
  });
}

// Add multiple entries per day for older data (to simulate old 5-minute system)
console.log('📅 Adding old data (multiple entries per day for last 7 days)...');
for (let day = 1; day <= 7; day++) {
  const dayStart = oneDayAgo - (day * 24 * 60 * 60 * 1000);
  
  // Add 12 entries per day (every 2 hours) to simulate old frequent data
  for (let entry = 0; entry < 12; entry++) {
    const timestamp = dayStart + (entry * 2 * 60 * 60 * 1000);
    balanceHistory.push({
      sol: 9 + Math.random() * 3,
      usdc: 950 + Math.random() * 150,
      timestamp: timestamp,
      type: 'old_frequent'
    });
  }
}

console.log(`\n📊 Generated ${balanceHistory.length} total entries`);
console.log(`   - Recent (24h): ${balanceHistory.filter(e => e.timestamp >= oneDayAgo).length} hourly entries`);
console.log(`   - Old data: ${balanceHistory.filter(e => e.timestamp < oneDayAgo).length} frequent entries`);

// Simulate compression logic
const recentData = balanceHistory.filter(entry => entry.timestamp >= oneDayAgo);
const oldData = balanceHistory.filter(entry => entry.timestamp < oneDayAgo);

console.log(`\n🔄 Compressing old data...`);

// Group old data by day
const dailyGroups = new Map();
for (const entry of oldData) {
  const date = new Date(entry.timestamp);
  const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  
  if (!dailyGroups.has(dayKey)) {
    dailyGroups.set(dayKey, []);
  }
  dailyGroups.get(dayKey).push(entry);
}

// Calculate daily averages
const compressedData = [];
for (const [dayKey, dayEntries] of dailyGroups) {
  const avgSol = dayEntries.reduce((sum, entry) => sum + entry.sol, 0) / dayEntries.length;
  const avgUsdc = dayEntries.reduce((sum, entry) => sum + entry.usdc, 0) / dayEntries.length;
  const lastTimestamp = Math.max(...dayEntries.map(entry => entry.timestamp));
  
  compressedData.push({
    sol: Number(avgSol.toFixed(6)),
    usdc: Number(avgUsdc.toFixed(2)),
    timestamp: lastTimestamp,
    isDailyAverage: true,
    originalEntryCount: dayEntries.length
  });
}

const finalHistory = [...compressedData, ...recentData];

console.log(`\n✅ Compression Results:`);
console.log(`   - Old data: ${oldData.length} entries → ${compressedData.length} daily averages`);
console.log(`   - Compression ratio: ${(oldData.length / compressedData.length).toFixed(1)}:1`);
console.log(`   - Recent data: ${recentData.length} hourly entries (unchanged)`);
console.log(`   - Total after compression: ${finalHistory.length} entries`);

console.log(`\n📈 Storage Efficiency:`);
console.log(`   - Before: ${balanceHistory.length} entries`);
console.log(`   - After: ${finalHistory.length} entries`);
console.log(`   - Space saved: ${((1 - finalHistory.length / balanceHistory.length) * 100).toFixed(1)}%`);

console.log(`\n🎯 Data Structure:`);
console.log(`   - Last 24h: Detailed hourly data (${recentData.length} entries)`);
console.log(`   - Older data: Daily averages (${compressedData.length} entries)`);
console.log(`   - Total storage: ~${finalHistory.length} entries vs ~${24 * 12 * 7 + 24} without compression`);

console.log('\n✅ Hybrid hourly/daily balance history system test completed successfully!');
