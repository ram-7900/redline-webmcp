"""Behavioural tests for the transform service.

Failure paths matter more than happy paths here: a transform that silently drops a row
it could not handle would hide work from the human reviewing the diff.
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def post(transform: str, values: list[str], region: str = "US"):
    response = client.post(
        "/transform",
        json={
            "transform": transform,
            "region": region,
            "values": [{"row_id": f"r{i}", "value": v} for i, v in enumerate(values)],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_title_case_preserves_hyphens_apostrophes_and_particles():
    body = post("title_case", ["ada lovelace", "JEAN-LUC PICARD", "o'neill", "sarah van dyke"])
    assert [item["value"] for item in body["results"]] == [
        "Ada Lovelace",
        "Jean-Luc Picard",
        "O'Neill",
        "Sarah van Dyke",
    ]


def test_phone_normalisation_returns_e164_and_reports_bad_input():
    body = post("normalize_phone", ["(415) 555-2671", "+91 98765 43210", "banana"])
    results = body["results"]
    assert results[0]["value"] == "+14155552671"
    assert results[1]["value"] == "+919876543210"
    # The unparseable row keeps its original value and explains itself.
    assert results[2]["value"] == "banana"
    assert results[2]["changed"] is False
    assert "not a phone number" in results[2]["note"]
    assert body["changed"] == 2 and body["failed"] == 1


def test_region_changes_how_a_bare_number_is_read():
    national = "98765 43210"
    assert post("normalize_phone", [national], region="IN")["results"][0]["value"] == (
        "+919876543210"
    )
    assert post("normalize_phone", [national], region="US")["results"][0]["changed"] is False


def test_dates_become_iso_and_unparseable_dates_are_flagged():
    body = post("normalize_date", ["Jan 5 2026", "2026/03/09", "not a date"])
    values = [item["value"] for item in body["results"]]
    assert values[:2] == ["2026-01-05", "2026-03-09"]
    assert body["results"][2]["note"] == "unrecognised date format"


def test_already_correct_values_are_reported_unchanged():
    body = post("trim_whitespace", ["hello world"])
    assert body["changed"] == 0
    assert body["unchanged"] == 1
    assert body["results"][0]["changed"] is False


def test_every_row_comes_back_exactly_once_and_in_order():
    values = ["  a  ", "  b  ", "  c  "]
    body = post("trim_whitespace", values)
    assert [item["row_id"] for item in body["results"]] == ["r0", "r1", "r2"]


def test_unknown_transform_is_rejected_at_the_boundary():
    response = client.post("/transform", json={"transform": "drop_table", "values": []})
    assert response.status_code == 422


def test_oversized_batch_is_rejected_rather_than_processed():
    response = client.post(
        "/transform",
        json={
            "transform": "trim_whitespace",
            "values": [{"row_id": f"r{i}", "value": "x"} for i in range(2001)],
        },
    )
    assert response.status_code == 422


def test_health_and_transform_listing():
    assert client.get("/health").json() == {"status": "ok"}
    assert "normalize_phone" in client.get("/transforms").json()["transforms"]
