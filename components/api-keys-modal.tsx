'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { getOpenAIApiKey, setOpenAIConfig, getFinancialDatasetsApiKey, setFinancialDatasetsApiKey, getOpenAIBaseURL, getOpenAIProviderName } from '@/lib/db/api-keys';
import { validateOpenAIKey } from '@/lib/utils/api-key-validation';
import { addCustomModel, removeCustomModel, getCustomModels, Model } from '@/lib/ai/models';


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
  const [openAIKey, setOpenAIKey] = useState(getOpenAIApiKey() || '');
  const [openAIBaseURL, setOpenAIBaseURL] = useState(getOpenAIBaseURL() || '');
  const [openAIProviderName, setOpenAIProviderName] = useState(getOpenAIProviderName() || '');
  const [financialKey, setFinancialKey] = useState(getFinancialDatasetsApiKey() || '');
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showFinancialKey, setShowFinancialKey] = useState(false);
  const [openAIError, setOpenAIError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Custom models
  const [customModels, setCustomModels] = useState<Model[]>([]);
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelLabel, setNewModelLabel] = useState('');
  const [newModelDescription, setNewModelDescription] = useState('');

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setOpenAIError('');

      const { isValid, error } = await validateOpenAIKey(openAIKey, openAIBaseURL || undefined);
      
      if (!isValid) {
        setOpenAIError(error ?? 'Invalid OpenAI API key');
        return;
      }

      await Promise.all([
        setOpenAIConfig({
          apiKey: openAIKey,
          baseURL: openAIBaseURL || undefined,
          name: openAIProviderName || undefined,
        }),
        setFinancialDatasetsApiKey(financialKey)
      ]);

      onOpenChange(false);
    } catch (error) {
      setOpenAIError('An unexpected error occurred. Please try again.');
      console.error('Error saving API keys:', error);
    } finally {
      setIsLoading(false);
    }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="openai-key" className="text-sm font-medium">
              OpenAI API Key
            </label>
            <div className="relative">
              <Input
                id="openai-key"
                type={showOpenAIKey ? "text" : "password"}
                value={openAIKey}
                onChange={(e) => setOpenAIKey(e.target.value)}
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showOpenAIKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {openAIError && (
              <p className="text-sm text-red-500 mt-1">
                {openAIError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Get your API key from{' '}
              <a 
                href="https://platform.openai.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                platform.openai.com
              </a>
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="openai-baseurl" className="text-sm font-medium">
              Base URL (Optional - for OpenAI-compatible providers)
            </label>
            <Input
              id="openai-baseurl"
              type="text"
              value={openAIBaseURL}
              onChange={(e) => setOpenAIBaseURL(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for default OpenAI API. Use custom URL for providers like Together.ai, Groq, etc.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="openai-provider-name" className="text-sm font-medium">
              Provider Name (Optional)
            </label>
            <Input
              id="openai-provider-name"
              type="text"
              value={openAIProviderName}
              onChange={(e) => setOpenAIProviderName(e.target.value)}
              placeholder="openai"
            />
            <p className="text-xs text-muted-foreground">
              Custom provider name for identification (e.g., 'together', 'groq', 'custom')
            </p>
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
                  <label htmlFor="custom-model-id" className="text-sm font-medium">Model ID</label>
                  <Input
                    id="custom-model-id"
                    type="text"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder="e.g., meta-llama/Llama-3-70b-chat-hf"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="custom-model-label" className="text-sm font-medium">Display Name</label>
                  <Input
                    id="custom-model-label"
                    type="text"
                    value={newModelLabel}
                    onChange={(e) => setNewModelLabel(e.target.value)}
                    placeholder="e.g., Llama 3 70B"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="custom-model-description" className="text-sm font-medium">Description (Optional)</label>
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
          
          <div className="space-y-2">
            <label htmlFor="financial-key" className="text-sm font-medium">
              Financial Datasets API Key
            </label>
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