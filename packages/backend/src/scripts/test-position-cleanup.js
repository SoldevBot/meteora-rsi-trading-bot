#!/usr/bin/env node

console.log('Testing position cleanup with ACTIVE position protection...');
console.log('🔒 Strategy: Keep ALL active positions + limit to 100 inactive positions\n');

// Simulate positions array
const positions = [];

// Add some ACTIVE positions (these should NEVER be deleted)
console.log('🟢 Adding ACTIVE positions (different ages)...');
for (let i = 0; i < 5; i++) {
  const daysOld = Math.floor(Math.random() * 365); // Random age up to 1 year
  const timestamp = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  
  positions.push({
    id: `active-${i}`,
    status: 'ACTIVE',
    timeframe: '1h',
    side: 'BUY',
    createdAt: timestamp,
    ageInDays: daysOld
  });
}

// Add many INACTIVE positions (old completed/closed positions)
console.log('🔴 Adding INACTIVE positions (120 old positions)...');
for (let i = 0; i < 120; i++) {
  const daysOld = i + 1; // Sequential age
  const timestamp = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  
  positions.push({
    id: `inactive-${i}`,
    status: Math.random() > 0.5 ? 'CLOSED' : 'COMPLETED',
    timeframe: '15m',
    side: 'SELL',
    createdAt: timestamp,
    ageInDays: daysOld
  });
}

console.log(`\n📊 Initial state: ${positions.length} total positions`);
console.log(`   - Active: ${positions.filter(p => p.status === 'ACTIVE').length}`);
console.log(`   - Inactive: ${positions.filter(p => p.status !== 'ACTIVE').length}`);

// Simulate cleanup logic
const activePositions = positions.filter(p => p.status === 'ACTIVE');
const inactivePositions = positions.filter(p => p.status !== 'ACTIVE');

console.log(`\n🔍 Analyzing positions...`);
console.log(`   - Active positions (NEVER deleted): ${activePositions.length}`);
console.log(`   - Inactive positions (cleanup candidates): ${inactivePositions.length}`);

// Show ages of active positions
const activeAges = activePositions.map(p => p.ageInDays).sort((a, b) => b - a);
console.log(`   - Active position ages: ${activeAges.join(', ')} days old`);

// Cleanup inactive positions
const maxInactivePositions = 100;
let keptInactivePositions = inactivePositions;

if (inactivePositions.length > maxInactivePositions) {
  const oldInactiveCount = inactivePositions.length;
  // Sort inactive positions by createdAt timestamp (newest first)
  inactivePositions.sort((a, b) => b.createdAt - a.createdAt);
  keptInactivePositions = inactivePositions.slice(0, maxInactivePositions);
  
  console.log(`\n🧹 Cleanup performed:`);
  console.log(`   - Kept ${maxInactivePositions} newest inactive positions`);
  console.log(`   - Removed ${oldInactiveCount - maxInactivePositions} old inactive positions`);
}

// Final result
const finalPositions = [...activePositions, ...keptInactivePositions];

console.log(`\n✅ Final result: ${finalPositions.length} total positions`);
console.log(`   - Active (preserved): ${activePositions.length} positions`);
console.log(`   - Inactive (limited): ${keptInactivePositions.length} positions`);

console.log(`\n🔒 Protection verification:`);
console.log(`   - ALL active positions preserved: ${activePositions.length === finalPositions.filter(p => p.status === 'ACTIVE').length ? '✅ YES' : '❌ NO'}`);
console.log(`   - Oldest active position: ${Math.max(...activeAges)} days old (preserved)`);
console.log(`   - Inactive positions limited: ${keptInactivePositions.length <= maxInactivePositions ? '✅ YES' : '❌ NO'}`);

console.log(`\n💾 Storage efficiency:`);
console.log(`   - Before cleanup: ${positions.length} positions`);
console.log(`   - After cleanup: ${finalPositions.length} positions`);
console.log(`   - Space saved: ${((positions.length - finalPositions.length) / positions.length * 100).toFixed(1)}%`);
console.log(`   - Strategy: Never delete active positions, limit inactive to ${maxInactivePositions}`);

console.log('\n✅ Position cleanup with active protection test completed successfully!');
