
const crypto = require('crypto');

function getDiscriminator(name) {
    const preimage = `global:${name}`;
    const hash = crypto.createHash('sha256').update(preimage).digest();
    return hash.subarray(0, 8);
}

const disc = getDiscriminator('fund_agent');
console.log('fund_agent calculated:', Array.from(disc));

const current = [108, 252, 24, 134, 59, 166, 124, 67];
console.log('fund_agent current:   ', current);

console.log('Match:', Buffer.compare(disc, Buffer.from(current)) === 0);
