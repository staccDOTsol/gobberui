'use client'

import { useState, useEffect } from 'react'
import { ArrowUpDown, RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'

type Greek = {
  mint: string
  lastPrice: number
  volatility: number
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
  metadata?: {
    name: string
    symbol: string
    image: string
  }
  candles: {
    timestamp: number
    close: number
  }[]
}

export default function FinancialGreeksUI() {
  const [greeks, setGreeks] = useState<Greek[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: keyof Greek; direction: 'asc' | 'desc' }>({ key: 'lastPrice', direction: 'desc' })
  const [isLoading, setIsLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const fetchGreeks = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/bump')
      const data = await response.json()
      setGreeks(data)
    } catch (error) {
      console.error('Error fetching Greeks:', error)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchGreeks()
  }, [])

  const sortGreeks = (key: keyof Greek) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })

    setGreeks(prevGreeks => [...prevGreeks].sort((a: Greek, b: Greek) => {
      if (a[key] !== undefined && b[key] !== undefined) {
        if (a[key] < b[key]) return direction === 'asc' ? -1 : 1
        if (a[key] > b[key]) return direction === 'asc' ? 1 : -1
      }
      return 0
    }))
  }

  const toggleRowExpansion = (mint: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(mint)) {
        newSet.delete(mint)
      } else {
        newSet.add(mint)
      }
      return newSet
    })
  }

  const greekDescriptions = {
    delta: "Measures the rate of change in the option price with respect to the change in the underlying asset's price.",
    gamma: "Measures the rate of change in delta with respect to the change in the underlying asset's price.",
    theta: "Measures the rate of change in the option price with respect to time.",
    vega: "Measures the rate of change in the option price with respect to changes in the underlying asset's volatility.",
    rho: "Measures the rate of change in the option price with respect to the risk-free interest rate."
  }

  return (
    <Card className="w-full max-w-6xl mx-auto">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Financial Greeks Dashboard</span>
          <Button onClick={fetchGreeks} disabled={isLoading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead className="cursor-pointer" onClick={() => sortGreeks('lastPrice')}>
                Last Price <ArrowUpDown className="inline-block ml-1 h-4 w-4" />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => sortGreeks('volatility')}>
                Volatility <ArrowUpDown className="inline-block ml-1 h-4 w-4" />
              </TableHead>
              {Object.keys(greekDescriptions).map(greek => (
                <TableHead key={greek} className="cursor-pointer" onClick={() => sortGreeks(greek as keyof Greek)}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>{greek.charAt(0).toUpperCase() + greek.slice(1)}</TooltipTrigger>
                      <TooltipContent>
                        <p>{greekDescriptions[greek as keyof typeof greekDescriptions]}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <ArrowUpDown className="inline-block ml-1 h-4 w-4" />
                </TableHead>
              ))}
              <TableHead>Graph</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {greeks && greeks.map((greek, index) => (
              <>
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      {greek.metadata?.image && (
                        <img src={greek.metadata.image} alt={greek.metadata.name} className="w-6 h-6 mr-2 rounded-full" />
                      )}
                      <span>{greek.metadata?.symbol || greek.mint}</span>
                    </div>
                  </TableCell>
                  <TableCell>{greek.lastPrice.toFixed(2)}</TableCell>
                  <TableCell>{greek.volatility?.toFixed(4)}</TableCell>
                  <TableCell>{greek.delta?.toFixed(4)}</TableCell>
                  <TableCell>{greek.gamma?.toFixed(4)}</TableCell>
                  <TableCell>{greek.theta?.toFixed(4)}</TableCell>
                  <TableCell>{greek.vega?.toFixed(4)}</TableCell>
                  <TableCell>{greek.rho?.toFixed(4)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" onClick={() => toggleRowExpansion(greek.mint)}>
                      {expandedRows.has(greek.mint) ? <ChevronUp /> : <ChevronDown />}
                    </Button>
                  </TableCell>
                </TableRow>
                {expandedRows.has(greek.mint) && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={greek.candles}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="timestamp" 
                              tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString()}
                            />
                            <YAxis />
                            <RechartsTooltip
                              labelFormatter={(label) => new Date(label).toLocaleString()}
                              formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
                            />
                            <Line type="monotone" dataKey="close" stroke="#8884d8" dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}