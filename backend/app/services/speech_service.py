"""Speech services: ASR (阿里云 DashScope Paraformer) + TTS (腾讯云语音合成).

设置存储：
- settings.llm_providers.openai.api_key  → 复用作为 DashScope API Key（ASR）
- settings.speech_providers.tts.{secret_id, secret_key, region, default_voice, default_speed}
  → 腾讯云 TTS
"""

from __future__ import annotations

import base64
import json
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import Setting

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Config loader
# ---------------------------------------------------------------------------


async def _get_raw_settings(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(Setting))
    return {s.key: s.value for s in result.scalars().all()}


async def get_tts_config(db: AsyncSession) -> dict[str, Any]:
    raw = await _get_raw_settings(db)
    speech = json.loads(raw.get("speech_providers", "{}") or "{}")
    return (speech.get("tts") or {})


async def get_asr_config(db: AsyncSession) -> dict[str, Any]:
    """ASR 复用 openai 的 api_key（DashScope 兼容）。"""
    raw = await _get_raw_settings(db)
    providers = json.loads(raw.get("llm_providers", "{}") or "{}")
    openai_cfg = providers.get("openai") or {}
    return {
        "api_key": openai_cfg.get("api_key"),
        # 可选：用户自己覆盖 model；默认 paraformer-realtime-v2
        "model": (json.loads(raw.get("speech_providers", "{}") or "{}").get("asr") or {}).get("model")
        or "paraformer-realtime-v2",
    }


# ---------------------------------------------------------------------------
# ASR: 阿里云 DashScope Paraformer
# ---------------------------------------------------------------------------


# Paraformer 原生支持的音频格式
_PARAFORMER_FORMATS = {"pcm", "wav", "mp3", "opus", "speex", "aac", "amr"}


def _has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def _transcode_to_mp3(src_path: str) -> str | None:
    """把任意格式的音/视频文件转成 16kHz 单声道 mp3，返回临时文件路径。

    失败返回 None。调用方负责清理返回的临时文件。
    """
    if not _has_ffmpeg():
        logger.warning("系统未安装 ffmpeg，无法转码；尝试直接使用原文件喂给 ASR")
        return None

    fd, tmp_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)

    cmd = [
        "ffmpeg", "-y", "-i", src_path,
        "-vn",                # 去视频
        "-ac", "1",           # 单声道
        "-ar", "16000",       # 16k 采样
        "-b:a", "64k",        # 64kbps 足够识别
        "-f", "mp3",
        tmp_path,
    ]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300
        )
        if proc.returncode != 0:
            logger.error(
                "ffmpeg 转码失败 (rc=%s)：%s", proc.returncode, proc.stderr[-500:]
            )
            try:
                os.remove(tmp_path)
            except OSError:
                pass
            return None
        return tmp_path
    except Exception:
        logger.exception("ffmpeg 异常")
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        return None


def _infer_format_from_mime_or_ext(mime_type: str, filepath: str) -> str:
    mt = (mime_type or "").lower()
    ext = os.path.splitext(filepath)[1].lstrip(".").lower()
    # 先看扩展名
    if ext in _PARAFORMER_FORMATS:
        return ext
    # mime 推断
    if "mpeg" in mt or "mp3" in mt:
        return "mp3"
    if "wav" in mt:
        return "wav"
    if "aac" in mt:
        return "aac"
    if "opus" in mt or "ogg" in mt:
        return "opus"
    return "mp3"


async def transcribe_audio(
    db: AsyncSession,
    filepath: str,
    mime_type: str,
    language: str | None = None,  # 兼容旧接口
) -> str | None:
    """使用 DashScope Paraformer-realtime-v2 转写音频。

    返回转写后的拼接文本；失败或未配置返回 None。
    自动对非原生格式（m4a/webm/mp4/flac 等）走 ffmpeg 转 mp3。
    """
    cfg = await get_asr_config(db)
    api_key = cfg.get("api_key")
    if not api_key:
        logger.warning("ASR 未配置（openai provider 的 api_key 为空）")
        return None

    model = cfg.get("model") or "paraformer-realtime-v2"

    if not os.path.exists(filepath):
        logger.warning("音频文件不存在：%s", filepath)
        return None

    # 原生支持就直接用；否则转成 mp3
    fmt = _infer_format_from_mime_or_ext(mime_type, filepath)
    actual_path = filepath
    cleanup_path: str | None = None

    if fmt not in _PARAFORMER_FORMATS or fmt == "wav":
        # wav 可能不是 PCM 编码（如 Apple CAF 伪装），统一转 mp3 最稳
        transcoded = _transcode_to_mp3(filepath)
        if transcoded:
            actual_path = transcoded
            cleanup_path = transcoded
            fmt = "mp3"

    try:
        import dashscope  # lazy import，容器起来时避免阻塞
        from dashscope.audio.asr import Recognition
        from http import HTTPStatus

        # 在进程级别设置 key（SDK 全局单例）
        dashscope.api_key = api_key  # type: ignore[attr-defined]

        recognition = Recognition(
            model=model,
            format=fmt,
            sample_rate=16000,
            language_hints=["en", "zh"],
            callback=None,
        )
        result = recognition.call(actual_path)
        if result.status_code != HTTPStatus.OK:
            logger.error("DashScope ASR 失败 [%s]：%s", result.status_code, result.message)
            return None

        # get_sentence() 返回 list[dict{text,...}] 或 dict，需要兼容两种
        sentences = result.get_sentence()
        if not sentences:
            return ""
        if isinstance(sentences, dict):
            return (sentences.get("text") or "").strip()
        # list
        parts: list[str] = []
        for s in sentences:
            if isinstance(s, dict):
                t = s.get("text")
                if t:
                    parts.append(t)
        return " ".join(parts).strip()
    except Exception:
        logger.exception("ASR 调用异常")
        return None
    finally:
        if cleanup_path:
            try:
                os.remove(cleanup_path)
            except OSError:
                pass


# ---------------------------------------------------------------------------
# TTS: 腾讯云语音合成
# ---------------------------------------------------------------------------


# 腾讯云英文音色预设（VoiceType ID，来自官方音色列表）
# - 501008 WeJames   男声（大模型英文·美式）
# - 501009 WeWinny   女声（大模型英文·美式）
# - 101050 WeJack    男声（精品英文）
VOICE_PRESETS: dict[str, dict[str, Any]] = {
    "501009": {"id": "501009", "voice_type": 501009, "label": "美式英文 · WeWinny（女·大模型）", "accent": "en-US"},
    "501008": {"id": "501008", "voice_type": 501008, "label": "美式英文 · WeJames（男·大模型）", "accent": "en-US"},
    "101050": {"id": "101050", "voice_type": 101050, "label": "英文 · WeJack（男·精品）", "accent": "en"},
}

DEFAULT_VOICE = "501009"  # 女声美式发音


def _parse_speed(rate: str | int | None) -> float:
    """把前端的 rate 字符串（如 '-10%' / '+0%' / '-25%'）转成腾讯云 Speed（[-2, 6] 小数）。

    - 腾讯云 Speed = 0 表示 1.0x；每 +1 对应约 0.1x。
    - 传统百分比语义：-10% → 0.9x → Speed ≈ -1
    """
    if rate is None or rate == "":
        return 0
    if isinstance(rate, (int, float)):
        return float(rate)
    s = str(rate).strip()
    try:
        if s.endswith("%"):
            pct = float(s.replace("%", ""))
            # -10% → -1，+10% → +1，-25% → -2.5
            return round(pct / 10.0, 1)
        # 直接 Speed 值
        return float(s)
    except ValueError:
        return 0


async def synthesize_speech(
    db: AsyncSession,
    text: str,
    voice: str | None = None,
    rate: str | None = None,
) -> bytes:
    """调用腾讯云 TextToVoice，返回 mp3 bytes。

    配置读取：settings.speech_providers.tts.{secret_id, secret_key, region}。
    """
    text = (text or "").strip()
    if not text:
        raise RuntimeError("TTS 输入文本为空")

    cfg = await get_tts_config(db)
    secret_id = (cfg.get("secret_id") or "").strip()
    secret_key = (cfg.get("secret_key") or "").strip()
    if not secret_id or not secret_key:
        raise RuntimeError(
            "TTS 未配置，请前往设置页面填写腾讯云语音合成的 SecretId / SecretKey"
        )
    region = (cfg.get("region") or "ap-guangzhou").strip() or "ap-guangzhou"

    voice_id = (voice or cfg.get("default_voice") or DEFAULT_VOICE).strip() or DEFAULT_VOICE
    preset = VOICE_PRESETS.get(voice_id)
    voice_type = preset["voice_type"] if preset else (int(voice_id) if voice_id.isdigit() else 501009)

    # 自动降速：含数字的句子（如地址、电话号码、日期）播放时需要停顿
    import re as _re
    has_numbers = bool(_re.search(r'\d', text))

    speed = _parse_speed(rate if rate is not None else cfg.get("default_rate") or cfg.get("default_speed"))

    # 如果文本含数字且用户没有手动指定速率，自动降速
    if has_numbers and (rate is None or rate == "" or rate == "+0%"):
        speed = min(speed, -1.5)  # 至少 0.85x 速度

    # lazy import，避免启动开销
    try:
        from tencentcloud.common import credential
        from tencentcloud.common.profile.client_profile import ClientProfile
        from tencentcloud.common.profile.http_profile import HttpProfile
        from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
        from tencentcloud.tts.v20190823 import tts_client, models
    except ImportError as e:
        raise RuntimeError(f"腾讯云 TTS SDK 未安装：{e}")

    cred = credential.Credential(secret_id, secret_key)
    http_profile = HttpProfile()
    http_profile.endpoint = "tts.tencentcloudapi.com"
    client_profile = ClientProfile()
    client_profile.httpProfile = http_profile
    client = tts_client.TtsClient(cred, region, client_profile)

    # 腾讯云 TextToVoice 英文最大 500 字母。如果超了就分段合成后拼接。
    chunks = _split_english_text(text, 500)

    audios: list[bytes] = []
    for idx, chunk in enumerate(chunks):
        # 为大模型音色启用情感增强（更自然的停顿和语气）
        is_large_model_voice = voice_type in (501008, 501009)

        tts_params: dict[str, Any] = {
            "Text": chunk,
            "SessionId": f"ielts-{os.urandom(4).hex()}-{idx}",
            "ModelType": 1,
            "VoiceType": voice_type,
            "Speed": speed,
            "Volume": 0,
            "Codec": "mp3",
            "SampleRate": 16000,
            "PrimaryLanguage": 2,   # 2 = 英文
        }

        # 大模型音色支持情感参数 → 更拟人的朗读
        if is_large_model_voice:
            tts_params["EmotionCategory"] = "neutral"  # 中性自然语气
            tts_params["EmotionIntensity"] = 100  # 情感强度（0-200，100为适中）
            # 启用 SSML 为文本添加自然停顿
            # 在逗号和分号后增加短停顿标记
            enhanced_text = chunk
            # 问句语气上扬
            if "?" in enhanced_text:
                tts_params["EmotionCategory"] = "chat"  # 对话式语气
            tts_params["Text"] = enhanced_text

        req = models.TextToVoiceRequest()
        req.from_json_string(json.dumps(tts_params))
        try:
            resp = client.TextToVoice(req)
        except TencentCloudSDKException as e:
            raise RuntimeError(f"TTS 调用失败：{e.get_message() or e}")

        audio_b64 = resp.Audio
        if not audio_b64:
            raise RuntimeError("TTS 返回空音频")
        audios.append(base64.b64decode(audio_b64))

    # 多段直接字节拼接即可（mp3 帧流可以直接 concat）
    return b"".join(audios)


def _split_english_text(text: str, max_len: int) -> list[str]:
    """按句号/问号/感叹号切分英文文本，确保每段不超过 max_len。

    如果单个句子依然 > max_len，按空格硬切。
    """
    if len(text) <= max_len:
        return [text]

    import re
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    cur = ""
    for s in sentences:
        if not s:
            continue
        if len(cur) + len(s) + 1 <= max_len:
            cur = f"{cur} {s}".strip()
        else:
            if cur:
                chunks.append(cur)
            if len(s) <= max_len:
                cur = s
            else:
                # 单句太长，按空格硬切
                words = s.split(" ")
                tmp = ""
                for w in words:
                    if len(tmp) + len(w) + 1 <= max_len:
                        tmp = f"{tmp} {w}".strip()
                    else:
                        if tmp:
                            chunks.append(tmp)
                        tmp = w
                if tmp:
                    chunks.append(tmp)
                cur = ""
    if cur:
        chunks.append(cur)
    return chunks
