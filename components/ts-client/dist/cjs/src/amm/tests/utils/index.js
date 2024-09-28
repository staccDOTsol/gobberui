"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockWallet = exports.getOrCreateATA = exports.airDropSolIfBalanceNotEnough = exports.airDropSol = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const airDropSol = async (connection, publicKey, amount = 1) => {
    try {
        const airdropSignature = await connection.requestAirdrop(publicKey, amount * web3_js_1.LAMPORTS_PER_SOL);
        const latestBlockHash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: airdropSignature,
        }, connection.commitment);
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};
exports.airDropSol = airDropSol;
const airDropSolIfBalanceNotEnough = async (connection, publicKey, balance = 1) => {
    const walletBalance = await connection.getBalance(publicKey);
    if (walletBalance < balance * web3_js_1.LAMPORTS_PER_SOL) {
        await (0, exports.airDropSol)(connection, publicKey);
    }
};
exports.airDropSolIfBalanceNotEnough = airDropSolIfBalanceNotEnough;
const getOrCreateATA = async (connection, mint, owner, payer) => {
    const ata = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, payer, mint, owner, true);
    return ata.address;
};
exports.getOrCreateATA = getOrCreateATA;
exports.mockWallet = new anchor_1.Wallet(web3_js_1.Keypair.generate());
// export const MAINNET = {
//   connection: new Connection(process.env.MAINNET_RPC_ENDPOINT as string),
//   cluster: 'mainnet-beta',
// };
// export const DEVNET = {
//   connection: new Connection('https://api.devnet.solana.com/', {
//     commitment: 'confirmed',
//   }),
//   cluster: 'devnet',
// };
//# sourceMappingURL=index.js.map