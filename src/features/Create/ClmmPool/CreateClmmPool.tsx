// @ts-nocheck
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SystemProgram, ComputeBudgetProgram, Transaction, PublicKey, Keypair } from '@solana/web3.js'
import { AnchorWallet, useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, BN, AnchorProvider } from '@coral-xyz/anchor'
import { FaTwitter, FaTelegram, FaDiscord, FaGithub } from 'react-icons/fa'

import { createAssociatedTokenAccountInstruction, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'

import { Input, Textarea, Button, Box, VStack, Text, useToast, Icon, Flex, Image } from '@chakra-ui/react'

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { TokenInfo } from '@raydium-io/raydium-sdk-v2'

import PanelCard from '@/components/PanelCard'
import { AMM } from './Amm'

const PROGRAM_ID = '65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9'

export default function CreateToken() {
  const router = useRouter()
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const { publicKey } = useWallet()
  const walletAdapter = useWallet()

  const [tokenName, setTokenName] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenDescription, setTokenDescription] = useState('')
  const [tokenImage, setTokenImage] = useState<File | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const toast = useToast()

  const [website, setWebsite] = useState<string | undefined>(undefined)
  const [telegramHandle, setTelegramHandle] = useState<string | undefined>(undefined)
  const [discordHandle, setDiscordHandle] = useState<string | undefined>(undefined)
  const [githubHandle, setGithubHandle] = useState<string | undefined>(undefined)
  const [twitterHandle, setTwitterHandle] = useState<string | undefined>(undefined)

  const [tokenAmount, setTokenAmount] = useState<string>('')
  const [tokenAmountToBuy, setTokenAmountToBuy] = useState<string>('')
  useEffect(() => {
    console.log('tokenAmount', tokenAmount)
    console.log('tokenAmountToBuy', tokenAmountToBuy)
    try {
      console.log('tokenAmount', tokenAmount)
      if (tokenAmount && !isNaN(parseFloat(tokenAmount))) {
        const solAmount = new BN(Math.floor(Number(tokenAmount) * 10 ** 9))
        const buyTokens = amm.getBuyTokensForSol(solAmount).div(new BN(10 ** 6))
        console.assert(buyTokens !== undefined, 'getBuyTokensForSol returned undefined')
        setTokenAmountToBuy(buyTokens.toLocaleString())
      }
    } catch (e) {
      console.error('Error calculating token amount to buy:', e)
      setTokenAmountToBuy('') // Reset to empty string on error
    }
  }, [tokenAmount, tokenAmountToBuy])
  const DEFAULT_TOKEN_RESERVES = 1000000000000000
  const DEFAULT_VIRTUAL_SOL_RESERVE = 30000000000
  const DEFUALT_VIRTUAL_TOKEN_RESERVE = 793100000000000
  const DEFUALT_INITIAL_VIRTUAL_TOKEN_RESERVE = 1073000000000000
  const DEFAULT_FEE_BASIS_POINTS = 50
  const amm = new AMM(
    new BN(DEFAULT_VIRTUAL_SOL_RESERVE),
    new BN(DEFUALT_VIRTUAL_TOKEN_RESERVE),
    new BN(30000000000),
    new BN(793100000000000),
    new BN(DEFUALT_INITIAL_VIRTUAL_TOKEN_RESERVE)
  )
  const umi = publicKey
    ? createUmi(connection.rpcEndpoint)
        .use(irysUploader())
        .use(mplToolbox())
        .use(walletAdapterIdentity(walletAdapter as any))
    : null

  const handleCreate = useCallback(async () => {
    if (!wallet || !umi) {
      console.error('Missing required dependencies')
      return
    }

    const provider = new AnchorProvider(connection, wallet, {})
    const programId = new PublicKey(PROGRAM_ID)
    const idl = await Program.fetchIdl(programId, provider)
    const program = new Program(idl!, provider)

    setIsCreating(true)
    try {
      const mint = Keypair.generate()
      const baseTokenInfo: TokenInfo = {
        address: mint.publicKey.toBase58(),
        name: tokenName ? tokenName : 'Fomocoin',
        symbol: tokenSymbol ? tokenSymbol : 'MEME',
        decimals: 6,
        programId: TOKEN_2022_PROGRAM_ID.toBase58(),
        chainId: 101,
        logoURI: '',
        tags: [],
        extensions: {},
        priority: 1000
      }

      let imageUri = ''
      if (tokenImage) {
        console.log('Uploading token image')
        const genericFile = {
          buffer: new Uint8Array(await tokenImage.arrayBuffer()),
          fileName: tokenImage.name,
          displayName: tokenImage.name,
          uniqueName: `${Date.now()}-${tokenImage.name}`,
          contentType: tokenImage.type,
          extension: tokenImage.name.split('.').pop() || '',
          tags: []
        }
        const [uploadedUri] = await umi.uploader.upload([genericFile])
        console.log('Image uploaded, URI:', uploadedUri)
        const response = await fetch(uploadedUri)
        imageUri = response.url
        console.log('Image URI:', imageUri)
      }

      const metadata = {
        name: baseTokenInfo.name,
        symbol: baseTokenInfo.symbol,
        description: tokenDescription + ' ' + 'launched on fomo3d.fun',
        image: imageUri
      }
      console.log('Prepared metadata:', metadata)

      console.log('Uploading metadata')
      const metadataUri = await umi.uploader.uploadJson(metadata)
      console.log('Metadata uploaded, URI:', metadataUri)
      const metadataResponse = await fetch(metadataUri)
      const tokenUri = metadataResponse.url
      console.log('Token URI:', tokenUri)

      console.log('Preparing create instruction')
      // @ts-ignore
      const ix = await program.methods
        .create(baseTokenInfo.name, baseTokenInfo.symbol, tokenUri)
        .accounts({
          mint: mint.publicKey,
          creator: wallet.publicKey,
          program: program.programId,
          tokenProgram2022: TOKEN_2022_PROGRAM_ID
        })
        .instruction()
      console.log('Create instruction prepared')

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 666_000 }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: mint.publicKey,
          lamports: 0.007 * 10 ** 9
        }),
        ix,
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          getAssociatedTokenAddressSync(mint.publicKey, wallet.publicKey, true, TOKEN_2022_PROGRAM_ID),
          wallet.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      )

      if (tokenAmountToBuy && Number(tokenAmountToBuy) > 0) {
        const bAmount = new BN(Number(tokenAmountToBuy) * 10 ** 6)
        console.log('Processing first buyer transaction')
        // @ts-ignore
        const buyIx = await program.methods
          .buy(bAmount, new BN(Number.MAX_SAFE_INTEGER))
          .accounts({
            hydra: new PublicKey('AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ'), // Replace with actual public key
            user: wallet.publicKey,
            mint: mint.publicKey,
            feeRecipient: new PublicKey('AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ'),
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            program: program.programId
          })
          .instruction()
        tx.add(buyIx)
      }

      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 }))
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = wallet.publicKey
      tx.sign(mint)

      console.log('Signing transaction with wallet')
      const signedTx = await wallet.signTransaction(tx)

      console.log('Sending transaction')
      const txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        maxRetries: 2
      })
      await connection.confirmTransaction(txSignature, 'recent')
      console.log('Transaction successful:', txSignature)

      router.push(`https://fomo3d.fun/${mint.publicKey.toBase58()}`)
    } catch (error) {
      console.error('Error creating token:', error)
    } finally {
      setIsCreating(false)
    }
  }, [wallet, umi, connection, router, tokenName, tokenSymbol, tokenDescription, tokenImage, tokenAmount])

  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setTokenImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreviewImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <Box minH="100vh" bg="black" p={8} color="#39FF14">
      <Text fontSize="4xl" fontWeight="bold" mb={6} className="animate-pulse" textAlign="center">
        Launch Your Fomocoin 🚀
      </Text>
      <PanelCard maxWidth="90%" margin="0 auto">
        <Text fontSize="2xl" fontWeight="bold" mb={4}>
          Fomocoin Details
        </Text>
        <VStack spacing={6} align="stretch">
          <Input placeholder="Token Name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} required />
          <Input placeholder="Token Symbol" value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)} required />
          <Textarea placeholder="Token Description" value={tokenDescription} onChange={(e) => setTokenDescription(e.target.value)} />

          <Box>
            <Text mb={2}>Token Image</Text>
            <Flex alignItems="center">
              <Input type="file" accept="image/*" onChange={handleImageChange} display="none" id="file-upload" />
              <label htmlFor="file-upload">
                <Button as="span" colorScheme="blue" mr={4}>
                  Choose File
                </Button>
              </label>
              {previewImage && <Image src={previewImage} alt="Preview" boxSize="100px" objectFit="cover" borderRadius="md" />}
            </Flex>
          </Box>

          <Input placeholder="Website (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} />

          <Text fontSize="sm" color="gray.500">
            Suggested links (optional):
          </Text>
          <Box>
            {twitterHandle !== undefined ? (
              <Input placeholder="Twitter Handle" value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)} />
            ) : (
              <Button variant="outline" leftIcon={<Icon as={FaTwitter} />} onClick={() => setTwitterHandle('')}>
                Add X (Twitter)
              </Button>
            )}
          </Box>
          <Box>
            {telegramHandle !== undefined ? (
              <Input placeholder="Telegram Handle" value={telegramHandle} onChange={(e) => setTelegramHandle(e.target.value)} />
            ) : (
              <Button variant="outline" leftIcon={<Icon as={FaTelegram} />} onClick={() => setTelegramHandle('')}>
                Add Telegram
              </Button>
            )}
          </Box>
          <Box>
            {discordHandle !== undefined ? (
              <Input placeholder="Discord Handle" value={discordHandle} onChange={(e) => setDiscordHandle(e.target.value)} />
            ) : (
              <Button variant="outline" leftIcon={<Icon as={FaDiscord} />} onClick={() => setDiscordHandle('')}>
                Add Discord
              </Button>
            )}
          </Box>
          <Box>
            {githubHandle !== undefined ? (
              <Input placeholder="GitHub Handle" value={githubHandle} onChange={(e) => setGithubHandle(e.target.value)} />
            ) : (
              <Button variant="outline" leftIcon={<Icon as={FaGithub} />} onClick={() => setGithubHandle('')}>
                Add GitHub
              </Button>
            )}
          </Box>
          <Box mt={4}>
            <Text fontSize="sm" mb={2}>
              Tokens you'll receive:
            </Text>
            <Text fontSize="lg" fontWeight="bold">
              {tokenAmountToBuy} tokens
            </Text>
          </Box>
          <Input placeholder="Be the first buyer?" value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} />

          <Button
            type="submit"
            colorScheme="green"
            width="full"
            onClick={handleCreate}
            isLoading={isCreating}
            size="lg"
            fontSize="xl"
            height="60px"
          >
            Launch Fomocoin
          </Button>
        </VStack>
      </PanelCard>
    </Box>
  )
}
