'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { 
  getProviders, 
  addProvider, 
  updateProvider, 
  removeProvider, 
  setProviderAsDefault,
  getDefaultProviderId,
  getFinancialDatasetsApiKey, 
  setFinancialDatasetsApiKey
} from '@/lib/db/api-keys';
import { validateOpenAIKey } from '@/lib/utils/api-key-validation';
import { addCustomModel, removeCustomModel, getCustomModels, Model } from '@/lib/ai/models';
import { ModelProviderConfig } from '@/lib/db/api-keys';


interface ApiKeysModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}

export function ApiKeysModal({ 
  open, 
  onOpenChange, 
  title = "Configure API keys",
  description 
}: ApiKeysModalProps) {
  const [providers, setProviders] = useState<ModelProviderConfig[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string>('default');
  const [financialKey, setFinancialKey] = useState(getFinancialDatasetsApiKey() || '');
  const [showFinancialKey, setShowFinancialKey] = useState(false);
  const [openAIError, setOpenAIError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Add provider form
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderApiKey, setNewProviderApiKey] = useState('');
  const [newProviderBaseURL, setNewProviderBaseURL] = useState('');
  const [newProviderError, setNewProviderError] = useState<string>('');
  
  // Custom models
  const [customModels, setCustomModels] = useState<Model[]>([]);
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelLabel, setNewModelLabel] = useState('');
  const [newModelDescription, setNewModelDescription] = useState('');

  // Load data on mount
  useEffect(() => {
    if (open) {
      setProviders(getProviders());
      setDefaultProviderId(getDefaultProviderId());
      setCustomModels(getCustomModels());
    }
  }, [open]);

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setOpenAIError('');

      // Validate default provider
      const defaultProvider = providers.find(p => p.id === defaultProviderId);
      if (defaultProvider) {
        const { isValid, error } = await validateOpenAIKey(defaultProvider.apiKey, defaultProvider.baseURL);
        if (!isValid) {
          setOpenAIError(error ?? 'Invalid API key for default provider');
          return;
        }
      }

      await setFinancialDatasetsApiKey(financialKey);
      onOpenChange(false);
    } catch (error) {
      setOpenAIError('An unexpected error occurred. Please try again.');
      console.error('Error saving API keys:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProvider = async () => {
    if (!newProviderName || !newProviderApiKey) return;
    
    setNewProviderError('');
    const { isValid, error } = await validateOpenAIKey(newProviderApiKey, newProviderBaseURL || undefined);
    
    if (!isValid) {
      setNewProviderError(error ?? 'Invalid API key');
      return;
    }

    const provider = addProvider({
      name: newProviderName,
      apiKey: newProviderApiKey,
      baseURL: newProviderBaseURL || undefined,
    });
    
    setProviders(getProviders());
    setShowAddProvider(false);
    setNewProviderName('');
    setNewProviderApiKey('');
    setNewProviderBaseURL('');
    setNewProviderError('');
  };

  const handleRemoveProvider = (id: string) => {
    removeProvider(id);
    setProviders(getProviders());
    setDefaultProviderId(getDefaultProviderId());
  };

  const handleSetDefault = (id: string) => {
    setProviderAsDefault(id);
    setDefaultProviderId(id);
  };

  const handleUpdateProvider = (id: string, updates: Partial<ModelProviderConfig>) => {
    updateProvider(id, updates);
    setProviders(getProviders());
  };

  const loadCustomModels = () => {
    setCustomModels(getCustomModels());
  };

  const handleAddCustomModel = () => {
    if (!newModelId || !newModelLabel) return;
    
    const model: Model = {
      id: newModelId,
      label: newModelLabel,
      apiIdentifier: newModelId,
      description: newModelDescription || 'Custom model',
      isCustom: true,
    };
    
    addCustomModel(model);
    loadCustomModels();
    setShowAddModel(false);
    setNewModelId('');
    setNewModelLabel('');
    setNewModelDescription('');
  };

  const handleRemoveCustomModel = (modelId: string) => {
    removeCustomModel(modelId);
    loadCustomModels();
  };

  const defaultProvider = providers.find(p => p.id === 'default');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
          
          {/* Providers Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Model Providers</label>
              <button
                type="button"
                onClick={() => setShowAddProvider(true)}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                <Plus size={14} /> Add Provider
              </button>
            </div>
            
            {showAddProvider && (
              <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
                <div className="space-y-2">
                  <Label htmlFor="provider-name">Provider Name</Label>
                  <Input
                    id="provider-name"
                    type="text"
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    placeholder="e.g., Together.ai, Groq, OpenRouter"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-api-key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="provider-api-key"
                      type="password"
                      value={newProviderApiKey}
                      onChange={(e) => setNewProviderApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-baseurl">Base URL</Label>
                  <Input
                    id="provider-baseurl"
                    type="text"
                    value={newProviderBaseURL}
                    onChange={(e) => setNewProviderBaseURL(e.target.value)}
                    placeholder="https://api.together.xyz/v1"
                  />
                  <p className="text-xs text-muted-foreground">
                    OpenAI-compatible API endpoint
                  </p>
                </div>
                {newProviderError && (
                  <p className="text-sm text-red-500">{newProviderError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setShowAddProvider(false)}>Cancel</Button>
                  <Button onClick={handleAddProvider} disabled={!newProviderName || !newProviderApiKey}>Add</Button>
                </div>
              </div>
            )}
            
            {/* Providers List */}
            <RadioGroup value={defaultProviderId} onValueChange={handleSetDefault} className="space-y-2">
              {providers.map((provider) => (
                <div 
                  key={provider.id} 
                  className={`flex items-center justify-between p-3 border rounded ${
                    provider.id === defaultProviderId ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <RadioGroupItem value={provider.id} className="flex-shrink-0" />
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{provider.name}</span>
                        {provider.id === 'default' && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Default</span>
                        )}
                        {provider.id === defaultProviderId && provider.id !== 'default' && (
                          <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">Active</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {provider.baseURL || 'https://api.openai.com/v1 (default)'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {provider.id !== 'default' && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveProvider(provider.id)}
                        className="text-muted-foreground hover:text-red-500"
                        title="Remove provider"
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              
              {providers.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  No providers configured. Add a provider or configure the default OpenAI provider.
                </div>
              )}
            </RadioGroup>
          </div>
          
          {/* Custom Models Section */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Custom Models</label>
              <button
                type="button"
                onClick={() => setShowAddModel(!showAddModel)}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                <Plus size={14} /> Add Model
              </button>
            </div>
            
            {showAddModel && (
              <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
                <div className="space-y-2">
                  <Label htmlFor="custom-model-id">Model ID</Label>
                  <Input
                    id="custom-model-id"
                    type="text"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder="e.g., meta-llama/Llama-3-70b-chat-hf"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-model-label">Display Name</Label>
                  <Input
                    id="custom-model-label"
                    type="text"
                    value={newModelLabel}
                    onChange={(e) => setNewModelLabel(e.target.value)}
                    placeholder="e.g., Llama 3 70B"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-model-description">Description (Optional)</Label>
                  <Input
                    id="custom-model-description"
                    type="text"
                    value={newModelDescription}
                    onChange={(e) => setNewModelDescription(e.target.value)}
                    placeholder="Brief description of the model"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setShowAddModel(false)}>Cancel</Button>
                  <Button onClick={handleAddCustomModel} disabled={!newModelId || !newModelLabel}>Add</Button>
                </div>
              </div>
            )}
            
            {customModels.length > 0 && (
              <div className="space-y-2">
                {customModels.map((model) => (
                  <div key={model.id} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{model.label}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-1 rounded">{model.id}</span>
                      </div>
                      {model.description && (
                        <div className="text-xs text-muted-foreground">{model.description}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveCustomModel(model.id)}
                      className="text-muted-foreground hover:text-red-500 p-1"
                      title="Remove custom model"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Financial Datasets API Key */}
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="financial-key" className="text-sm font-medium">
              Financial Datasets API Key
            </Label>
            <div className="relative">
              <Input
                id="financial-key"
                type={showFinancialKey ? "text" : "password"}
                value={financialKey}
                onChange={(e) => setFinancialKey(e.target.value)}
                placeholder="Enter your Financial Datasets API key"
              />
              <button
                type="button"
                onClick={() => setShowFinancialKey(!showFinancialKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showFinancialKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your API key from{' '}
              <a 
                href="https://financialdatasets.ai" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                financialdatasets.ai
              </a>
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 