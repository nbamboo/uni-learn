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
    "银行从业初级银行业法律法规与综合能力": {
        "subjectId": "junior-law",
        "name": "初级银行业法律法规与综合能力",
        "level": "初级",
        "questionPrefix": "jlaw",
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
    for column in ("H", "I", "J", "K", "L", "M", "N", "O", "Q"):
        for match in IMAGE_PATTERN.finditer(row.get(column, "") or ""):
            result.append({"column": column, "url": match.group(1)})
    return result


def build_candidate(row, config, version):
    options = [
        {"alias": alias, "text": clean_text(row.get(column))}
        for alias, column in OPTION_COLUMNS
        if clean_text(row.get(column))
    ]
    answers = [part.strip() for part in (row.get("P", "") or "").split(",") if part.strip()]
    if len(options) == 2 and options[0]["text"] == "对" and options[1]["text"] == "错":
        answers = [{"1": "A", "0": "B"}.get(answer, answer) for answer in answers]

    source_id = clean_text(row.get("S"))
    question_id = f"{config['questionPrefix']}-{source_id}" if source_id else ""
    fields = {
        "questionId": question_id,
        "subjectId": config["subjectId"],
        "version": version,
        "chapterId": clean_text(row.get("C")),
        "chapter": clean_text(row.get("D")),
        "section": clean_text(row.get("E")),
        "knowledge": clean_text(row.get("F")),
        "title": clean_text(row.get("H")),
        "options": options,
        "answer": answers,
        "explanation": clean_text(row.get("Q")) or "暂无解析",
    }
    reasons = []
    images = find_images(row)
    if images:
        reasons.append("contains_image")
    if fields["title"] and EMPTY_QUESTION_PATTERN.search(fields["title"]):
        reasons.append("missing_actual_question")
    for key in ("questionId", "chapterId", "chapter", "section", "knowledge", "title"):
        if not fields[key]:
            reasons.append(f"missing_{key}")
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
        if len(fields[key]) > limit:
            reasons.append(f"{key}_too_long")
    if any(len(option["text"]) > 2048 for option in options):
        reasons.append("option_text_too_long")
    if fields["subjectId"] and not SUBJECT_ID_PATTERN.fullmatch(fields["subjectId"]):
        reasons.append("invalid_subject_id")
    if fields["questionId"] and not QUESTION_ID_PATTERN.fullmatch(fields["questionId"]):
        reasons.append("invalid_question_id")

    return {
        "excelRow": row.get("__row__"),
        "sourceOrder": clean_text(row.get("A")),
        "sourceQuestionId": source_id,
        "sourceUrl": clean_text(row.get("T")),
        "fields": fields,
        "images": images,
        "reasons": list(dict.fromkeys(reasons)),
    }


def question_document(candidate, sort_order, updated_at):
    fields = candidate["fields"]
    return {
        "_id": f"{fields['version']}:{fields['questionId']}",
        "questionId": fields["questionId"],
        "subjectId": fields["subjectId"],
        "version": fields["version"],
        "chapterId": fields["chapterId"],
        "chapter": fields["chapter"],
        "section": fields["section"],
        "knowledge": fields["knowledge"],
        "type": "multiple" if len(fields["answer"]) > 1 else "single",
        "title": fields["title"],
        "options": fields["options"],
        "answer": fields["answer"],
        "explanation": fields["explanation"],
        "sortOrder": sort_order,
        "status": 1,
        "updatedAt": updated_at,
    }


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
            }
        chapters[chapter_key]["count"] += 1

        knowledge_key = (question["chapterId"], question["chapter"], question["knowledge"])
        if knowledge_key not in knowledge_groups:
            knowledge_groups[knowledge_key] = {
                "name": question["knowledge"],
                "chapterId": question["chapterId"],
                "chapter": question["chapter"],
                "count": 0,
            }
        knowledge_groups[knowledge_key]["count"] += 1

    return {
        "_id": config["subjectId"],
        "subjectId": config["subjectId"],
        "name": config["name"],
        "level": config["level"],
        "status": 1,
        "activeVersion": version,
        "questionCount": len(questions),
        "chapters": list(chapters.values()),
        "knowledgeGroups": list(knowledge_groups.values()),
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


def validate_outputs(questions, catalog):
    ids = [question["questionId"] for question in questions]
    document_ids = [question["_id"] for question in questions]
    expected_orders = list(range(1, len(questions) + 1))
    checks = {
        "uniqueQuestionIds": len(ids) == len(set(ids)),
        "uniqueDocumentIds": len(document_ids) == len(set(document_ids)),
        "denseSortOrder": [question["sortOrder"] for question in questions] == expected_orders,
        "catalogCountMatches": catalog["questionCount"] == len(questions),
        "chapterCountsMatch": sum(chapter["count"] for chapter in catalog["chapters"]) == len(questions),
        "knowledgeCountsMatch": sum(group["count"] for group in catalog["knowledgeGroups"]) == len(questions),
        "answersMatchOptions": all(
            set(question["answer"]).issubset({option["alias"] for option in question["options"]})
            for question in questions
        ),
        "noImageMarkers": all(
            "[图片:" not in question["title"]
            and "[图片:" not in question["explanation"]
            and all("[图片:" not in option["text"] for option in question["options"])
            for question in questions
        ),
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
        "H": "题目", "J": "A", "K": "B", "P": "答案", "Q": "答案解析", "R": "权限状态", "S": "题目ID",
    }
    header = question_rows[0]
    mismatches = [f"{column}列应为{label}" for column, label in expected_headers.items() if clean_text(header.get(column)) != label]
    if mismatches:
        raise ValueError("Excel 列结构不匹配: " + "；".join(mismatches))

    status_counts = Counter(clean_text(row.get("R")) for row in question_rows[1:])
    visible_rows = [row for row in question_rows[1:] if clean_text(row.get("R")) == "可查看"]
    candidates = [build_candidate(row, config, version) for row in visible_rows]

    source_id_counts = Counter(candidate["sourceQuestionId"] for candidate in candidates if candidate["sourceQuestionId"])
    for candidate in candidates:
        if source_id_counts[candidate["sourceQuestionId"]] > 1:
            candidate["reasons"].append("duplicate_source_question_id")
            candidate["reasons"] = list(dict.fromkeys(candidate["reasons"]))

    accepted_candidates = [candidate for candidate in candidates if not candidate["reasons"]]
    rejected_candidates = [candidate for candidate in candidates if candidate["reasons"]]
    updated_at = date_value(version)
    questions = [
        question_document(candidate, index, updated_at)
        for index, candidate in enumerate(accepted_candidates, 1)
    ]
    catalog = catalog_document(questions, config, version, updated_at)
    checks = validate_outputs(questions, catalog)

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
        }
        for candidate in rejected_candidates
    ])

    reason_counts = Counter(reason for candidate in rejected_candidates for reason in candidate["reasons"])
    title_counts = Counter(candidate["fields"]["title"] for candidate in accepted_candidates)
    duplicate_title_groups = sum(1 for count in title_counts.values() if count > 1)
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
            "knowledgeGroups": len(catalog["knowledgeGroups"]),
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
        "schemaVersion": 1,
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
