'use client';

import { useMemo, useState } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { getProviders, getDefaultProviderId, setDefaultProviderId, } from '@/lib/db/api-keys';
import { cn } from '@/lib/utils';

export function ProviderSelector({
  className,
}: {
  className?: string;
}) {
  const providers = useMemo(() => getProviders(), []);
  const defaultProviderId = useMemo(() => getDefaultProviderId(), []);
  const [selectedProviderId, setSelectedProviderId] = useState(defaultProviderId);

  const handleChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    setDefaultProviderId(providerId);
  };

  if (providers.length <= 1) {
    // Only show if there are multiple providers
    const provider = providers[0];
    if (provider) {
      return (
        <div className={cn('flex items-center gap-2', className)}>
          <Label className="text-xs text-muted-foreground">Provider</Label>
          <span className="text-sm font-medium px-2 py-1 bg-muted rounded">
            {provider.name}
          </span>
        </div>
      );
    }
    return null;
  }

  return (
    <RadioGroup value={selectedProviderId} onValueChange={handleChange} className={cn('flex items-center gap-2', className)}>
      <Label className="text-xs text-muted-foreground">Provider</Label>
      <div className="flex items-center gap-1 bg-muted rounded p-0.5">
        {providers.map((provider) => (
          <RadioGroupItem 
            key={provider.id} 
            value={provider.id} 
            className="flex items-center gap-1 px-2 py-1 text-sm font-medium rounded-md hover:bg-background transition-colors"
          >
            {provider.name}
          </RadioGroupItem>
        ))}
      </div>
    </RadioGroup>
  );
}