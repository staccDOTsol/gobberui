"use client";

import React, { useState, useCallback, useMemo } from 'react'
import { Button, Card, TextInput, Textarea, FileInput, Stack, Title, Container, Group, Text, Select } from '@mantine/core'
import { DatePickerInput, TimeInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import Decimal from 'decimal.js'
import dayjs from 'dayjs'
// @ts-ignore
import BN from 'bn.js'
import { getATAAddress } from '../../components/types/pda'
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token'

// You'll need to import or define these functions and constants
import { makeCreateAmmConfig, makeCreateCpmmPoolInInstruction, makeInitializeMetadata } from '../../components/types/instruction'
import {  getCreatePoolKeys} from 'tokengobbler'
import { useRouter } from 'next/navigation'
const MAX_URI_LENGTH = 200 // Define this constant based on your requirements
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

export default function CreatePage() {
  const router = useRouter()
  const [poolName, setPoolName] = useState('')
  const [poolSymbol, setPoolSymbol] = useState('')
  const [poolDescription, setPoolDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [telegramHandle, setTelegramHandle] = useState('')
  const [discordHandle, setDiscordHandle] = useState('')
  const [githubHandle, setGithubHandle] = useState('')
  const [twitterHandle, setTwitterHandle] = useState('')
  const [poolImage, setPoolImage] = useState<File | null>(null)
  const [baseToken, setBaseToken] = useState('')
  const [quoteToken, setQuoteToken] = useState('')
  const [baseAmount, setBaseAmount] = useState('')
  const [quoteAmount, setQuoteAmount] = useState('')
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [startTime, setStartTime] = useState('')
  const [startDateMode, setStartDateMode] = useState<'now' | 'custom'>('now')

  const { connection } = useConnection()
  const wallet = useWallet()

  const umi = useMemo(() => {
    const u = createUmi(connection)
      .use(irysUploader())
      .use(mplToolbox());

    if (wallet.publicKey) {
      return u.use(walletAdapterIdentity(wallet));
    }
    return u;
  }, [wallet, connection]);

  const shortenUrl = async (url: string): Promise<string> => {
    try {
      const response = await fetch(`http://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
      return await response.text();
    } catch (error) {
      console.error('Error shortening URL:', error);
      return url.substring(0, MAX_URI_LENGTH);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poolImage || !wallet.publicKey) {
      notifications.show({
        title: 'Error',
        message: 'Please upload a pool image and connect your wallet',
        color: 'red',
      })
      return
    }

    try {
      notifications.show({
        title: 'Processing',
        message: 'Creating your memecoin...',
        loading: true,
        autoClose: false,
        withCloseButton: false,
      })

      const genericFile = {
        buffer: new Uint8Array(await poolImage.arrayBuffer()),
        fileName: poolImage.name,
        displayName: poolImage.name,
        uniqueName: `${Date.now()}-${poolImage.name}`,
        contentType: poolImage.type,
        extension: poolImage.name.split('.').pop() || '',
        tags: []
      }
      const [imageUri] = await umi.uploader.upload([genericFile])

      const metadata = {
        name: poolName,
        symbol: poolSymbol,
        description: poolDescription,
        seller_fee_basis_points: 500,
        image: imageUri,
        external_url: website,
        attributes: [],
        properties: {
          files: [
            {
              uri: imageUri,
              type: poolImage.type
            }
          ],
          category: "image"
        },
        extensions: {
          website: website,
          telegram: telegramHandle,
          discord: discordHandle,
          github: githubHandle,
          twitter: twitterHandle
        }
      };

      if (poolImage.type.startsWith("video/")) {
        metadata.properties.category = "video";
        // @ts-ignore
        metadata.animation_url = imageUri;
        
        const video = document.createElement('video');
        video.src = URL.createObjectURL(poolImage);
        video.load();
        
        await new Promise<void>((resolve) => {
          video.onloadeddata = () => {
            video.currentTime = 1;
            
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const snapshotImageUri = canvas.toDataURL('image/jpeg');
            
            metadata.properties.files.push({
              uri: snapshotImageUri,
              type: "image/jpeg"
            });
            resolve();
          };
        });
      } else if (poolImage.type.startsWith("audio/")) {
        metadata.properties.category = "audio";
        // @ts-ignore
        metadata.animation_url = imageUri;
      }

      const uri = await umi.uploader.uploadJson(metadata)

      const payer = wallet.publicKey;
      const isFront = new BN(new PublicKey(baseToken).toBuffer()).lte(
        new BN(new PublicKey(quoteToken).toBuffer()),
      );

      const [mintA, mintB] = isFront ? [baseToken, quoteToken] : [quoteToken, baseToken];
      const [mintAAmount, mintBAmount] = isFront
        ? [baseAmount, quoteAmount]
        : [quoteAmount, baseAmount];

      const mintAUseSOLBalance = mintA === NATIVE_MINT.toBase58();
      const mintBUseSOLBalance = mintB === NATIVE_MINT.toBase58();
      const [mintAPubkey, mintBPubkey] = [new PublicKey(mintA), new PublicKey(mintB)];

      const programId = new PublicKey('Your_Program_ID_Here'); // Replace with your actual program ID

      const configId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      const [ammConfigKey, _bump] = PublicKey.findProgramAddressSync(
          [Buffer.from("amm_config"), new BN(configId).toArrayLike(Buffer, 'be', 8)],
          programId
      );
      const poolKeys = getCreatePoolKeys({
        creator: wallet.publicKey,
        programId,
        mintA: mintAPubkey,
        mintB: mintBPubkey,
        configId: ammConfigKey
      });
      poolKeys.configId = ammConfigKey;

      const startTimeValue = startDateMode === 'custom' && startDate && startTime
        ? new Date(`${startDate.toDateString()} ${startTime}`).getTime() / 1000
        : Math.floor(Date.now() / 1000);

      const instructions = [
        makeCreateAmmConfig(
          programId,
          wallet.publicKey,
          ammConfigKey,
          new BN(configId),
          new BN(2500), // token1LpRate
          new BN(2500), // token0LpRate
          new BN(2500), // token0CreatorRate
          new BN(2500)  // token1CreatorRate
        ),
        makeCreateCpmmPoolInInstruction(
          programId,
          wallet.publicKey,
          ammConfigKey,
          poolKeys.authority,
          poolKeys.poolId,
          mintAPubkey,
          mintBPubkey,
          poolKeys.lpMint,
          await getATAAddress(wallet.publicKey, mintAPubkey).publicKey,
          await getATAAddress(wallet.publicKey, mintBPubkey).publicKey,
          await getATAAddress(wallet.publicKey, poolKeys.lpMint).publicKey,
          poolKeys.vaultA,
          poolKeys.vaultB,
          TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          poolKeys.observationId,
          new BN(mintAAmount),
          new BN(mintBAmount),
          new BN(startTimeValue),
        ),
        makeInitializeMetadata(
          programId,
          wallet.publicKey,
          poolKeys.authority,
          poolKeys.lpMint,
          METADATA_PROGRAM_ID,
          PublicKey.findProgramAddressSync(
            [
              Buffer.from("metadata"),
              METADATA_PROGRAM_ID.toBuffer(),
              poolKeys.lpMint.toBuffer(),
            ],
            METADATA_PROGRAM_ID
          )[0],
          SystemProgram.programId,
          SYSVAR_RENT_PUBKEY,
          ammConfigKey,
          poolKeys.poolId,
          poolKeys.observationId,
          poolName,
          poolSymbol,
          await shortenUrl(uri)
        ),
      ];

      // Here you would typically send these instructions to the blockchain
      // For demonstration, we'll just log them
      console.log('Instructions:', instructions);
      // Inside the handleSubmit function, after creating the pool
      const poolId = poolKeys.poolId.toString()
      router.push(`/explorer/${poolId}`)

      notifications.show({
        title: 'Success',
        message: 'Your memecoin has been created! Redirecting to explorer...',
        color: 'green',
      })
    } catch (error) {
      console.error('Error creating pool:', error)
      notifications.show({
        title: 'Error',
        message: 'Failed to create pool. Please try again.',
        color: 'red',
      })
    }
  }

  const currentPrice = useMemo(() => {
    try {
    if (new Decimal(baseAmount).lte(0) || new Decimal(quoteAmount).lte(0)) {
      return ''
    }
  } catch (err){
    return ''
  }
    return new Decimal(quoteAmount).div(baseAmount).toString()
  }, [baseAmount, quoteAmount])

  return (
    <Container fluid className="min-h-screen bg-black p-8" style={{ color: '#39FF14' }}>
      <Title order={1} mb="xl" className="animate-pulse" style={{ fontSize: '2.25rem' }}>
        Launch Your Memecoin 🚀
      </Title>
      <Card withBorder style={{ backgroundColor: 'black', borderColor: '#39FF14' }}>
        <Card.Section>
          <Title order={2} p="md" style={{ color: '#39FF14' }}>Memecoin Details</Title>
        </Card.Section>
        <Card.Section p="md">
          <form onSubmit={handleSubmit}>
            <Stack>
              <TextInput
                label="Pool Name"
                placeholder="Pool Name"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
                required
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="Pool Symbol"
                placeholder="Pool Symbol"
                value={poolSymbol}
                onChange={(e) => setPoolSymbol(e.target.value)}
                required
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <Textarea
                label="Pool Description"
                placeholder="Provide a brief description of your pool"
                value={poolDescription}
                onChange={(e) => setPoolDescription(e.target.value)}
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="Website"
                placeholder="https://example.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="Telegram Handle"
                placeholder="@username or t.me/username"
                value={telegramHandle}
                onChange={(e) => setTelegramHandle(e.target.value)}
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="Discord Handle"
                placeholder="username#0000"
                value={discordHandle}
                onChange={(e) => setDiscordHandle(e.target.value)}
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="GitHub Handle"
                placeholder="username"
                value={githubHandle}
                onChange={(e) => setGithubHandle(e.target.value)}
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="Twitter Handle"
                placeholder="@username"
                value={twitterHandle}
                onChange={(e) => setTwitterHandle(e.target.value)}
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <FileInput
                label="Pool Image"
                placeholder="Upload Pool Image"
                accept="image/*,video/*,audio/*"
                onChange={setPoolImage}
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="Base Token"
                placeholder="Base Token Address"
                value={baseToken}
                onChange={(e) => setBaseToken(e.target.value)}
                required
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="Quote Token"
                placeholder="Quote Token Address"
                value={quoteToken}
                onChange={(e) => setQuoteToken(e.target.value)}
                required
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="Base Amount"
                placeholder="Base Amount"
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
                required
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <TextInput
                label="Quote Amount"
                placeholder="Quote Amount"
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
                required
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              <Text>Current Price: {currentPrice || '-'}</Text>
              <Select
                label="Start Time"
                placeholder="Select start time"
                data={[
                  { value: 'now', label: 'Start Now' },
                  { value: 'custom', label: 'Custom' },
                ]}
                value={startDateMode}
                onChange={(value) => setStartDateMode(value as 'now' | 'custom')}
                styles={(theme) => ({
                  input: {
                    backgroundColor: 'black',
                    color: '#39FF14',
                    borderColor: '#39FF14',
                  },
                })}
              />
              {startDateMode === 'custom' && (
                <Group grow>
                  <DatePickerInput
                    label="Start Date"
                    placeholder="Pick date"
                    value={startDate}
                    onChange={setStartDate}
                    minDate={new Date()}
                    styles={(theme) => ({
                      input: {
                        backgroundColor: 'black',
                        color: '#39FF14',
                        borderColor: '#39FF14',
                      },
                    })}
                  />
                  <TimeInput
                    label="Start Time"
                    placeholder="Pick time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    styles={(theme) => ({
                      input: {
                        backgroundColor: 'black',
                        color: '#39FF14',
                        borderColor: '#39FF14',
                      },
                    })}
                  />
                </Group>
              )}
              <Button 
                type="submit" 
                fullWidth
                styles={(theme) => ({
                  root: {
                    backgroundColor: '#39FF14',
                    color: 'black',
                    '&:hover': {
                      backgroundColor: '#4D4DFF',
                    },
                  },
                })}
              >
                Launch Memecoin
              </Button>
            </Stack>
          </form>
        </Card.Section>
      </Card>
    </Container>
  )
}