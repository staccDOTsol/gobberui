'use client'
import { createContext, useContext, ReactNode } from 'react';
import { useWallet, WalletProvider } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/router';
import TokenDetails from '@/components/mintAddress';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { useState, useEffect } from 'react';

interface WalletProviderContextType {
  publicKey: string | null;
  connected: boolean;
  // Add other wallet-related properties as needed
}

const WalletProviderContext = createContext<WalletProviderContextType | undefined>(undefined);

export function useWalletProvider() {
  const context = useContext(WalletProviderContext);
  if (context === undefined) {
    throw new Error('useWalletProvider must be used within a WalletProviderContextProvider');
  }
  return context;
}

interface WalletProviderContextProviderProps {
  children: ReactNode;
}

function WalletProviderContextProvider({ children }: WalletProviderContextProviderProps) {
  const { publicKey, connected } = useWallet();
  const router = useRouter();
  const { mintAddress } = router.query;
  const [candlestickData, setCandlestickData] = useState([]);
  const [tokenMetadata, setTokenMetadata] = useState(null);

  useEffect(() => {
    const fetchTokenMetadata = async () => {
      if (!mintAddress) return;

      try {
        const heliusOptions = {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        };
        const heliusResponse = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=0d4b4fd6-c2fc-4f55-b615-a23bab1ffc85&query=${mintAddress}`, heliusOptions);
        if (!heliusResponse.ok) {
          throw new Error('Failed to fetch token metadata from Helius');
        }
        const heliusData = await heliusResponse.json();
        console.log(heliusData);
        setTokenMetadata(heliusData[0]);
      } catch (error) {
        console.error('Error fetching token metadata:', error);
      }
    };

    fetchTokenMetadata();
  }, [mintAddress]);

  useEffect(() => {
    const fetchCandlestickData = async () => {
      if (!mintAddress) return;
    try {
      const tradeResponse = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timestamp: Date.now(),
          mint: mintAddress,
        }),
      });
      
      if (!tradeResponse.ok) {
        console.error('Error hitting /api/trade:', await tradeResponse.text());
        throw new Error('Failed to hit /api/trade');
      }
        
        const response = await fetch(`/api/candlesticks?mint=${mintAddress}&timeframe=1s`);
        if (!response.ok) {
          throw new Error('Failed to fetch candlestick data');
        }
        const data = await response.json();
        setCandlestickData(data);
      } catch (error) {
        console.error('Error fetching candlestick data:', error);
      }
    };

    fetchCandlestickData();

    const interval = setInterval(fetchCandlestickData, 60000); // Fetch every minute

    return () => clearInterval(interval);
  }, [mintAddress]);

  const value = {
    publicKey: publicKey ? publicKey.toBase58() : null,
    connected,
    // Add other wallet-related properties as needed
  };

  return (
    <WalletProviderContext.Provider value={value}>
      <TokenDetails mintAddress={mintAddress as string} candlestickData={candlestickData}  />
    </WalletProviderContext.Provider>
  );
}

export default function MintAddressPage() {
  const router = useRouter();
  const { mintAddress } = router.query;

  return (
    <WalletProvider wallets={[new PhantomWalletAdapter()]}>
      <WalletProviderContextProvider>
        <TokenDetails mintAddress={mintAddress as string} candlestickData={[]} />
      </WalletProviderContextProvider>
    </WalletProvider>
  );
}
