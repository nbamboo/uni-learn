#!/usr/bin/env python3
"""Verify every configured AI question source against its source workbook."""

import copy
import json
import runpy
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = runpy.run_path(str(ROOT / "scripts/generate-question-bank-import.py"))
TEST_VERSION = "2099-01-01-ai-test"


def configured_workbooks():
    workbooks = {}
    for workbook_path in sorted((ROOT / "resources/topic").glob("*.xlsx")):
        workbook = GENERATOR["read_workbook"](workbook_path)
        info = GENERATOR["info_values"](workbook["说明"])
        config = GENERATOR["SUBJECT_CONFIGS"].get(info.get("科目", ""))
        if config:
            workbooks[config["subjectId"]] = (workbook_path, workbook, config)
    return workbooks


def accepted_crawled_candidates(workbook, config):
    rows = workbook["全部题目"]
    visible_rows = [
        row
        for row in rows[1:]
        if GENERATOR["clean_text"](row.get("R")) == "可查看"
    ]
    candidates = [
        GENERATOR["build_candidate"](row, config, TEST_VERSION)
        for row in visible_rows
    ]
    accepted = GENERATOR["order_candidates_by_scope"](
        [candidate for candidate in candidates if not candidate["reasons"]]
    )
    GENERATOR["normalize_published_material_groups"](accepted)
    return accepted


def run():
    workbooks = configured_workbooks()
    ai_root = ROOT / GENERATOR["DEFAULT_AI_QUESTIONS_ROOT"]
    authoring_materials_root = (
        ROOT / GENERATOR["DEFAULT_AUTHORING_ROOT"] / "materials"
    )
    source_directories = sorted(path for path in ai_root.iterdir() if path.is_dir())
    material_directories = sorted(
        path for path in authoring_materials_root.iterdir() if path.is_dir()
    )
    assert len(source_directories) == len(GENERATOR["SUBJECT_CONFIGS"])
    assert set(path.name for path in source_directories) == set(workbooks)
    assert set(path.name for path in material_directories) == set(workbooks)

    for subject_id, (_workbook_path, workbook, config) in sorted(workbooks.items()):
        source_path = ai_root / subject_id / "questions.json"
        notes_path = authoring_materials_root / subject_id / "tricolor-notes"
        assert source_path.is_file(), f"missing AI source: {source_path}"
        assert notes_path.is_dir(), f"missing authoring notes directory: {notes_path}"
        crawled = accepted_crawled_candidates(workbook, config)
        ai_candidates, skipped, source_records = GENERATOR["load_ai_candidates"](
            source_path,
            config,
            TEST_VERSION,
        )
        assert source_records >= 1
        assert source_records == len(ai_candidates) + len(skipped)
        merged, ai_checks = GENERATOR["merge_ai_candidates"](
            crawled,
            ai_candidates,
            config,
        )
        assert len(merged) == len(crawled) + len(ai_candidates)
        assert all(ai_checks.values())

        candidates_by_anchor = {}
        for ai_candidate in ai_candidates:
            candidates_by_anchor.setdefault(
                ai_candidate["resolvedAnchorQuestionId"], []
            ).append(ai_candidate)
        for resolved_anchor, anchored_candidates in candidates_by_anchor.items():
            anchored_candidates.sort(
                key=lambda item: (item["insertOrder"], item["fields"]["questionId"])
            )
            anchor_index = next(
                index
                for index, candidate in enumerate(merged)
                if candidate["fields"]["questionId"] == resolved_anchor
            )
            assert (
                merged[
                    anchor_index + 1 : anchor_index + 1 + len(anchored_candidates)
                ]
                == anchored_candidates
            )

        updated_at = GENERATOR["date_value"](TEST_VERSION)
        questions = [
            GENERATOR["question_document"](candidate, index, updated_at)
            for index, candidate in enumerate(merged, 1)
        ]
        catalog = GENERATOR["catalog_document"](
            questions,
            config,
            TEST_VERSION,
            updated_at,
        )
        output_checks = GENERATOR["validate_outputs"](
            questions,
            catalog,
            question_types_match=True,
        )
        assert all(output_checks.values())

        if ai_candidates:
            invalid = copy.deepcopy(ai_candidates)
            invalid[0]["insertAfterQuestionId"] = "missing-anchor-question"
            invalid[0]["resolvedAnchorQuestionId"] = "missing-anchor-question"
            try:
                GENERATOR["merge_ai_candidates"](crawled, invalid, config)
            except ValueError as error:
                assert "anchor_not_found" in str(error)
            else:
                raise AssertionError("missing AI anchor should fail validation")

        draft_record = json.loads(source_path.read_text(encoding="utf-8"))[0]
        draft_record["reviewStatus"] = "draft"
        draft_record["insertAfterQuestionId"] = "drafts-do-not-require-valid-anchors"
        with tempfile.TemporaryDirectory() as temp_directory:
            draft_path = Path(temp_directory) / "questions.json"
            draft_path.write_text(
                json.dumps([draft_record], ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            draft_candidates, draft_skipped, draft_records = GENERATOR[
                "load_ai_candidates"
            ](draft_path, config, TEST_VERSION)
            assert draft_records == 1
            assert not draft_candidates
            assert len(draft_skipped) == 1

    print(f"AI question import tests passed ({len(workbooks)} subjects)")


if __name__ == "__main__":
    run()
