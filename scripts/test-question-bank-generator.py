#!/usr/bin/env python3
"""Regression tests for question-bank catalog ordering helpers."""

import importlib.util
from pathlib import Path
import unittest


SCRIPT_PATH = Path(__file__).with_name("generate-question-bank-import.py")
SPEC = importlib.util.spec_from_file_location("question_bank_import_generator", SCRIPT_PATH)
GENERATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GENERATOR)


class SectionOrderingTests(unittest.TestCase):
    def test_sorts_section_and_part_ordinals_naturally(self):
        sections = [
            ("第三部分 电话沟通技巧", {"firstSeen": 0}),
            ("第二部分 工作计划与时间管理", {"firstSeen": 1}),
            ("第一部分 商务礼仪与沟通技巧", {"firstSeen": 2}),
            ("第四部分 金融产品服务推荐流程与技巧", {"firstSeen": 3}),
        ]

        ordered = sorted(sections, key=GENERATOR.section_sort_key)

        self.assertEqual(
            [name for name, _ in ordered],
            [
                "第一部分 商务礼仪与沟通技巧",
                "第二部分 工作计划与时间管理",
                "第三部分 电话沟通技巧",
                "第四部分 金融产品服务推荐流程与技巧",
            ],
        )

    def test_unrecognized_names_keep_first_seen_order_after_ordinals(self):
        sections = [
            ("补充材料", {"firstSeen": 0}),
            ("第二节 基础知识", {"firstSeen": 1}),
            ("其他说明", {"firstSeen": 2}),
            ("第一节 概述", {"firstSeen": 3}),
        ]

        ordered = sorted(sections, key=GENERATOR.section_sort_key)

        self.assertEqual(
            [name for name, _ in ordered],
            ["第一节 概述", "第二节 基础知识", "补充材料", "其他说明"],
        )

    def test_groups_questions_by_chapter_and_section_before_assigning_sort_order(self):
        def candidate(chapter_id, chapter, section, question_id):
            return {
                "fields": {
                    "chapterId": chapter_id,
                    "chapter": chapter,
                    "section": section,
                    "questionId": question_id,
                }
            }

        candidates = [
            candidate("2", "第二章", "第二节", "q-1"),
            candidate("1", "第一章", "第三部分", "q-2"),
            candidate("1", "第一章", "第一部分", "q-3"),
            candidate("1", "第一章", "第二部分", "q-4"),
            candidate("1", "第一章", "第一部分", "q-5"),
            candidate("2", "第二章", "第一节", "q-6"),
        ]

        ordered = GENERATOR.order_candidates_by_scope(candidates)

        self.assertEqual(
            [item["fields"]["questionId"] for item in ordered],
            ["q-3", "q-5", "q-4", "q-2", "q-6", "q-1"],
        )

    def test_output_validation_rejects_interleaved_sections(self):
        questions = [
            {
                "_id": f"v1:q-{index}",
                "questionId": f"q-{index}",
                "chapterId": "1",
                "section": section,
                "sortOrder": index,
                "options": [{"alias": "A", "text": "选项"}],
                "answer": ["A"],
                "title": "题目",
                "explanation": "解析",
            }
            for index, section in enumerate(["第一节", "第二节", "第一节"], 1)
        ]
        catalog = {
            "questionCount": 3,
            "chapters": [
                {
                    "id": "1",
                    "count": 3,
                    "sections": [
                        {"name": "第一节", "count": 2},
                        {"name": "第二节", "count": 1},
                    ],
                }
            ],
            "knowledgeGroups": [],
        }

        with self.assertRaisesRegex(ValueError, "questionsFollowSectionOrder"):
            GENERATOR.validate_outputs(questions, catalog)


if __name__ == "__main__":
    unittest.main()
