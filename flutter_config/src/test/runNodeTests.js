let passes = 0;
let fails = 0;

global.suite = (name, fn) => { 
  console.log('\n=== SUITE: ' + name + ' ==='); 
  fn(); 
};

global.test = (name, fn) => {
  const p = fn();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      passes++;
      console.log('  [PASS] ' + name);
    }).catch(err => {
      fails++;
      console.error('  [FAIL] ' + name + '\n    Error: ' + err.message);
    });
  } else {
    passes++;
    console.log('  [PASS] ' + name);
  }
};

require('./mock-vscode.js');
require('../../out/test/suite/unit.test.js');
require('../../out/test/suite/qa.test.js');

setTimeout(() => {
  console.log('\n=======================================');
  console.log('TOTAL TESTS: ' + (passes + fails));
  console.log('PASSED:      ' + passes);
  console.log('FAILED:      ' + fails);
  console.log('=======================================');
  if (fails > 0) {
    process.exit(1);
  }
}, 500);

