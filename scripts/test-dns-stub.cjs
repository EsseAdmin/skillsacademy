/* eslint-disable @typescript-eslint/no-require-imports */
// Test-only preload (node -r): makes the sign-up email check pass offline by answering
// MX/A lookups with a fake record, so browser tests can create academies without internet DNS.
const dns = require("node:dns");
const dnsp = require("node:dns/promises");
for (const target of [dns.promises, dnsp]) {
  target.resolveMx = async () => [{ exchange: "mx.test.invalid", priority: 10 }];
  target.resolve4 = async () => ["127.0.0.1"];
  target.resolve6 = async () => ["::1"];
}
