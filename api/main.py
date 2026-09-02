"""Redline transform service.

Column transforms an agent can request in bulk. Kept in Python because correct phone
and date normalisation are library problems, not regex problems.

The service is deliberately stateless and holds no sheet: it receives values, returns
proposed values, and never learns what was committed. Staging and commit stay in the
browser, where the human reviewing them is.
"""

from __future__ import annotations

import re
from typing import Annotated, Literal

import phonenumbers
from dateutil import parser as date_parser
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MAX_VALUES = 2000
"""Upper bound on a single request. Bounded work per call keeps one oversized
paste from occupying the worker indefinitely."""

TransformName = Literal[
    "title_case",
    "normalize_phone",
    "normalize_date",
    "trim_whitespace",
    "lowercase_email",
]


class TransformError(Exception):
    """A transform could not produce a value for one input."""


class ValueIn(BaseModel):
    row_id: Annotated[str, Field(min_length=1, max_length=64)]
    value: Annotated[str, Field(max_length=4096)]


class TransformRequest(BaseModel):
    transform: TransformName
    values: Annotated[list[ValueIn], Field(max_length=MAX_VALUES)]
    region: Annotated[str, Field(min_length=2, max_length=2)] = "US"
    """Default region for phone numbers written without a country code."""


class ValueOut(BaseModel):
    row_id: str
    value: str
    changed: bool
    note: str | None = None


class TransformResponse(BaseModel):
    transform: TransformName
    results: list[ValueOut]
    changed: int
    unchanged: int
    failed: int


_SMALL_WORDS = {"a", "an", "and", "of", "or", "the", "to", "van", "von", "de", "da", "di"}
_WHITESPACE = re.compile(r"\s+")


def _title_case(value: str, _region: str) -> str:
    cleaned = _WHITESPACE.sub(" ", value).strip()
    if not cleaned:
        raise TransformError("empty value")

    def cap(word: str, first: bool) -> str:
        if not first and word.lower() in _SMALL_WORDS:
            return word.lower()
        # Preserve internal capitals that carry meaning: McRae, O'Neill, Jean-Luc.
        return "-".join(
            "'".join(p[:1].upper() + p[1:].lower() for p in hyphen.split("'"))
            for hyphen in word.split("-")
        )

    words = cleaned.split(" ")
    return " ".join(cap(word, index == 0) for index, word in enumerate(words))


def _normalize_phone(value: str, region: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise TransformError("empty value")
    try:
        parsed = phonenumbers.parse(cleaned, region)
    except phonenumbers.NumberParseException as exc:
        raise TransformError(f"not a phone number ({exc.error_type})") from exc
    if not phonenumbers.is_valid_number(parsed):
        raise TransformError(f"not a valid number for region {region}")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def _normalize_date(value: str, _region: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise TransformError("empty value")
    try:
        parsed = date_parser.parse(cleaned, dayfirst=False, fuzzy=False)
    except (ValueError, OverflowError) as exc:
        raise TransformError("unrecognised date format") from exc
    return parsed.date().isoformat()


def _trim_whitespace(value: str, _region: str) -> str:
    return _WHITESPACE.sub(" ", value).strip()


def _lowercase_email(value: str, _region: str) -> str:
    cleaned = value.strip().lower()
    if cleaned and "@" not in cleaned:
        raise TransformError("not an email address")
    return cleaned


TRANSFORMS = {
    "title_case": _title_case,
    "normalize_phone": _normalize_phone,
    "normalize_date": _normalize_date,
    "trim_whitespace": _trim_whitespace,
    "lowercase_email": _lowercase_email,
}

app = FastAPI(title="Redline transforms", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["content-type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/transforms")
def list_transforms() -> dict[str, list[str]]:
    return {"transforms": sorted(TRANSFORMS)}


@app.post("/transform")
def transform(request: TransformRequest) -> TransformResponse:
    """Proposes a new value for each input.

    A value that cannot be transformed is returned unchanged with a note explaining
    why, rather than dropped or raised: the reviewer needs to see that a row was left
    alone as much as they need to see the rows that changed.
    """
    handler = TRANSFORMS[request.transform]
    results: list[ValueOut] = []
    changed = unchanged = failed = 0

    for item in request.values:
        try:
            proposed = handler(item.value, request.region)
        except TransformError as exc:
            failed += 1
            results.append(
                ValueOut(row_id=item.row_id, value=item.value, changed=False, note=str(exc))
            )
            continue

        if proposed == item.value:
            unchanged += 1
            results.append(ValueOut(row_id=item.row_id, value=proposed, changed=False))
        else:
            changed += 1
            results.append(ValueOut(row_id=item.row_id, value=proposed, changed=True))

    return TransformResponse(
        transform=request.transform,
        results=results,
        changed=changed,
        unchanged=unchanged,
        failed=failed,
    )
