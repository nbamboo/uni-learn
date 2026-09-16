#!/usr/bin/env python3
"""Generate validated uniCloud question-bank JSONL files from a source workbook."""

import argparse
import hashlib
import json
import posixpath
import re
import zipfile
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"x": MAIN_NS, "r": REL_NS}
OPTION_COLUMNS = (("A", "J"), ("B", "K"), ("C", "L"), ("D", "M"), ("E", "N"), ("F", "O"))
IMAGE_PATTERN = re.compile(r"\[图片:\s*(https?://[^\]]+)\]")
SUBJECT_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
QUESTION_ID_PATTERN = SUBJECT_ID_PATTERN
EMPTY_QUESTION_PATTERN = re.compile(r"\[题目\]\s*$")
MATERIAL_MARKER = "[材料]"
SOURCE_QUESTION_ORDINAL_PATTERN = re.compile(
    r"回答\s*(?:第\s*)?[0-9０-９]+\s*"
    r"(?:[-—–~～至到]\s*[0-9０-９]+)?\s*题"
)
MATERIAL_FIELD_NAMES = (
    "materialGroupId",
    "materialText",
    "materialQuestionIndex",
    "materialQuestionCount",
)
QUESTION_SCHEMA_VERSION = 3
QUESTION_TYPE_NAMES = {
    1: "single",
    2: "judgment",
    3: "multiple",
    4: "material",
}
QUESTION_SELECTION_MODES = {
    1: "single",
    2: "single",
    3: "multiple",
    4: "multiple",
}
SECTION_ORDINAL_PATTERN = re.compile(
    r"^第\s*([0-9一二三四五六七八九十百零〇两]+)\s*(?:节|部分)"
)

SUBJECT_CONFIGS = {
    "银行从业初级个人理财": {
        "subjectId": "junior-personal-finance",
        "name": "初级个人理财",
        "level": "初级",
        "questionPrefix": "ipf",
    },
    "银行从业中级个人理财": {
        "subjectId": "middle-personal-finance",
        "name": "中级个人理财",
        "level": "中级",
        "questionPrefix": "mpf",
    },
    "银行从业中级银行业法律法规与综合能力": {
        "subjectId": "middle-law",
        "name": "中级银行业法律法规与综合能力",
        "level": "中级",
        "questionPrefix": "mlaw",
    },
    "银行从业中级个人贷款": {
        "subjectId": "middle-personal-loan",
        "name": "中级个人贷款",
        "level": "中级",
        "questionPrefix": "mpl",
    },
    "银行从业中级公司信贷": {
        "subjectId": "middle-corporate-credit",
        "name": "中级公司信贷",
        "level": "中级",
        "questionPrefix": "mcc",
    },
    "银行从业中级风险管理": {
        "subjectId": "middle-risk",
        "name": "中级风险管理",
        "level": "中级",
        "questionPrefix": "mrisk",
    },
    "银行从业中级银行管理": {
        "subjectId": "middle-bank-management",
        "name": "中级银行管理",
        "level": "中级",
        "questionPrefix": "mbm",
    },
    "银行从业初级银行业法律法规与综合能力": {
        "subjectId": "junior-law",
        "name": "初级银行业法律法规与综合能力",
        "level": "初级",
        "questionPrefix": "jlaw",
    },
    "银行从业初级银行管理": {
        "subjectId": "junior-bank-management",
        "name": "初级银行管理",
        "level": "初级",
        "questionPrefix": "jbm",
    },
    "银行从业初级风险管理": {
        "subjectId": "junior-risk",
        "name": "初级风险管理",
        "level": "初级",
        "questionPrefix": "jrisk",
    },
    "银行从业初级个人贷款": {
        "subjectId": "junior-personal-loan",
        "name": "初级个人贷款",
        "level": "初级",
        "questionPrefix": "jpl",
    },
    "银行从业初级公司信贷": {
        "subjectId": "junior-corporate-credit",
        "name": "初级公司信贷",
        "level": "初级",
        "questionPrefix": "jcc",
    },
}

FIELD_LIMITS = {
    "questionId": 64,
    "subjectId": 64,
    "version": 64,
    "chapterId": 32,
    "chapter": 128,
    "section": 128,
    "knowledge": 128,
    "title": 2048,
    "explanation": 10000,
    "materialText": 10000,
}


def column_name(cell_reference):
    match = re.match(r"[A-Z]+", cell_reference or "")
    return match.group(0) if match else ""


def shared_strings(archive):
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.findall(".//x:t", NS)) for item in root]


def sheet_paths(archive):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        item.attrib["Id"]: item.attrib["Target"]
        for item in relationships.findall(f"{{{PACKAGE_REL_NS}}}Relationship")
    }
    result = {}
    for sheet in workbook.findall(".//x:sheets/x:sheet", NS):
        relationship_id = sheet.attrib.get(f"{{{REL_NS}}}id")
        target = targets.get(relationship_id, "").lstrip("/")
        if target:
            result[sheet.attrib["name"]] = (
                posixpath.normpath(target)
                if target.startswith("xl/")
                else posixpath.normpath(posixpath.join("xl", target))
            )
    return result


def read_sheet(archive, sheet_path, strings):
    root = ET.fromstring(archive.read(sheet_path))
    rows = []
    for row in root.findall(".//x:sheetData/x:row", NS):
        values = {"__row__": int(row.attrib.get("r", len(rows) + 1))}
        for cell in row.findall("x:c", NS):
            column = column_name(cell.attrib.get("r"))
            if not column:
                continue
            cell_type = cell.attrib.get("t", "")
            value_node = cell.find("x:v", NS)
            if cell_type == "inlineStr":
                value = "".join(node.text or "" for node in cell.findall(".//x:t", NS))
            elif value_node is None:
                value = ""
            elif cell_type == "s":
                index = int(value_node.text or "0")
                value = strings[index] if 0 <= index < len(strings) else ""
            else:
                value = value_node.text or ""
            values[column] = value
        rows.append(values)
    return rows


def read_workbook(workbook_path):
    with zipfile.ZipFile(workbook_path) as archive:
        paths = sheet_paths(archive)
        strings = shared_strings(archive)
        required = {"全部题目", "说明"}
        missing = required.difference(paths)
        if missing:
            raise ValueError(f"工作簿缺少工作表: {', '.join(sorted(missing))}")
        return {
            name: read_sheet(archive, path, strings)
            for name, path in paths.items()
        }


def clean_text(value):
    value = (value or "").replace("\u3000", " ").replace("\u2003", " ")
    return "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in value.splitlines()).strip()


def normalized_answers(row):
    return [
        part.strip()
        for part in (row.get("P", "") or "").replace("，", ",").split(",")
        if part.strip()
    ]


def parsed_question_type(value):
    text = clean_text(str(value)) if value is not None else ""
    if not re.fullmatch(r"[1-4](?:\.0+)?", text):
        return None
    return int(float(text))


def parsed_positive_integer(value):
    text = clean_text(str(value)) if value is not None else ""
    if not re.fullmatch(r"[1-9][0-9]*(?:\.0+)?", text):
        return None
    return int(float(text))


def material_instruction_contains_source_ordinal(value):
    first_line = next((line.strip() for line in clean_text(value).splitlines() if line.strip()), "")
    return SOURCE_QUESTION_ORDINAL_PATTERN.search(first_line) is not None


def expected_question_type(row):
    title = clean_text(row.get("H"))
    material_text = clean_text(row.get("X"))
    options = [
        clean_text(row.get(column))
        for _alias, column in OPTION_COLUMNS
        if clean_text(row.get(column))
    ]
    answers = normalized_answers(row)
    if material_text or MATERIAL_MARKER in title:
        return 4
    if len(options) == 2:
        return 2
    if len(answers) > 1:
        return 3
    if len(answers) == 1:
        return 1
    return None


def validate_question_types(rows):
    mismatches = []
    for row in rows:
        expected = expected_question_type(row)
        if expected is None:
            continue
        actual = parsed_question_type(row.get("G"))
        if actual != expected:
            mismatches.append(
                {
                    "row": row.get("__row__"),
                    "questionId": clean_text(row.get("S")) or "缺少题目ID",
                    "expected": expected,
                    "actual": clean_text(str(row.get("G", ""))) or "空",
                }
            )
    if mismatches:
        preview = "；".join(
            f"第 {item['row']} 行（题目ID {item['questionId']}）"
            f"应为 {item['expected']}，实际为 {item['actual']}"
            for item in mismatches[:10]
        )
        remainder = f"；另有 {len(mismatches) - 10} 行" if len(mismatches) > 10 else ""
        raise ValueError(f"Excel 题型校验失败：{preview}{remainder}")
    return True


def validate_material_rows(rows):
    mismatches = []
    groups = OrderedDict()
    material_columns = ("U", "V", "W", "X")
    for position, row in enumerate(rows):
        question_type = parsed_question_type(row.get("G"))
        values = [clean_text(str(row.get(column, ""))) for column in material_columns]
        has_any_material_value = any(values)
        is_visible = clean_text(row.get("R")) == "可查看"
        if question_type != 4:
            if has_any_material_value:
                mismatches.append((row, "非材料题不得包含材料字段"))
            continue
        if not has_any_material_value and not is_visible:
            continue

        source_group_id = clean_text(row.get("U"))
        source_index = parsed_positive_integer(row.get("V"))
        source_count = parsed_positive_integer(row.get("W"))
        material_text = clean_text(row.get("X"))
        if (
            not source_group_id
            or not source_group_id.isdigit()
            or source_index is None
            or source_count is None
            or source_index > source_count
            or not material_text
        ):
            mismatches.append((row, "材料字段不完整或格式无效"))
            continue
        if MATERIAL_MARKER in clean_text(row.get("H")):
            mismatches.append((row, "题干不得再包含[材料]标记"))
            continue
        if material_instruction_contains_source_ordinal(material_text):
            mismatches.append((row, "材料提示仍包含来源题号"))
            continue
        groups.setdefault(source_group_id, []).append(
            {
                "row": row,
                "position": position,
                "index": source_index,
                "count": source_count,
                "materialText": material_text,
                "scope": (
                    clean_text(row.get("C")),
                    clean_text(row.get("D")),
                    clean_text(row.get("E")),
                ),
            }
        )

    for group_id, items in groups.items():
        counts = {item["count"] for item in items}
        texts = {item["materialText"] for item in items}
        scopes = {item["scope"] for item in items}
        indices = [item["index"] for item in items]
        positions = [item["position"] for item in items]
        expected_count = next(iter(counts)) if len(counts) == 1 else None
        if (
            expected_count != len(items)
            or indices != list(range(1, len(items) + 1))
            or len(texts) != 1
            or len(scopes) != 1
            or positions != list(range(min(positions), min(positions) + len(positions)))
        ):
            mismatches.append((items[0]["row"], f"材料组 {group_id} 结构不一致"))

    if mismatches:
        preview = "；".join(
            f"第 {row.get('__row__')} 行（题目ID {clean_text(row.get('S')) or '缺少题目ID'}）：{reason}"
            for row, reason in mismatches[:10]
        )
        remainder = f"；另有 {len(mismatches) - 10} 行" if len(mismatches) > 10 else ""
        raise ValueError(f"Excel 材料题校验失败：{preview}{remainder}")
    return True


def validate_judgment_answers(rows):
    mismatches = []
    for row in rows:
        if parsed_question_type(row.get("G")) != 2:
            continue
        answers = normalized_answers(row)
        if any(answer in {"0", "1"} for answer in answers):
            mismatches.append(
                {
                    "row": row.get("__row__"),
                    "questionId": clean_text(row.get("S")) or "缺少题目ID",
                }
            )
    if mismatches:
        preview = "；".join(
            f"第 {item['row']} 行（题目ID {item['questionId']}）"
            for item in mismatches[:10]
        )
        remainder = f"；另有 {len(mismatches) - 10} 行" if len(mismatches) > 10 else ""
        raise ValueError(f"Excel 判断题答案必须为 A/B，不得使用 1/0：{preview}{remainder}")
    return True


def info_values(rows):
    return {
        clean_text(row.get("A")): clean_text(row.get("B"))
        for row in rows[1:]
        if clean_text(row.get("A"))
    }


def default_version(info):
    generated_at = info.get("生成时间", "")
    match = re.match(r"(\d{4}-\d{2}-\d{2})", generated_at)
    date_part = match.group(1) if match else datetime.now().date().isoformat()
    return f"{date_part}-v1"


def date_value(version):
    match = re.match(r"(\d{4}-\d{2}-\d{2})", version)
    date_part = match.group(1) if match else datetime.now().date().isoformat()
    return {"$date": f"{date_part}T00:00:00.000Z"}


def find_images(row):
    result = []
    for column in ("H", "I", "J", "K", "L", "M", "N", "O", "Q", "X"):
        for match in IMAGE_PATTERN.finditer(row.get(column, "") or ""):
            result.append({"column": column, "url": match.group(1)})
    return result


def build_candidate(row, config, version):
    options = [
        {"alias": alias, "text": clean_text(row.get(column))}
        for alias, column in OPTION_COLUMNS
        if clean_text(row.get(column))
    ]
    answers = normalized_answers(row)
    question_type_code = parsed_question_type(row.get("G"))

    source_id = clean_text(row.get("S"))
    question_id = f"{config['questionPrefix']}-{source_id}" if source_id else ""
    source_material_group_id = clean_text(row.get("U"))
    material_group_id = (
        f"{config['questionPrefix']}-{source_material_group_id}"
        if source_material_group_id
        else ""
    )
    fields = {
        "questionId": question_id,
        "subjectId": config["subjectId"],
        "version": version,
        "chapterId": clean_text(row.get("C")),
        "chapter": clean_text(row.get("D")),
        "section": clean_text(row.get("E")),
        "knowledge": clean_text(row.get("F")),
        "type": QUESTION_TYPE_NAMES.get(question_type_code),
        "selectionMode": QUESTION_SELECTION_MODES.get(question_type_code),
        "title": clean_text(row.get("H")),
        "options": options,
        "answer": answers,
        "explanation": clean_text(row.get("Q")) or "暂无解析",
    }
    if question_type_code == 4:
        fields.update(
            {
                "materialGroupId": material_group_id,
                "materialText": clean_text(row.get("X")),
            }
        )
    reasons = []
    if question_type_code not in QUESTION_TYPE_NAMES:
        reasons.append("invalid_question_type")
    images = find_images(row)
    if images:
        reasons.append("contains_image")
    if fields["title"] and EMPTY_QUESTION_PATTERN.search(fields["title"]):
        reasons.append("missing_actual_question")
    for key in ("questionId", "chapterId", "chapter", "section", "knowledge", "title"):
        if not fields[key]:
            reasons.append(
                "missing_actual_question"
                if key == "title" and question_type_code == 4
                else f"missing_{key}"
            )
    if len(options) < 2:
        reasons.append("options_lt_2")
    if len(options) > 6:
        reasons.append("options_gt_6")
    if not answers:
        reasons.append("missing_answer")
    aliases = {option["alias"] for option in options}
    if any(answer not in aliases for answer in answers):
        reasons.append("invalid_answer_alias")
    if len(answers) != len(set(answers)):
        reasons.append("duplicate_answer_alias")
    for key, limit in FIELD_LIMITS.items():
        if len(fields.get(key, "")) > limit:
            reasons.append(f"{key}_too_long")
    if any(len(option["text"]) > 2048 for option in options):
        reasons.append("option_text_too_long")
    if fields["subjectId"] and not SUBJECT_ID_PATTERN.fullmatch(fields["subjectId"]):
        reasons.append("invalid_subject_id")
    if fields["questionId"] and not QUESTION_ID_PATTERN.fullmatch(fields["questionId"]):
        reasons.append("invalid_question_id")
    if material_group_id and not QUESTION_ID_PATTERN.fullmatch(material_group_id):
        reasons.append("invalid_material_group_id")

    return {
        "excelRow": row.get("__row__"),
        "sourceOrder": clean_text(row.get("A")),
        "sourceQuestionId": source_id,
        "sourceUrl": clean_text(row.get("T")),
        "sourceMaterialGroupId": source_material_group_id,
        "sourceMaterialQuestionIndex": parsed_positive_integer(row.get("V")),
        "sourceMaterialQuestionCount": parsed_positive_integer(row.get("W")),
        "fields": fields,
        "images": images,
        "reasons": list(dict.fromkeys(reasons)),
    }


def normalize_published_material_groups(candidates):
    groups = OrderedDict()
    for candidate in candidates:
        if candidate["fields"]["type"] == "material":
            groups.setdefault(candidate["fields"]["materialGroupId"], []).append(candidate)
    for items in groups.values():
        items.sort(key=lambda item: item["sourceMaterialQuestionIndex"])
        for index, candidate in enumerate(items, 1):
            candidate["fields"]["materialQuestionIndex"] = index
            candidate["fields"]["materialQuestionCount"] = len(items)
    return candidates


def question_document(candidate, sort_order, updated_at):
    fields = candidate["fields"]
    document = {
        "_id": f"{fields['version']}:{fields['questionId']}",
        "questionId": fields["questionId"],
        "subjectId": fields["subjectId"],
        "version": fields["version"],
        "chapterId": fields["chapterId"],
        "chapter": fields["chapter"],
        "section": fields["section"],
        "knowledge": fields["knowledge"],
        "type": fields["type"],
        "selectionMode": fields["selectionMode"],
        "title": fields["title"],
        "options": fields["options"],
        "answer": fields["answer"],
        "explanation": fields["explanation"],
        "sortOrder": sort_order,
        "status": 1,
        "updatedAt": updated_at,
    }
    if fields["type"] == "material":
        document.update(
            {
                "materialGroupId": fields["materialGroupId"],
                "materialText": fields["materialText"],
                "materialQuestionIndex": fields["materialQuestionIndex"],
                "materialQuestionCount": fields["materialQuestionCount"],
            }
        )
    return document


def chinese_ordinal_value(value):
    if value.isdigit():
        return int(value)
    digits = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
              "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    units = {"十": 10, "百": 100}
    total = 0
    current = 0
    for char in value:
        if char in digits:
            current = digits[char]
        elif char in units:
            unit = units[char]
            total += (current or 1) * unit
            current = 0
        else:
            return None
    return total + current


def section_sort_key(item):
    name, metadata = item
    match = SECTION_ORDINAL_PATTERN.match(name)
    ordinal = chinese_ordinal_value(match.group(1)) if match else None
    if ordinal is None:
        return (1, metadata["firstSeen"])
    return (0, ordinal, metadata["firstSeen"])


def chapter_sort_key(item):
    (chapter_id, _chapter_name), metadata = item
    if chapter_id.isdigit():
        return (0, int(chapter_id), metadata["firstSeen"])
    return (1, metadata["firstSeen"])


def order_candidates_by_scope(candidates):
    """Keep source order within a section while grouping chapters and sections naturally."""
    chapters = OrderedDict()
    for candidate in candidates:
        fields = candidate["fields"]
        chapter_key = (fields["chapterId"], fields["chapter"])
        if chapter_key not in chapters:
            chapters[chapter_key] = {
                "firstSeen": len(chapters),
                "sections": OrderedDict(),
            }
        sections = chapters[chapter_key]["sections"]
        if fields["section"] not in sections:
            sections[fields["section"]] = {"firstSeen": len(sections)}

    chapter_ranks = {
        chapter_key: rank
        for rank, (chapter_key, _metadata) in enumerate(
            sorted(chapters.items(), key=chapter_sort_key)
        )
    }
    section_ranks = {
        chapter_key: {
            section_name: rank
            for rank, (section_name, _metadata) in enumerate(
                sorted(metadata["sections"].items(), key=section_sort_key)
            )
        }
        for chapter_key, metadata in chapters.items()
    }

    def candidate_sort_key(indexed_candidate):
        original_index, candidate = indexed_candidate
        fields = candidate["fields"]
        chapter_key = (fields["chapterId"], fields["chapter"])
        return (
            chapter_ranks[chapter_key],
            section_ranks[chapter_key][fields["section"]],
            original_index,
        )

    return [
        candidate
        for _index, candidate in sorted(enumerate(candidates), key=candidate_sort_key)
    ]


def catalog_document(questions, config, version, updated_at):
    chapters = OrderedDict()
    knowledge_groups = OrderedDict()
    for question in questions:
        chapter_key = (question["chapterId"], question["chapter"])
        if chapter_key not in chapters:
            chapters[chapter_key] = {
                "id": question["chapterId"],
                "subjectId": config["subjectId"],
                "name": question["chapter"],
                "count": 0,
                "_sections": OrderedDict(),
            }
        chapter = chapters[chapter_key]
        chapter["count"] += 1
        section_name = question["section"]
        if section_name not in chapter["_sections"]:
            chapter["_sections"][section_name] = {
                "count": 0,
                "firstSeen": len(chapter["_sections"]),
            }
        chapter["_sections"][section_name]["count"] += 1

        knowledge_key = (question["chapterId"], question["chapter"], question["knowledge"])
        if knowledge_key not in knowledge_groups:
            knowledge_groups[knowledge_key] = {
                "name": question["knowledge"],
                "chapterId": question["chapterId"],
                "chapter": question["chapter"],
                "count": 0,
            }
        knowledge_groups[knowledge_key]["count"] += 1

    catalog_chapters = []
    for chapter in chapters.values():
        sections = [
            {"name": name, "count": metadata["count"]}
            for name, metadata in sorted(chapter.pop("_sections").items(), key=section_sort_key)
        ]
        chapter["sections"] = sections
        catalog_chapters.append(chapter)

    smart_units = []
    material_units = {}
    for question in questions:
        if question["type"] != "material":
            smart_units.append({
                "unitId": f"question:{question['questionId']}",
                "questionIds": [question["questionId"]],
                "questionCount": 1,
                "sortOrder": question["sortOrder"],
            })
            continue
        group_id = question["materialGroupId"]
        unit = material_units.get(group_id)
        if unit is None:
            unit = {
                "unitId": f"material:{group_id}",
                "questionIds": [],
                "questionCount": 0,
                "sortOrder": question["sortOrder"],
            }
            material_units[group_id] = unit
            smart_units.append(unit)
        unit["questionIds"].append(question["questionId"])
        unit["questionCount"] += 1

    return {
        "_id": config["subjectId"],
        "subjectId": config["subjectId"],
        "questionSchemaVersion": QUESTION_SCHEMA_VERSION,
        "name": config["name"],
        "level": config["level"],
        "status": 1,
        "activeVersion": version,
        "questionCount": len(questions),
        "chapters": catalog_chapters,
        "knowledgeGroups": list(knowledge_groups.values()),
        "smartPracticeUnits": smart_units,
        "updatedAt": updated_at,
    }


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path, values):
    with path.open("w", encoding="utf-8", newline="\n") as output:
        for value in values:
            output.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def file_metadata(path):
    data = path.read_bytes()
    return {
        "name": path.name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def material_output_checks(questions):
    material_positions = OrderedDict()
    fields_match = True
    no_source_ordinals = True
    for position, question in enumerate(questions):
        is_material = question.get("type") == "material"
        present_fields = [name in question for name in MATERIAL_FIELD_NAMES]
        if is_material:
            group_id = question.get("materialGroupId")
            material_text = question.get("materialText")
            question_index = question.get("materialQuestionIndex")
            question_count = question.get("materialQuestionCount")
            valid = (
                all(present_fields)
                and isinstance(group_id, str)
                and QUESTION_ID_PATTERN.fullmatch(group_id) is not None
                and isinstance(material_text, str)
                and bool(material_text.strip())
                and len(material_text) <= FIELD_LIMITS["materialText"]
                and type(question_index) is int
                and type(question_count) is int
                and 1 <= question_index <= question_count
                and MATERIAL_MARKER not in question.get("title", "")
            )
            fields_match = fields_match and valid
            no_source_ordinals = no_source_ordinals and not (
                isinstance(material_text, str)
                and material_instruction_contains_source_ordinal(material_text)
            )
            if valid:
                material_positions.setdefault(group_id, []).append((position, question))
        else:
            fields_match = fields_match and not any(present_fields)

    groups_match = True
    groups_contiguous = True
    for items in material_positions.values():
        positions = [position for position, _question in items]
        group_questions = [question for _position, question in items]
        count = len(group_questions)
        groups_match = groups_match and (
            [question["materialQuestionIndex"] for question in group_questions]
            == list(range(1, count + 1))
            and all(question["materialQuestionCount"] == count for question in group_questions)
            and len({question["materialText"] for question in group_questions}) == 1
            and len(
                {
                    (question["chapterId"], question["chapter"], question["section"])
                    for question in group_questions
                }
            )
            == 1
        )
        groups_contiguous = groups_contiguous and positions == list(
            range(min(positions), min(positions) + count)
        )
    return {
        "materialFieldsMatch": fields_match,
        "materialGroupsMatch": groups_match,
        "materialGroupsContiguous": groups_contiguous,
        "noSourceQuestionOrdinalReferences": no_source_ordinals,
    }


def validate_outputs(questions, catalog, *, question_types_match=True):
    ids = [question["questionId"] for question in questions]
    document_ids = [question["_id"] for question in questions]
    expected_orders = list(range(1, len(questions) + 1))
    expected_scopes = [
        (chapter["id"], section["name"])
        for chapter in catalog["chapters"]
        for section in chapter.get("sections", [])
    ]
    actual_scopes = []
    for question in questions:
        scope = (question["chapterId"], question["section"])
        if not actual_scopes or actual_scopes[-1] != scope:
            actual_scopes.append(scope)
    natural_section_order = all(
        [section["name"] for section in chapter.get("sections", [])]
        == [
            name
            for name, _metadata in sorted(
                [
                    (section["name"], {"firstSeen": index})
                    for index, section in enumerate(chapter.get("sections", []))
                ],
                key=section_sort_key,
            )
        ]
        for chapter in catalog["chapters"]
    )
    json_question_types_match = all(
        (
            question["type"] == "single"
            and question["selectionMode"] == "single"
            and MATERIAL_MARKER not in question["title"]
            and len(question["options"]) != 2
            and len(question["answer"]) == 1
        )
        or (
            question["type"] == "judgment"
            and question["selectionMode"] == "single"
            and MATERIAL_MARKER not in question["title"]
            and len(question["options"]) == 2
            and len(question["answer"]) == 1
        )
        or (
            question["type"] == "multiple"
            and question["selectionMode"] == "multiple"
            and MATERIAL_MARKER not in question["title"]
            and len(question["options"]) != 2
            and len(question["answer"]) > 1
        )
        or (
            question["type"] == "material"
            and question["selectionMode"] == "multiple"
            and MATERIAL_MARKER not in question["title"]
            and all(name in question for name in MATERIAL_FIELD_NAMES)
        )
        for question in questions
    )
    material_checks = material_output_checks(questions)
    checks = {
        "uniqueQuestionIds": len(ids) == len(set(ids)),
        "uniqueDocumentIds": len(document_ids) == len(set(document_ids)),
        "denseSortOrder": [question["sortOrder"] for question in questions] == expected_orders,
        "catalogCountMatches": catalog["questionCount"] == len(questions),
        "chapterCountsMatch": sum(chapter["count"] for chapter in catalog["chapters"]) == len(questions),
        "sectionCountsMatch": all(
            sum(section["count"] for section in chapter.get("sections", [])) == chapter["count"]
            for chapter in catalog["chapters"]
        ),
        "naturalSectionOrder": natural_section_order,
        "questionsFollowSectionOrder": actual_scopes == expected_scopes,
        "questionTypesMatch": question_types_match is True,
        "jsonQuestionTypesMatch": json_question_types_match,
        "selectionModesMatch": all(
            question["selectionMode"]
            == ("multiple" if question["type"] in {"multiple", "material"} else "single")
            for question in questions
        ),
        "judgmentAnswersNormalized": all(
            question["type"] != "judgment"
            or (
                len(question["answer"]) == 1
                and question["answer"][0] in {"A", "B"}
            )
            for question in questions
        ),
        "questionSchemaVersionMatch": (
            catalog.get("questionSchemaVersion") == QUESTION_SCHEMA_VERSION
        ),
        "knowledgeCountsMatch": sum(group["count"] for group in catalog["knowledgeGroups"]) == len(questions),
        "smartPracticeIndexMatches": (
            sum(unit["questionCount"] for unit in catalog.get("smartPracticeUnits", [])) == len(questions)
            and [
                question_id
                for unit in catalog.get("smartPracticeUnits", [])
                for question_id in unit["questionIds"]
            ] == ids
        ),
        "answersMatchOptions": all(
            set(question["answer"]).issubset({option["alias"] for option in question["options"]})
            for question in questions
        ),
        "noImageMarkers": all(
            "[图片:" not in question["title"]
            and "[图片:" not in question["explanation"]
            and "[图片:" not in question.get("materialText", "")
            and all("[图片:" not in option["text"] for option in question["options"])
            for question in questions
        ),
        **material_checks,
    }
    if not all(checks.values()):
        failed = ", ".join(name for name, passed in checks.items() if not passed)
        raise ValueError(f"输出校验失败: {failed}")
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="题目整理 Excel 文件路径")
    parser.add_argument("--output-root", type=Path, default=Path("outputs/question-bank"))
    parser.add_argument("--version", help="题库版本；默认根据工作簿生成日期生成 YYYY-MM-DD-v1")
    args = parser.parse_args()

    workbook_path = args.input.resolve()
    if not workbook_path.is_file():
        raise FileNotFoundError(f"找不到 Excel 文件: {workbook_path}")

    workbook = read_workbook(workbook_path)
    info = info_values(workbook["说明"])
    source_subject = info.get("科目", "")
    config = SUBJECT_CONFIGS.get(source_subject)
    if not config:
        supported = "、".join(SUBJECT_CONFIGS)
        raise ValueError(f"未配置科目“{source_subject}”；当前支持: {supported}")
    version = args.version or default_version(info)
    if len(version) > FIELD_LIMITS["version"]:
        raise ValueError("version 长度超过 64")

    question_rows = workbook["全部题目"]
    if not question_rows:
        raise ValueError("全部题目工作表为空")
    expected_headers = {
        "A": "全书序号", "C": "章节序号", "D": "章节", "E": "小节", "F": "知识点",
        "G": "题型", "H": "题目", "J": "A", "K": "B", "P": "答案", "Q": "答案解析", "R": "权限状态", "S": "题目ID",
        "U": "材料组ID", "V": "材料内序号", "W": "材料题数", "X": "材料正文",
    }
    header = question_rows[0]
    mismatches = [f"{column}列应为{label}" for column, label in expected_headers.items() if clean_text(header.get(column)) != label]
    if mismatches:
        raise ValueError("Excel 列结构不匹配: " + "；".join(mismatches))

    question_types_match = validate_question_types(question_rows[1:])
    validate_judgment_answers(question_rows[1:])
    validate_material_rows(question_rows[1:])
    status_counts = Counter(clean_text(row.get("R")) for row in question_rows[1:])
    visible_rows = [row for row in question_rows[1:] if clean_text(row.get("R")) == "可查看"]
    candidates = [build_candidate(row, config, version) for row in visible_rows]

    source_id_counts = Counter(candidate["sourceQuestionId"] for candidate in candidates if candidate["sourceQuestionId"])
    for candidate in candidates:
        if source_id_counts[candidate["sourceQuestionId"]] > 1:
            candidate["reasons"].append("duplicate_source_question_id")
            candidate["reasons"] = list(dict.fromkeys(candidate["reasons"]))

    accepted_candidates = order_candidates_by_scope(
        [candidate for candidate in candidates if not candidate["reasons"]]
    )
    normalize_published_material_groups(accepted_candidates)
    rejected_candidates = [candidate for candidate in candidates if candidate["reasons"]]
    updated_at = date_value(version)
    questions = [
        question_document(candidate, index, updated_at)
        for index, candidate in enumerate(accepted_candidates, 1)
    ]
    catalog = catalog_document(questions, config, version, updated_at)
    checks = validate_outputs(
        questions,
        catalog,
        question_types_match=question_types_match,
    )

    output_dir = (args.output_root / config["subjectId"] / version).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    # uniCloud Web accepts JSONL content but requires the file extension to be .json.
    questions_path = output_dir / "questions.json"
    catalog_path = output_dir / "catalog.json"
    rejected_path = output_dir / "rejected.json"
    report_path = output_dir / "validation-report.json"
    manifest_path = output_dir / "manifest.json"

    write_jsonl(questions_path, questions)
    write_jsonl(catalog_path, [catalog])
    write_jsonl(rejected_path, [
        {
            "excelRow": candidate["excelRow"],
            "sourceOrder": candidate["sourceOrder"],
            "sourceQuestionId": candidate["sourceQuestionId"],
            "subjectId": config["subjectId"],
            "chapterId": candidate["fields"]["chapterId"],
            "chapter": candidate["fields"]["chapter"],
            "title": candidate["fields"]["title"],
            "reasons": candidate["reasons"],
            "images": candidate["images"],
            "sourceUrl": candidate["sourceUrl"],
            "materialGroupId": (
                candidate["fields"].get("materialGroupId")
                if candidate["fields"]["type"] == "material"
                else ""
            ),
            "sourceMaterialQuestionIndex": candidate["sourceMaterialQuestionIndex"],
            "sourceMaterialQuestionCount": candidate["sourceMaterialQuestionCount"],
        }
        for candidate in rejected_candidates
    ])

    reason_counts = Counter(reason for candidate in rejected_candidates for reason in candidate["reasons"])
    title_counts = Counter(candidate["fields"]["title"] for candidate in accepted_candidates)
    duplicate_title_groups = sum(1 for count in title_counts.values() if count > 1)
    visible_material_groups = Counter(
        candidate["fields"].get("materialGroupId")
        for candidate in candidates
        if candidate["fields"]["type"] == "material"
    )
    accepted_material_groups = Counter(
        candidate["fields"].get("materialGroupId")
        for candidate in accepted_candidates
        if candidate["fields"]["type"] == "material"
    )
    partial_material_groups = sum(
        0 < accepted_material_groups[group_id] < source_count
        for group_id, source_count in visible_material_groups.items()
    )
    report = {
        "status": "passed_with_rejections" if rejected_candidates else "passed",
        "input": str(workbook_path),
        "sourceSubject": source_subject,
        "subject": config,
        "version": version,
        "counts": {
            "sourceRows": len(question_rows) - 1,
            "visibleRows": len(visible_rows),
            "permissionSkippedRows": len(question_rows) - 1 - len(visible_rows),
            "acceptedQuestions": len(questions),
            "rejectedQuestions": len(rejected_candidates),
            "chapters": len(catalog["chapters"]),
            "sections": sum(len(chapter.get("sections", [])) for chapter in catalog["chapters"]),
            "knowledgeGroups": len(catalog["knowledgeGroups"]),
            "questionTypes": dict(Counter(question["type"] for question in questions)),
            "selectionModes": dict(
                Counter(question["selectionMode"] for question in questions)
            ),
            "materialGroups": len(accepted_material_groups),
            "partialSourceMaterialGroups": partial_material_groups,
        },
        "statusCounts": dict(status_counts),
        "rejectionReasons": dict(reason_counts),
        "warnings": {
            "duplicateTitleGroups": duplicate_title_groups,
            "note": "相同题干但选项不同不按重复题处理；可结合 rejected.json 和源数据人工复核。",
        },
        "chapterCounts": catalog["chapters"],
        "checks": checks,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    write_json(report_path, report)

    manifest = {
        "schemaVersion": QUESTION_SCHEMA_VERSION,
        "subjectId": config["subjectId"],
        "version": version,
        "questionCount": len(questions),
        "files": [file_metadata(path) for path in (questions_path, catalog_path, rejected_path, report_path)],
        "generatedAt": report["generatedAt"],
    }
    write_json(manifest_path, manifest)

    print(json.dumps({
        "outputDir": str(output_dir),
        "subjectId": config["subjectId"],
        "version": version,
        "accepted": len(questions),
        "rejected": len(rejected_candidates),
        "chapters": len(catalog["chapters"]),
        "knowledgeGroups": len(catalog["knowledgeGroups"]),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
