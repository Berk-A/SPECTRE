
const crypto = require('crypto');

function getDiscriminator(name) {
    const preimage = `global:${name}`;
    const hash = crypto.createHash('sha256').update(preimage).digest();
    return hash.subarray(0, 8);
}

console.log('request_withdrawal:', Array.from(getDiscriminator('request_withdrawal')));
