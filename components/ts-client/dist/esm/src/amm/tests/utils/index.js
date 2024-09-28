var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Wallet } from '@coral-xyz/anchor';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
export const airDropSol = (connection_1, publicKey_1, ...args_1) => __awaiter(void 0, [connection_1, publicKey_1, ...args_1], void 0, function* (connection, publicKey, amount = 1) {
    try {
        const airdropSignature = yield connection.requestAirdrop(publicKey, amount * LAMPORTS_PER_SOL);
        const latestBlockHash = yield connection.getLatestBlockhash();
        yield connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: airdropSignature,
        }, connection.commitment);
    }
    catch (error) {
        console.error(error);
        throw error;
    }
});
export const airDropSolIfBalanceNotEnough = (connection_1, publicKey_1, ...args_1) => __awaiter(void 0, [connection_1, publicKey_1, ...args_1], void 0, function* (connection, publicKey, balance = 1) {
    const walletBalance = yield connection.getBalance(publicKey);
    if (walletBalance < balance * LAMPORTS_PER_SOL) {
        yield airDropSol(connection, publicKey);
    }
});
export const getOrCreateATA = (connection, mint, owner, payer) => __awaiter(void 0, void 0, void 0, function* () {
    const ata = yield getOrCreateAssociatedTokenAccount(connection, payer, mint, owner, true);
    return ata.address;
});
export const mockWallet = new Wallet(Keypair.generate());
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