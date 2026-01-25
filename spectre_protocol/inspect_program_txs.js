
const { Connection, PublicKey } = require('@solana/web3.js');

const PROGRAM_ID = new PublicKey('9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD');

async function main() {
    // Try Devnet first
    console.log('--- Checking Devnet ---');
    await checkCluster('https://api.devnet.solana.com');

    // Try Mainnet if Devnet fails or has no txs 
    // (assuming the program logic/discriminators are the same)
    // console.log('\n--- Checking Mainnet ---');
    // await checkCluster('https://api.mainnet-beta.solana.com');
}

async function checkCluster(endpoint) {
    const connection = new Connection(endpoint);
    try {
        const signatures = await connection.getSignaturesForAddress(PROGRAM_ID, { limit: 1000 });
        console.log(`Found ${signatures.length} transactions`);

        for (const sigInfo of signatures) {
            if (sigInfo.err) continue; // Skip failed txs

            console.log(`\nInspecting Tx: ${sigInfo.signature}`);
            const tx = await connection.getTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0
            });

            if (!tx) {
                console.log('  Could not fetch tx details');
                continue;
            }

            // For versioned transactions, we need to be careful with account keys
            const msg = tx.transaction.message;
            let accountKeys;

            if (msg.version === 0 || msg.version === '0') {
                // It's a Versioned Message (MessageV0)
                // staticAccountKeys are the ones in the message
                // BUT, compiledInstructions use indices into the COMBINED account list (static + loaded)
                // getTransaction with maxSupportedTransactionVersion: 0 SHOULD return meta.loadedAddresses

                // However, getting the full account list manually is tedious. 
                // Easier shortcut: Look at the instructions in `tx.meta.logMessages`? No, doesn't show data.

                // Let's use the `tx.transaction.message.staticAccountKeys` to find the program ID index usually
                // Program ID is usually a static key.
                accountKeys = msg.staticAccountKeys;
            } else {
                accountKeys = msg.accountKeys;
            }

            const instructions = msg.compiledInstructions;

            for (const ix of instructions) {
                // ix.programIdIndex is an index into the account keys
                // If the program ID is in the static keys (which it usually is), we can check it
                if (ix.programIdIndex < accountKeys.length) {
                    const progId = accountKeys[ix.programIdIndex];
                    console.log(`  Checking Instruction Program ID: ${progId.toBase58()}`);
                    if (progId.equals(PROGRAM_ID)) {
                        const data = Buffer.from(ix.data);
                        console.log(`  MATCH! Instruction Data Length: ${data.length}`);
                        console.log(`  Discriminator (First 8 bytes): [${Uint8Array.from(data.subarray(0, 8)).join(', ')}]`);
                        console.log(`  Hex: ${data.subarray(0, 8).toString('hex')}`);
                        return; // Found one
                    }
                }
            }
            console.log('  No matching instruction found in this tx (could be inner instruction?)');

        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();
