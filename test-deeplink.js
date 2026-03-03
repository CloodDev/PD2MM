// Quick test to see if deep link gets passed correctly
console.log('='.repeat(60));
console.log('TEST: Arguments received:');
console.log(process.argv);
console.log('='.repeat(60));

// Look for deep link
const deepLink = process.argv.find(arg => arg.startsWith('mws-pdmm://'));
if (deepLink) {
  console.log('✓✓✓ DEEP LINK FOUND:', deepLink);
} else {
  console.log('✗✗✗ NO DEEP LINK in arguments');
}

// Keep process alive for a moment
setTimeout(() => {
  console.log('Test complete');
  process.exit(0);
}, 2000);
