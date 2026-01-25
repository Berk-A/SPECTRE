
const { Connection, PublicKey } = require('@solana/web3.js');

const PROGRAM_ID = new PublicKey('9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD');

async function main() {
    console.log('--- Checking Devnet ---');
    const connection = new Connection('https://api.devnet.solana.com');

    try {
        // const signatures = await connection.getSignaturesForAddress(PROGRAM_ID, { limit: 1 });
        // console.log(`Found ${signatures.length} transactions`);
        // if (signatures.length === 0) return;
        // const sig = signatures[0].signature;

        const sig = '3wzasimb9hM7XZ5K42gUrWkkdTT5ETxCWx83ZjeXYB2rs9p964B87J4Y38WiA317VMQLXvSxHCvyqNawbL6VwkXe';
        console.log(`Fetching ${sig}...`);

        const tx = await connection.getTransaction(sig, {
            maxSupportedTransactionVersion: 0
        });

        console.log(JSON.stringify(tx, null, 2));

    } catch (err) {
        console.error('Error:', err);
    }
}

main();
