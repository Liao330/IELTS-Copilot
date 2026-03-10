"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Settings, LLMProvider } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, Eye, EyeOff, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PROVIDER_CONFIGS: Record<
  string,
  { name: string; api_base: string; models: string[] }
> = {
  openai: {
    name: "千问 (阿里云百炼)",
    api_base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      "qwen-turbo-2024-11-01",
      "qwen-plus",
      "qwen-turbo",
      "qwen-max",
      "qwen-long",
      "qwq-plus",
    ],
  },
  deepseek: {
    name: "DeepSeek",
    api_base: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  claude: {
    name: "Claude",
    api_base: "",
    models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
  },
  gpt: {
    name: "GPT",
    api_base: "",
    models: ["gpt-4o", "gpt-4o-mini"],
  },
  gemini: {
    name: "Gemini",
    api_base: "",
    models: ["gemini/gemini-pro", "gemini/gemini-1.5-pro"],
  },
  doubao: {
    name: "豆包",
    api_base: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["openai/doubao-pro-32k"],
  },
};

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        const merged: Record<string, LLMProvider> = {};
        for (const [key, config] of Object.entries(PROVIDER_CONFIGS)) {
          merged[key] = {
            name: config.name,
            api_key: s.llm_providers?.[key]?.api_key || "",
            api_base: s.llm_providers?.[key]?.api_base || config.api_base,
            models: config.models,
          };
        }
        setSettings({ ...s, llm_providers: merged });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.updateSettings(settings);
      toast({ description: "设置已保存" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "保存失败";
      toast({ variant: "destructive", description: message });
    } finally {
      setSaving(false);
    }
  };

  const updateProvider = (key: string, field: keyof LLMProvider, value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      llm_providers: {
        ...settings.llm_providers,
        [key]: {
          ...settings.llm_providers[key],
          [field]: value,
        },
      },
    });
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">加载中...</div>
      </div>
    );
  }

  const allModels: { label: string; value: string }[] = [];
  for (const [provKey, prov] of Object.entries(settings.llm_providers)) {
    if (prov.api_key) {
      for (const model of prov.models) {
        const fullModel = provKey === "openai" || provKey === "doubao"
          ? `openai/${model}`
          : provKey === "gemini"
          ? model
          : `${provKey}/${model}`;
        allModels.push({ label: `${prov.name} - ${model}`, value: fullModel });
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">⚙️ 设置</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        {/* LLM Providers */}
        <Card>
          <CardHeader>
            <CardTitle>LLM 配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(settings.llm_providers).map(([key, provider]) => (
              <div key={key} className="space-y-3">
                <div className="flex items-center gap-2">
                  {provider.api_key ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <div className="h-4 w-4 rounded border" />
                  )}
                  <span className="font-medium">{provider.name}</span>
                </div>
                <div className="ml-6 space-y-2">
                  <div>
                    <Label className="text-xs">API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showKeys[key] ? "text" : "password"}
                        value={provider.api_key}
                        onChange={(e) => updateProvider(key, "api_key", e.target.value)}
                        placeholder={`输入 ${provider.name} API Key`}
                        className="text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                      >
                        {showKeys[key] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {PROVIDER_CONFIGS[key]?.api_base && (
                    <div>
                      <Label className="text-xs">API Base</Label>
                      <Input
                        value={provider.api_base}
                        onChange={(e) => updateProvider(key, "api_base", e.target.value)}
                        placeholder="API Base URL (可选)"
                        className="text-sm"
                      />
                    </div>
                  )}
                </div>
                <Separator />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>通用设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>默认模型</Label>
              <Select
                value={settings.default_model}
                onValueChange={(v) => setSettings({ ...settings, default_model: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择默认模型" />
                </SelectTrigger>
                <SelectContent>
                  {allModels.length > 0 ? (
                    allModels.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value={settings.default_model} disabled>
                      请先配置 API Key
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>对话上下文（最近 N 条消息）</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={settings.context_window_size}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    context_window_size: parseInt(e.target.value) || 20,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>流式输出</Label>
              <Switch
                checked={settings.stream_enabled}
                onCheckedChange={(v) =>
                  setSettings({ ...settings, stream_enabled: v })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "保存中..." : "保存设置"}
        </Button>
      </main>
    </div>
  );
}
