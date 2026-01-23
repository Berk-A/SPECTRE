import { useState } from 'react'
import { Settings, Gauge, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Badge } from '@/components/ui'
import { useTee, type StrategyConfig as StrategyConfigType } from '@/hooks/useTee'
import { cn } from '@/lib/utils'

type RiskLevel = 'conservative' | 'moderate' | 'aggressive'

const RISK_LEVELS: { value: RiskLevel; label: string; description: string }[] = [
  {
    value: 'conservative',
    label: 'Conservative',
    description: 'Lower risk, smaller positions',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    description: 'Balanced risk and reward',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    description: 'Higher risk, larger positions',
  },
]

export function StrategyConfig() {
  const { strategyConfig, updateStrategyConfig, delegationStatus } = useTee()
  const [localConfig, setLocalConfig] = useState<StrategyConfigType>(strategyConfig)
  const [hasChanges, setHasChanges] = useState(false)

  const handleRiskLevelChange = (level: RiskLevel) => {
    setLocalConfig((prev) => ({ ...prev, riskLevel: level }))
    setHasChanges(true)
  }

  const handleConfigChange = (key: keyof StrategyConfigType, value: number) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    updateStrategyConfig(localConfig)
    setHasChanges(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-neon-cyan" />
          Strategy Configuration
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Risk Level Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-white/80">Risk Level</label>
          <div className="grid grid-cols-3 gap-3">
            {RISK_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => handleRiskLevelChange(level.value)}
                className={cn(
                  'p-3 rounded-lg border transition-all text-left',
                  localConfig.riskLevel === level.value
                    ? 'border-neon-cyan bg-neon-cyan/10'
                    : 'border-glass-border hover:border-neon-cyan/30'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Gauge
                    className={cn(
                      'h-4 w-4',
                      localConfig.riskLevel === level.value
                        ? 'text-neon-cyan'
                        : 'text-white/40'
                    )}
                  />
                  <span className="text-sm font-medium">{level.label}</span>
                </div>
                <p className="text-xs text-white/50">{level.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Position Size */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-white/60" />
            <label className="text-sm font-medium text-white/80">
              Max Position Size (USDC)
            </label>
          </div>
          <Input
            type="number"
            value={localConfig.maxPositionSize}
            onChange={(e) =>
              handleConfigChange('maxPositionSize', parseFloat(e.target.value) || 0)
            }
            min={1}
            max={10000}
          />
          <p className="text-xs text-white/50">
            Maximum USDC to allocate per trade
          </p>
        </div>

        {/* Stop Loss */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-status-error" />
            <label className="text-sm font-medium text-white/80">Stop Loss (%)</label>
          </div>
          <Input
            type="number"
            value={localConfig.stopLoss}
            onChange={(e) =>
              handleConfigChange('stopLoss', parseFloat(e.target.value) || 0)
            }
            min={1}
            max={50}
          />
          <p className="text-xs text-white/50">
            Close position if loss exceeds this percentage
          </p>
        </div>

        {/* Take Profit */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-status-success" />
            <label className="text-sm font-medium text-white/80">
              Take Profit (%)
            </label>
          </div>
          <Input
            type="number"
            value={localConfig.takeProfit}
            onChange={(e) =>
              handleConfigChange('takeProfit', parseFloat(e.target.value) || 0)
            }
            min={1}
            max={100}
          />
          <p className="text-xs text-white/50">
            Close position when profit reaches this percentage
          </p>
        </div>

        {/* Status indicator */}
        {!delegationStatus.isDelegated && (
          <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/30">
            <p className="text-xs text-status-warning">
              Delegate to TEE to enable automated strategy execution
            </p>
          </div>
        )}

        {/* Save button */}
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={!hasChanges}
          variant={hasChanges ? 'primary' : 'default'}
        >
          {hasChanges ? 'Save Configuration' : 'No Changes'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default StrategyConfig
