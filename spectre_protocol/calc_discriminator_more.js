
const crypto = require('crypto');

function getDiscriminator(name) {
    const preimage = `global:${name}`;
    const hash = crypto.createHash('sha256').update(preimage).digest();
    return hash.subarray(0, 8);
}

const candidates = [
    'deposit',
    'transact',
    'transact_spl',
    'shield',
    'insert_leaf',
    'insert_leaves',
    'append_leaf',
    'append_leaves',
    'process_transaction',
    'top_up',
    'fund_tree',
    'fund_tree',
    'new_account',
    'create_account',
    'initialize',
    'init',
    'configure',
    'config',
    'deposit_sol',
    'deposit_spl',
    'deposit_v1',
    'transact_v1',
    'relay',
    'relay_deposit'
];

candidates.forEach(name => {
    console.log(`${name}: [${Array.from(getDiscriminator(name)).join(', ')}]`);
});
