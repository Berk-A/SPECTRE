
const crypto = require('crypto');

function getDiscriminator(name) {
    const preimage = `global:${name}`;
    const hash = crypto.createHash('sha256').update(preimage).digest();
    return hash.subarray(0, 8);
}

const deposit = getDiscriminator('deposit');
const transact = getDiscriminator('transact');
const transactSpl = getDiscriminator('transact_spl');

console.log('deposit:', Array.from(deposit));
console.log('transact:', Array.from(transact));
console.log('transact_spl:', Array.from(transactSpl));

// Current one used: [217, 149, 130, 143, 221, 52, 252, 119]
