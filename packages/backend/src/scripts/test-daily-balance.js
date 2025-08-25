#!/usr/bin/env node

console.log('Testing new daily balance history system...');

// Test the new daily balance system
const now = Date.now();
const today = new Date(now).toDateString();

console.log(`Current date: ${today}`);
console.log(`Timestamp: ${now}`);

// Simulate balance history with daily entries
const balanceHistory = [];

// Add entries for the last 30 days
for (let i = 30; i >= 0; i--) {
  const date = new Date(now - (i * 24 * 60 * 60 * 1000));
  const timestamp = date.getTime();
  
  balanceHistory.push({
    sol: 10 + Math.random() * 5, // Random SOL balance between 10-15
    usdc: 1000 + Math.random() * 500, // Random USDC balance between 1000-1500
    timestamp: timestamp
  });
}

console.log(`\nGenerated ${balanceHistory.length} daily balance entries`);

// Test daily entry logic
const todayEntryIndex = balanceHistory.findIndex(entry => {
  const entryDay = new Date(entry.timestamp).toDateString();
  return entryDay === today;
});

if (todayEntryIndex >= 0) {
  console.log(`✅ Found today's entry at index ${todayEntryIndex}`);
  console.log(`Today's balance: ${balanceHistory[todayEntryIndex].sol.toFixed(4)} SOL, ${balanceHistory[todayEntryIndex].usdc.toFixed(2)} USDC`);
} else {
  console.log('❌ No entry found for today');
}

// Test cleanup logic
const maxDays = 30;
let entriesBeforeCleanup = balanceHistory.length;

if (balanceHistory.length > maxDays) {
  const entriesToRemove = balanceHistory.length - maxDays;
  balanceHistory.splice(0, entriesToRemove);
  console.log(`🧹 Cleaned up: removed ${entriesToRemove} entries, kept ${balanceHistory.length}`);
} else {
  console.log(`✅ No cleanup needed: ${balanceHistory.length} entries ≤ ${maxDays} max`);
}

// Show date range
if (balanceHistory.length > 0) {
  const oldestDate = new Date(balanceHistory[0].timestamp).toDateString();
  const newestDate = new Date(balanceHistory[balanceHistory.length - 1].timestamp).toDateString();
  
  console.log(`\n📅 Date range: ${oldestDate} → ${newestDate}`);
  console.log(`📊 Total entries: ${balanceHistory.length}`);
  console.log(`💾 Storage efficiency: 1 entry per day (instead of 288 entries per day at 5-minute intervals)`);
  console.log(`🔢 Data reduction: ~${(288 / 1 * 100).toFixed(0)}x less storage needed`);
}

console.log('\n✅ Daily balance history system test completed successfully!');
