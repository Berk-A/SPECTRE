
const { Connection, PublicKey } = require('@solana/web3.js');

const DEVNET_RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD';

async function main() {
    const connection = new Connection(DEVNET_RPC);
    const programId = new PublicKey(PROGRAM_ID);
    console.log(`Fetching accounts for Program: ${PROGRAM_ID}...`);

    // Get all accounts owned by the program
    const accounts = await connection.getProgramAccounts(programId);

    console.log(`Found ${accounts.length} accounts.`);

    accounts.forEach((acc, i) => {
        console.log(`\n--- Account ${i + 1} ---`);
        console.log('Pubkey:', acc.pubkey.toBase58());
        console.log('Size:', acc.account.data.length, 'bytes');
        console.log('Lamports:', acc.account.lamports);
        console.log('Executable:', acc.account.executable);
        // data slice first 100 bytes to check discriminator if possible
        console.log('Data (hex start):', acc.account.data.subarray(0, 16).toString('hex'));
    });
}

main().catch(console.error);
