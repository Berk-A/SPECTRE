
const { Connection, PublicKey } = require('@solana/web3.js');

const DEVNET_RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD';

async function main() {
    const connection = new Connection(DEVNET_RPC);
    const pubkey = new PublicKey(PROGRAM_ID);
    console.log(`Checking Program ID: ${PROGRAM_ID} on Devnet...`);

    const info = await connection.getAccountInfo(pubkey);

    if (info) {
        console.log('✅ Program FOUND on Devnet!');
        console.log('Executable:', info.executable);
        console.log('Owner:', info.owner.toBase58());
        console.log('Lamports:', info.lamports);
    } else {
        console.log('❌ Program NOT FOUND on Devnet.');
    }
}

main().catch(console.error);
