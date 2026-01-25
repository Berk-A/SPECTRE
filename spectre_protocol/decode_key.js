
const { PublicKey } = require('@solana/web3.js');

const hex = '1d62be895aabe1ffde1b3218d0441092875198da3129f2f1f63a005588a385bd';
const buf = Buffer.from(hex, 'hex');
const pubkey = new PublicKey(buf);

console.log('Decoded Pubkey:', pubkey.toBase58());
