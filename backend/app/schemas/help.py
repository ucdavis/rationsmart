"""Response shapes for the In-App Help endpoints (/v1/help).

They mirror the agreed API contract (In-App Help API contract v1). Fields are
never omitted: an empty value is null or []. Text is plain (no HTML, no
Markdown); "\\n" is a line break.
"""
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

Audience = Literal["all", "farmers", "advanced", "nutritionists"]


class HelpTopicSummary(BaseModel):
    key: str = Field(..., description="Stable topic id, never translated, e.g. 'pick-feeds'")
    number: int = Field(..., description="Display number; 0 = Quick start")
    title: str
    summary: str
    audience: Audience
    video_seconds: Optional[int] = Field(None, description="Video length; null = no video yet")


class HelpScreenEntry(BaseModel):
    topic: str = Field(..., description="Topic key the screen's help button opens")
    related: List[str] = Field(default_factory=list, description="'Also on this screen' topic keys")


class HelpFaq(BaseModel):
    question: str
    answer: str
    topic: Optional[str] = Field(None, description="Topic key to open from the answer; null = none")


class HelpIndexResponse(BaseModel):
    content_version: str = Field(..., description="Changes whenever any help content changes")
    language: str = Field(..., description="Language served ('en' when the asked one has no help files)")
    fallback: bool = Field(
        ..., description="True when a language other than English was asked and some text is English"
    )
    quick_start: str = Field(..., description="Topic key of the Quick start topic")
    topics: List[HelpTopicSummary]
    screens: Dict[str, HelpScreenEntry] = Field(..., description="Screen key -> topic + related topics")
    faqs: List[HelpFaq]


class HelpVideoChapter(BaseModel):
    start: int = Field(..., description="Seconds from the start of the video")
    label: str


class HelpVideo(BaseModel):
    youtube_id: str
    seconds: int
    poster: Optional[str] = Field(None, description="Backend path of our own poster image")
    chapters: List[HelpVideoChapter] = Field(default_factory=list)


class HelpStep(BaseModel):
    text: str
    image: Optional[str] = Field(None, description="Backend path; the PWA puts /api/proxy in front")
    video_start: Optional[int] = Field(None, description="Seconds for a 'watch this step' link")


class HelpProblem(BaseModel):
    title: str
    text: str


class HelpTopicResponse(BaseModel):
    key: str
    number: int
    language: str
    fallback: bool
    title: str
    summary: str
    screen_label: str = Field(..., description="English screen name; the PWA translates it with t()")
    video: Optional[HelpVideo] = Field(None, description="null = no video yet: show the steps only")
    steps: List[HelpStep]
    problems: List[HelpProblem]
    related: List[str]
    next: Optional[str] = None
    updated: str = Field(..., description="Last content change, YYYY-MM-DD")


# ── Admin Manual (/v1/admin/help) ─────────────────────────────────────────────
# Same shapes as the public help, so the PWA reuses its screens; only the audience
# differs ("admin") and image links start with /v1/admin/help/media.


class AdminHelpTopicSummary(HelpTopicSummary):
    audience: Literal["admin"]


class AdminHelpIndexResponse(HelpIndexResponse):
    language: Literal["en"] = Field(..., description="Always 'en' (the Admin Manual is English only)")
    topics: List[AdminHelpTopicSummary]


class AdminHelpTopicResponse(HelpTopicResponse):
    language: Literal["en"] = Field(..., description="Always 'en' (the Admin Manual is English only)")
