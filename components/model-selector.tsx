'use client';

import { startTransition, useMemo, useOptimistic, useState } from 'react';

import { saveModelId } from '@/app/(chat)/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { models, getAllModels, getCustomModels, removeCustomModel, getModelsForProvider } from '@/lib/ai/models';
import { getDefaultProviderId } from '@/lib/db/api-keys';
import { cn } from '@/lib/utils';

import { CheckCircleFillIcon, ChevronDownIcon, TrashIcon } from './icons';

export function ModelSelector({
  selectedModelId,
  className,
}: {
  selectedModelId: string;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);
  const [optimisticModelId, setOptimisticModelId] =
    useOptimistic(selectedModelId);

  // Get the current provider ID to filter models
  const providerId = useMemo(() => getDefaultProviderId(), [optimisticModelId]);

  const allModels = useMemo(
    () => getModelsForProvider(providerId),
    [providerId, optimisticModelId],
  );

  const selectedModel = useMemo(
    () => allModels.find((model) => model.id === optimisticModelId),
    [allModels, optimisticModelId],
  );

  const customModels = useMemo(
    () => getCustomModels().filter(m => !m.providerId || m.providerId === providerId),
    [providerId, optimisticModelId],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className,
        )}
      >
        <Button variant="outline" className="md:px-2 md:h-[34px]">
          {selectedModel?.label}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[300px] max-h-[400px] overflow-y-auto">
        {/* Default Models */}
        <div className="space-y-1">
          {models.filter(m => !m.providerId || m.providerId === providerId).map((model) => (
            <DropdownMenuItem
              key={model.id}
              onSelect={() => {
                setOpen(false);

                startTransition(() => {
                  setOptimisticModelId(model.id);
                  saveModelId(model.id);
                });
              }}
              className="gap-4 group/item flex flex-row justify-between items-center"
              data-active={model.id === optimisticModelId}
            >
              <div className="flex flex-col gap-1 items-start">
                {model.label}
                {model.description && (
                  <div className="text-xs text-muted-foreground">
                    {model.description}
                  </div>
                )}
              </div>
              <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
                <CheckCircleFillIcon />
              </div>
            </DropdownMenuItem>
          ))}
        </div>
        
        {/* Custom Models */}
        {customModels.length > 0 && (
          <>
            <div className="border-t my-2" />
            <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
              Custom Models
            </div>
            <div className="space-y-1">
              {customModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onSelect={() => {
                    setOpen(false);

                    startTransition(() => {
                      setOptimisticModelId(model.id);
                      saveModelId(model.id);
                    });
                  }}
                  className="gap-4 group/item flex flex-row justify-between items-center relative"
                  data-active={model.id === optimisticModelId}
                >
                  <div className="flex flex-col gap-1 items-start pr-8">
                    <div className="flex items-center gap-1">
                      {model.label}
                      <span className="text-xs text-muted-foreground bg-muted px-1 rounded">Custom</span>
                    </div>
                    {model.description && (
                      <div className="text-xs text-muted-foreground">
                        {model.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
                      <CheckCircleFillIcon />
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeCustomModel(model.id);
                      }}
                      className="text-muted-foreground hover:text-red-500 opacity-0 group-hover/item:opacity-100 p-1"
                      title="Remove custom model"
                    >
                      <TrashIcon size={12} />
                    </button>
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
