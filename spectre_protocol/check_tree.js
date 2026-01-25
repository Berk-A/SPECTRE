
const { Connection, PublicKey } = require('@solana/web3.js');

const DEVNET_RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD';

async function main() {
    const connection = new Connection(DEVNET_RPC);
    const programId = new PublicKey(PROGRAM_ID);

    const [treeAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from('merkle_tree')],
        programId
    );

    console.log(`Checking Tree PDA: ${treeAddress.toBase58()} on Devnet...`);

    const info = await connection.getAccountInfo(treeAddress);

    if (info) {
        console.log('✅ Tree Account FOUND!');
        console.log('Size:', info.data.length, 'bytes');
        // print first 64 bytes to see if we can spot a root
        console.log('Hex Data (first 64):', info.data.subarray(0, 64).toString('hex'));
    } else {
        console.log('❌ Tree Account NOT FOUND.');
    }
}

main().catch(console.error);
