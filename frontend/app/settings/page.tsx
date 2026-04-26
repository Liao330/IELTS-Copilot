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
import { ArrowLeft, Save, Eye, EyeOff, Check, Volume2, Mic } from "lucide-react";
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

  const updateAsr = (field: "api_key" | "api_base" | "model", value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      speech_providers: {
        ...(settings.speech_providers || {}),
        asr: { ...(settings.speech_providers?.asr || {}), [field]: value },
      },
    });
  };

  const updateTts = (
    field: "secret_id" | "secret_key" | "region" | "default_voice" | "default_rate",
    value: string,
  ) => {
    if (!settings) return;
    // SecretId/SecretKey 粘贴时常见尾空格/换行，统一 trim 防止签名失败
    const trimmed =
      field === "secret_id" || field === "secret_key" ? value.trim() : value;
    setSettings({
      ...settings,
      speech_providers: {
        ...(settings.speech_providers || {}),
        tts: { ...(settings.speech_providers?.tts || {}), [field]: trimmed },
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

        {/* 语音配置：TTS (腾讯云) + ASR (阿里云 Paraformer 复用千问 Key) */}
        <Card>
          <CardHeader>
            <CardTitle>🎧 语音配置</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              配置后可在「听力精听复盘」使用拟人英音朗读，以及上传口语作业时自动识别为文字（让 AI 能分析内容）。
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* TTS - 腾讯云语音合成 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {settings.speech_providers?.tts?.secret_id ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">腾讯云语音合成（拟人朗读）</span>
                <a
                  href="https://console.cloud.tencent.com/cam/capi"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky-600 hover:underline ml-auto"
                >
                  获取 SecretId/Key →
                </a>
              </div>
              <div className="ml-6 space-y-2">
                <div>
                  <Label className="text-xs">SecretId</Label>
                  <Input
                    value={settings.speech_providers?.tts?.secret_id || ""}
                    onChange={(e) => updateTts("secret_id", e.target.value)}
                    placeholder="AKID..."
                    className="text-sm font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">SecretKey</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showKeys["tts"] ? "text" : "password"}
                      value={settings.speech_providers?.tts?.secret_key || ""}
                      onChange={(e) => updateTts("secret_key", e.target.value)}
                      placeholder="腾讯云 SecretKey（32 位）"
                      className="text-sm font-mono"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setShowKeys((prev) => ({ ...prev, tts: !prev.tts }))
                      }
                    >
                      {showKeys["tts"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">地域（可选）</Label>
                  <Select
                    value={settings.speech_providers?.tts?.region || "ap-guangzhou"}
                    onValueChange={(v) => updateTts("region", v)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ap-guangzhou">广州</SelectItem>
                      <SelectItem value="ap-shanghai">上海</SelectItem>
                      <SelectItem value="ap-beijing">北京</SelectItem>
                      <SelectItem value="ap-hongkong">香港</SelectItem>
                      <SelectItem value="ap-singapore">新加坡</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">默认音色</Label>
                    <Select
                      value={settings.speech_providers?.tts?.default_voice || "501009"}
                      onValueChange={(v) => updateTts("default_voice", v)}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="101050">英文 · WeJack（男·精品）— 精品免费包</SelectItem>
                        <SelectItem value="501009">英文 · WeWinny（女·大模型）— 需大模型资源包</SelectItem>
                        <SelectItem value="501008">英文 · WeJames（男·大模型）— 需大模型资源包</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">默认语速</Label>
                    <Select
                      value={settings.speech_providers?.tts?.default_rate || "-10%"}
                      onValueChange={(v) => updateTts("default_rate", v)}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-25%">0.75x 慢速精听</SelectItem>
                        <SelectItem value="-10%">0.9x 略慢（推荐）</SelectItem>
                        <SelectItem value="+0%">1.0x 正常</SelectItem>
                        <SelectItem value="+10%">1.1x 略快</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                  💡 腾讯云每月 <b>100 万字符</b>永久免费，精品/大模型音色共享额度。
                  需要先在控制台 <a href="https://console.cloud.tencent.com/tts" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">开通语音合成</a> 并在 <a href="https://console.cloud.tencent.com/cam/capi" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">访问管理</a> 新建 API 密钥。
                </p>
              </div>
            </div>

            <Separator />

            {/* ASR - 阿里云 Paraformer（复用千问 Key） */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {settings.llm_providers?.openai?.api_key ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Mic className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">阿里云 Paraformer（口语音频转写）</span>
                <span className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 rounded-full px-2 py-0.5 ml-auto">
                  自动复用千问 Key
                </span>
              </div>
              <div className="ml-6 space-y-2">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {settings.llm_providers?.openai?.api_key
                    ? "✅ 已检测到上方「千问 (阿里云百炼)」的 API Key，将同一个 Key 用于 Paraformer 录音识别，无需重复配置。"
                    : "⚠️ 请先在上方「千问 (阿里云百炼)」处填写 API Key，同一个 Key 自动用于 Paraformer 语音识别。"}
                </p>
                <div>
                  <Label className="text-xs">模型（可选，默认 paraformer-realtime-v2）</Label>
                  <Input
                    value={settings.speech_providers?.asr?.model || ""}
                    onChange={(e) => updateAsr("model", e.target.value)}
                    placeholder="paraformer-realtime-v2"
                    className="text-sm font-mono"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                  💡 新用户赠送 3 个月 <b>750 小时</b> 免费，之后 ￥0.15/分钟。
                  支持 m4a/mp3/wav/mp4 等几乎所有格式（后端用 ffmpeg 自动转码）。
                </p>
              </div>
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
