const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const {
  createNft,
  mplTokenMetadata,
} =  require("@metaplex-foundation/mpl-token-metadata");
const {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey,
  sol,
} = require('@metaplex-foundation/umi');
const { readFileSync } = require('fs');

// Initialize Umi
const umi = createUmi('https://rpc.ironforge.network/mainnet?apiKey=01HRZ9G6Z2A19FY8PR4RF4J4PW').use(mplTokenMetadata());

// Load your wallet keypair
const secretKey = JSON.parse(readFileSync('/root/99.json', 'utf-8'));
const myKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
const myWallet = createSignerFromKeypair(umi, myKeypair);
umi.use(keypairIdentity(myWallet));

async function mintNFTsToCollection(numberOfNFTs: number, collectionMint: string) {
  for (let i = 0; i < numberOfNFTs; i++) {
    try {
      // Generate a new signer for each NFT
      const mint = generateSigner(umi);
      if (i == 0){
       
      }
      else {
      // Create NFT metadata
      const name = `iSpy #${i + 1}`;
      const symbol = 'iSpy';
      const uri = 'https://fomo3d.fun/nfts'; // Replace with your metadata URI
      
      // Create the NFT
      const { signature } = await createNft(umi, {
        mint,
        name,
        symbol,
        uri,
        creators: [{
          share: 100,
          address: publicKey(myWallet.publicKey),
          verified: false,
        }],
        sellerFeeBasisPoints: percentAmount(5), // 5%
        collection: { key: publicKey(collectionMint), verified: false },
      }).sendAndConfirm(umi);
      
      console.log(`Minted NFT #${i + 1} with signature: ${signature}`);
    }
    } catch (error) {
      console.error(`Error minting NFT #${i + 1}:`, error);
    }
  }
}

// Usage
const collectionMint = 'BGKeGmREszUazWAFhwVoF85XLGkBiHK6taPUtKvXXoui';
const numberOfNFTsToMint = 10000000;

mintNFTsToCollection(numberOfNFTsToMint, collectionMint);