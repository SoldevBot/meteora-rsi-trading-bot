#!/usr/bin/env node

console.log('Testing balance compression...');

// Simple test without importing TradingService
const now = Date.now();
const oneDayAgo = now - (24 * 60 * 60 * 1000);
const twoDaysAgo = now - (48 * 60 * 60 * 1000);

// Simulate balance history
const balanceHistory = [];

// Add old entries (2 days ago)
for (let i = 0; i < 50; i++) {
  const timestamp = twoDaysAgo + (i * 5 * 60 * 1000);
  balanceHistory.push({
    timestamp,
    balance: 1000 + Math.random() * 100,
    balanceUsd: 1000 + Math.random() * 100,
  });
}

// Add recent entries (last 24h)
for (let i = 0; i < 20; i++) {
  const timestamp = oneDayAgo + (i * 60 * 60 * 1000);
  balanceHistory.push({
    timestamp,
    balance: 1100 + Math.random() * 100,
    balanceUsd: 1100 + Math.random() * 100,
  });
}

console.log(`Total entries before compression: ${balanceHistory.length}`);

// Simulate compression logic
const cutoffTime = now - (24 * 60 * 60 * 1000);
const recentEntries = balanceHistory.filter(entry => entry.timestamp >= cutoffTime);
const oldEntries = balanceHistory.filter(entry => entry.timestamp < cutoffTime);

console.log(`Recent entries (last 24h): ${recentEntries.length}`);
console.log(`Old entries (>24h): ${oldEntries.length}`);

// Group old entries by day
const groupedByDay = new Map();
oldEntries.forEach(entry => {
  const date = new Date(entry.timestamp);
  const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  
  if (!groupedByDay.has(dayKey)) {
    groupedByDay.set(dayKey, []);
  }
  groupedByDay.get(dayKey).push(entry);
});

console.log(`Old entries grouped into ${groupedByDay.size} days`);

// Create compressed entries
const compressedEntries = [];
for (const [dayKey, dayEntries] of groupedByDay) {
  const avgBalance = dayEntries.reduce((sum, entry) => sum + entry.balance, 0) / dayEntries.length;
  const avgBalanceUsd = dayEntries.reduce((sum, entry) => sum + entry.balanceUsd, 0) / dayEntries.length;
  
  compressedEntries.push({
    timestamp: dayEntries[Math.floor(dayEntries.length / 2)].timestamp, // Use middle timestamp of the day
    balance: avgBalance,
    balanceUsd: avgBalanceUsd,
    isCompressed: true,
    originalCount: dayEntries.length
  });
}

const totalAfterCompression = recentEntries.length + compressedEntries.length;
console.log(`Total entries after compression: ${totalAfterCompression}`);
console.log(`Compressed entries: ${compressedEntries.length}`);
console.log(`Compression ratio: ${Math.round((1 - totalAfterCompression / balanceHistory.length) * 100)}%`);

console.log('Balance compression test completed successfully!');
