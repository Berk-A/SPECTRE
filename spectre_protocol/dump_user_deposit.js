
const { Connection, PublicKey } = require('@solana/web3.js');
const crypto = require('crypto');

// Configuration
const PROGRAM_ID = new PublicKey('B2atQ5fS4vY4bHCF9iX5M4fH4rTbdF8H5WjC5HqYp2m');
const CONNECTION_URL = 'https://api.devnet.solana.com';

function getDiscriminator(name) {
    const preimage = `account:${name}`;
    const hash = crypto.createHash('sha256').update(preimage).digest();
    return hash.subarray(0, 8);
}

const USER_DEPOSIT_DISCRIMINATOR = getDiscriminator('UserDeposit');
console.log('UserDeposit Discriminator:', Array.from(USER_DEPOSIT_DISCRIMINATOR));

async function main() {
    const connection = new Connection(CONNECTION_URL, 'confirmed');

    // Fetch accounts with matching discriminator
    // memcmp bytes must be base58
    // I don't have bs58 here easily in node script unless installed.
    // So I will fetch all and filter client side.

    console.log('Fetching accounts...');
    const accounts = await connection.getProgramAccounts(PROGRAM_ID);

    console.log(`Found ${accounts.length} accounts.`);

    for (const { pubkey, account } of accounts) {
        if (account.data.subarray(0, 8).equals(USER_DEPOSIT_DISCRIMINATOR)) {
            console.log('\nFound UserDeposit Account:', pubkey.toBase58());
            console.log('Data Length:', account.data.length);
            console.log('Data (first 100 bytes):', account.data.subarray(0, 100).toString('hex'));

            // Analyze offsets
            // 0-8: Discriminator
            // 8-40: Vault (32)
            // 40-72: Commitment (32)
            // 72-76: Expected Vec Len (4) ?
            const vecLen = account.data.readUInt32LE(72);
            console.log('Potential Vec Len at 72:', vecLen);
            console.log('Remaining bytes:', account.data.length - 76);

            if (vecLen === account.data.length - 76) {
                console.log('CONFIRMED: Vec<u8> length prefix at offset 72. Ciphertext starts at 76.');
            } else {
                console.log('WARNING: Vec len mismatch. Layout might be different.');
            }

            break; // Just analyze one
        }
    }
}

main().catch(console.error);
