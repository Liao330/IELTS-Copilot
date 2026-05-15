from __future__ import annotations

from app.models.agent import Agent
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.file import File
from app.models.note import Note
from app.models.setting import Setting
from app.models.homework import Homework, HomeworkFile, HomeworkFeedback
from app.models.vocabulary import VocabularyWord, FavoriteSentence
from app.models.context_material import ContextMaterial
from app.models.daily_report_cache import DailyReportCache
from app.models.feedback import FeedbackItem
from app.models.schedule import ScheduleTask
from app.models.writing_template import WritingTemplate, TemplateVocab
from app.models.writing_material import WritingMaterial, WritingMaterialKeyword, DowngradeAttempt
from app.models.speaking_correction import SpeakingCorrection
from app.models.speaking_phrase import SpeakingPhrase
from app.models.listening_practice import (
    ListeningPracticeSession,
    ListeningPracticeSentence,
    ListeningPracticeGenerated,
    ListeningDictationAttempt,
    ListeningDiscoveredWord,
)

__all__ = [
    "Agent", "Conversation", "Message", "File", "Note", "Setting",
    "Homework", "HomeworkFile", "HomeworkFeedback",
    "VocabularyWord", "FavoriteSentence",
    "ContextMaterial", "DailyReportCache",
    "FeedbackItem", "ScheduleTask",
    "WritingTemplate", "TemplateVocab",
    "WritingMaterial", "WritingMaterialKeyword", "DowngradeAttempt",
    "SpeakingCorrection", "SpeakingPhrase",
    "ListeningPracticeSession", "ListeningPracticeSentence", "ListeningPracticeGenerated",
    "ListeningDictationAttempt", "ListeningDiscoveredWord",
]
