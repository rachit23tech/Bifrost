import { Base62SlugGenerator } from '../server/services/slug.service.js';
import { abuseEngine } from '../server/services/abuse.service.js';

console.log('🧪 Running Bifrost Unit Tests...\n');

// 1. Test Base62 Encoding/Decoding
const generator = new Base62SlugGenerator();

console.log('--- 1. Base62 Slug Generator Tests ---');
const testNumbers = [0, 1, 61, 62, 1000, 1234567];
let base62Passed = true;

for (const num of testNumbers) {
  const encoded = generator.encode(num);
  const decoded = generator.decode(encoded);
  if (decoded !== num) {
    console.error(`❌ Base62 failed for ${num}: encoded '${encoded}', decoded back to ${decoded}`);
    base62Passed = false;
  } else {
    console.log(`  ✓ Number ${num} -> Base62 '${encoded}' -> Decoded back to ${decoded}`);
  }
}

if (base62Passed) {
  console.log('✅ Base62 Slug Generator Test Passed!\n');
}

// 2. Test Abuse Detection Engine Risk Scoring
console.log('--- 2. Abuse Detection Engine Risk Rules ---');

const testCases = [
  {
    url: 'https://github.com/facebook/react',
    expectedStatus: 'active',
    maxScore: 29,
    description: 'Clean legitimate domain'
  },
  {
    url: 'http://192.168.1.50/admin',
    expectedStatus: 'flagged',
    minScore: 30,
    description: 'IP literal host (+45 pts)'
  },
  {
    url: 'https://bit.ly/chained-link',
    expectedStatus: 'flagged',
    minScore: 40,
    description: 'Shortener chaining (+40 pts)'
  },
  {
    url: 'http://malware-example.com/payload.exe',
    expectedStatus: 'blocked',
    minScore: 70,
    description: 'Blocklisted domain (+80 pts) + Executable (+40 pts)'
  }
];

let abuseEnginePassed = true;

for (const tc of testCases) {
  const result = abuseEngine.evaluateCreation(tc.url);
  console.log(`  Evaluating: ${tc.url}`);
  console.log(`    -> Score: ${result.score}/100 | Status: ${result.status} | Signals: [${result.signals.map(s => s.type).join(', ')}]`);

  if (tc.expectedStatus && result.status !== tc.expectedStatus) {
    console.error(`    ❌ Status mismatch for ${tc.description}: Expected '${tc.expectedStatus}', got '${result.status}'`);
    abuseEnginePassed = false;
  } else {
    console.log(`    ✓ Status matched expected '${result.status}'`);
  }
}

if (abuseEnginePassed) {
  console.log('\n✅ Abuse Detection Engine Test Passed!\n');
}

if (base62Passed && abuseEnginePassed) {
  console.log('🎉 ALL UNIT TESTS PASSED SUCCESSFULLY!');
} else {
  process.exit(1);
}
