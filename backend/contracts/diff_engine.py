"""
Schema diff engine for contract testing and API Change Intelligence.

diff_schemas(old, new) → diff dict with breaking flag + compatibility score.
compute_impact(diff, project) → affected collections/tests + risk score.
"""
from __future__ import annotations


def diff_schemas(old_schema: dict, new_schema: dict) -> dict:
    """
    Compare two JSON Schema objects and return a structured diff.

    Returns:
        {
            added_fields, removed_fields, type_changes, new_required_fields,
            breaking (bool), compatibility_score (float 0-100)
        }
    """
    old_props = old_schema.get("properties", {})
    new_props = new_schema.get("properties", {})
    old_required = set(old_schema.get("required", []))
    new_required = set(new_schema.get("required", []))

    added = [f for f in new_props if f not in old_props]
    removed = [f for f in old_props if f not in new_props]
    type_changes = [
        {
            "field": f,
            "old_type": old_props[f].get("type"),
            "new_type": new_props[f].get("type"),
        }
        for f in old_props
        if f in new_props and old_props[f].get("type") != new_props[f].get("type")
    ]
    new_required_fields = [
        f for f in (new_required - old_required)
        if f in old_props or f in new_props
    ]

    breaking = bool(removed or type_changes or new_required_fields)

    total_fields = len(set(old_props) | set(new_props)) or 1
    penalty = (
        len(removed) * 2.0
        + len(type_changes) * 2.0
        + len(new_required_fields) * 1.5
    )
    compatibility_score = max(0.0, 100.0 - (penalty / total_fields) * 100.0)

    return {
        "added_fields": added,
        "removed_fields": removed,
        "type_changes": type_changes,
        "new_required_fields": new_required_fields,
        "breaking": breaking,
        "compatibility_score": round(compatibility_score, 2),
    }


def compute_impact(diff: dict, project_id: str) -> dict:
    """
    Feature 25 — API Change Intelligence.
    Find collections/requests that reference the changed schema.
    Returns affected_collections, affected_tests, risk_score.
    """
    from api_collections.models import APIRequestDefinition

    # Heuristic: requests that reference removed or type-changed fields
    # in their assertions.
    affected_request_ids = set()
    if diff.get("removed_fields") or diff.get("type_changes"):
        changed = set(diff.get("removed_fields", []) + [
            tc["field"] for tc in diff.get("type_changes", [])
        ])
        from api_collections.models import Assertion
        assertions = Assertion.objects.filter(
            request__collection__project_id=project_id,
            type__in=["json_path", "regex"],
        ).select_related("request__collection")

        for a in assertions:
            cfg_path = str(a.config.get("path", ""))
            for field in changed:
                if field in cfg_path:
                    affected_request_ids.add(str(a.request_id))

    # Collect unique collection ids
    affected_collection_ids = set()
    if affected_request_ids:
        qs = APIRequestDefinition.objects.filter(
            id__in=affected_request_ids
        ).values_list("collection_id", flat=True)
        affected_collection_ids = {str(c) for c in qs}

    # Risk score: breaking=high, removed_fields=high, type_changes=medium, added_fields=low
    risk_score = 0.0
    if diff.get("breaking"):
        risk_score += 50.0
    risk_score += min(len(diff.get("removed_fields", [])) * 10, 25)
    risk_score += min(len(diff.get("type_changes", [])) * 7, 15)
    risk_score += min(len(diff.get("added_fields", [])) * 1, 5)
    risk_score = min(risk_score, 100.0)

    return {
        "affected_collections": list(affected_collection_ids),
        "affected_tests": list(affected_request_ids),
        "risk_score": round(risk_score, 1),
    }
