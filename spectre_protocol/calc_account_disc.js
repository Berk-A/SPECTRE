
const crypto = require('crypto');

function getDiscriminator(name) {
    const preimage = `account:${name}`;
    const hash = crypto.createHash('sha256').update(preimage).digest();
    return hash.subarray(0, 8);
}

console.log('WithdrawalRequest:', Array.from(getDiscriminator('WithdrawalRequest')));
