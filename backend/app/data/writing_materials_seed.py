"""大作文素材种子数据 - 从JSON加载"""
import json
import os

_dir = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(_dir, "writing_materials_seed.json"), "r", encoding="utf-8") as f:
    _data = json.load(f)

MATERIALS_DATA = _data["materials"]
KEYWORDS_DATA = _data["keywords"]
