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
    def test_catalog_contains_smart_practice_units(self):
        base = {
            "subjectId": "junior-personal-finance",
            "chapterId": "1",
            "chapter": "第一章",
            "section": "第一节",
            "knowledge": "知识点",
        }
        questions = [
            {**base, "questionId": "ipf-1", "type": "single", "sortOrder": 1},
            {
                **base,
                "questionId": "ipf-2",
                "type": "material",
                "materialGroupId": "ipf-material-1",
                "sortOrder": 2,
            },
            {
                **base,
                "questionId": "ipf-3",
                "type": "material",
                "materialGroupId": "ipf-material-1",
                "sortOrder": 3,
            },
        ]

        catalog = GENERATOR.catalog_document(
            questions,
            GENERATOR.SUBJECT_CONFIGS["银行从业初级个人理财"],
            "2026-09-16-v1",
            {"$date": "2026-09-16T00:00:00.000Z"},
        )

        self.assertEqual(
            catalog["smartPracticeUnits"],
            [
                {
                    "unitId": "question:ipf-1",
                    "questionIds": ["ipf-1"],
                    "questionCount": 1,
                    "sortOrder": 1,
                },
                {
                    "unitId": "material:ipf-material-1",
                    "questionIds": ["ipf-2", "ipf-3"],
                    "questionCount": 2,
                    "sortOrder": 2,
                },
            ],
        )

    def test_question_type_rules_follow_material_options_and_answers(self):
        rows = [
            {"H": "题目", "J": "甲", "K": "乙", "L": "丙", "P": "A,C", "G": "4", "X": "材料"},
            {"H": "判断", "J": "对", "K": "错", "P": "A", "G": "2"},
            {"H": "多选", "J": "甲", "K": "乙", "L": "丙", "P": "A，C", "G": "3"},
            {"H": "单选", "J": "甲", "K": "乙", "L": "丙", "P": "A", "G": "1"},
            {"H": "权限不足/收费题", "P": "", "G": "3"},
        ]

        self.assertTrue(GENERATOR.validate_question_types(rows))
        self.assertTrue(GENERATOR.validate_judgment_answers(rows))

    def test_judgment_answer_validation_rejects_source_boolean_values(self):
        rows = [
            {
                "__row__": 12,
                "G": "2",
                "H": "判断题",
                "J": "对",
                "K": "错",
                "P": "1",
                "S": "12345",
            }
        ]

        with self.assertRaisesRegex(ValueError, "判断题答案必须为 A/B.*题目ID 12345"):
            GENERATOR.validate_judgment_answers(rows)

    def test_question_type_validation_rejects_wrong_excel_row(self):
        rows = [
            {
                "__row__": 61,
                "G": "1",
                "H": "普通多选题",
                "J": "甲",
                "K": "乙",
                "L": "丙",
                "P": "A,C",
                "S": "12345",
            }
        ]

        with self.assertRaisesRegex(ValueError, "第 61 行.*题目ID 12345.*应为 3"):
            GENERATOR.validate_question_types(rows)

    def test_json_type_and_selection_mode_come_from_excel_type(self):
        cases = [
            ("single", "single", ["A"]),
            ("judgment", "single", ["A"]),
            ("multiple", "multiple", ["A", "C"]),
            ("material", "multiple", ["A"]),
        ]
        for question_type, selection_mode, answers in cases:
            with self.subTest(question_type=question_type):
                fields = {
                        "version": "2026-09-13-v1",
                        "questionId": "ipf-1",
                        "subjectId": "junior-personal-finance",
                        "chapterId": "1",
                        "chapter": "第一章",
                        "section": "第一节",
                        "knowledge": "知识点",
                        "type": question_type,
                        "selectionMode": selection_mode,
                        "title": "题目",
                        "options": [
                            {"alias": "A", "text": "甲"},
                            {"alias": "B", "text": "乙"},
                            {"alias": "C", "text": "丙"},
                        ],
                        "answer": answers,
                        "explanation": "解析",
                }
                if question_type == "material":
                    fields.update({
                        "materialGroupId": "ipf-10",
                        "materialText": "根据材料，回答下列问题",
                        "materialQuestionIndex": 1,
                        "materialQuestionCount": 1,
                    })
                candidate = {"fields": fields}

                document = GENERATOR.question_document(
                    candidate,
                    1,
                    {"$date": "2026-09-13T00:00:00.000Z"},
                )

                self.assertEqual(document["type"], question_type)
                self.assertEqual(document["selectionMode"], selection_mode)

    def test_material_candidate_is_always_multiple_selection_mode(self):
        row = {
            "A": "1",
            "C": "1",
            "D": "第一章",
            "E": "第一节",
            "F": "知识点",
            "G": "4",
            "H": "题干",
            "J": "甲",
            "K": "乙",
            "P": "A",
            "Q": "解析",
            "S": "12345",
            "U": "12340",
            "V": "1",
            "W": "1",
            "X": "根据材料，回答下列问题\n材料正文",
        }

        candidate = GENERATOR.build_candidate(
            row,
            GENERATOR.SUBJECT_CONFIGS["银行从业初级个人理财"],
            "2026-09-13-v1",
        )

        self.assertEqual(candidate["fields"]["type"], "material")
        self.assertEqual(candidate["fields"]["selectionMode"], "multiple")
        self.assertEqual(candidate["fields"]["materialGroupId"], "ipf-12340")

    def test_material_rows_reject_source_question_ordinals(self):
        row = {
            "__row__": 2,
            "C": "1",
            "D": "第一章",
            "E": "第一节",
            "G": "4",
            "H": "题干",
            "R": "可查看",
            "S": "12345",
            "U": "12340",
            "V": "1",
            "W": "1",
            "X": "根据材料，回答190-193题",
        }

        with self.assertRaisesRegex(ValueError, "材料提示仍包含来源题号"):
            GENERATOR.validate_material_rows([row])

    def test_published_material_group_is_renumbered_after_rejection(self):
        def candidate(question_id, source_index):
            return {
                "sourceMaterialQuestionIndex": source_index,
                "fields": {
                    "type": "material",
                    "materialGroupId": "ipf-10",
                    "materialText": "材料",
                    "questionId": question_id,
                },
            }

        candidates = [candidate("ipf-1", 1), candidate("ipf-3", 3)]
        GENERATOR.normalize_published_material_groups(candidates)

        self.assertEqual(
            [item["fields"]["materialQuestionIndex"] for item in candidates],
            [1, 2],
        )
        self.assertEqual(
            [item["fields"]["materialQuestionCount"] for item in candidates],
            [2, 2],
        )

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
                "type": "single",
                "selectionMode": "single",
                "title": "题目",
                "explanation": "解析",
            }
            for index, section in enumerate(["第一节", "第二节", "第一节"], 1)
        ]
        catalog = {
            "questionSchemaVersion": 3,
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
