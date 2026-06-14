"""
Security Tools — JWT analysis.
Decodes and validates JWTs without a secret key (header/payload inspection only).
For full signature verification the client must supply the public key or JWKS URL.
"""
import base64
import json
import time as time_mod
from datetime import datetime, timezone as dt_tz

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


def _b64_decode(s: str) -> dict:
    """Decode a base64url-encoded JWT segment."""
    # Pad to multiple of 4
    s += "=" * (-len(s) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(s))
    except Exception:
        return {}


def _ts_to_iso(ts):
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=dt_tz.utc).isoformat()
    except Exception:
        return str(ts)


def _analyze_jwt(token: str) -> dict:
    parts = token.strip().split(".")
    if len(parts) != 3:
        return {"error": "Invalid JWT structure — expected 3 dot-separated segments."}

    header = _b64_decode(parts[0])
    payload = _b64_decode(parts[1])
    signature_b64 = parts[2]

    now = int(time_mod.time())

    # Security insights
    insights = []
    risk_level = "low"

    alg = header.get("alg", "")
    if alg.upper() in ("NONE", ""):
        insights.append({"severity": "critical", "message": "Algorithm is 'none' — signature is not verified."})
        risk_level = "critical"
    elif alg.upper().startswith("HS"):
        insights.append({"severity": "warning", "message": f"{alg} uses a symmetric secret — ensure the secret is strong and not leaked."})
        if risk_level not in ("critical",):
            risk_level = "warning"
    elif alg.upper().startswith("RS") or alg.upper().startswith("ES"):
        insights.append({"severity": "info", "message": f"{alg} asymmetric algorithm — good choice."})

    exp = payload.get("exp")
    if exp is None:
        insights.append({"severity": "warning", "message": "No 'exp' claim — token never expires."})
        if risk_level == "low":
            risk_level = "warning"
    elif int(exp) < now:
        insights.append({"severity": "high", "message": "Token is EXPIRED."})
        if risk_level not in ("critical",):
            risk_level = "high"
    else:
        ttl = int(exp) - now
        if ttl > 86400 * 30:
            insights.append({"severity": "warning", "message": f"Token has very long TTL ({ttl // 86400} days) — consider shorter lifetimes."})

    nbf = payload.get("nbf")
    if nbf and int(nbf) > now:
        insights.append({"severity": "info", "message": "Token 'nbf' is in the future — not yet valid."})

    if not payload.get("iss"):
        insights.append({"severity": "warning", "message": "No 'iss' (issuer) claim."})
    if not payload.get("aud"):
        insights.append({"severity": "info", "message": "No 'aud' (audience) claim — consider adding one."})
    if not payload.get("jti"):
        insights.append({"severity": "info", "message": "No 'jti' (JWT ID) — tokens are not uniquely identifiable."})

    return {
        "header": header,
        "payload": payload,
        "signature": signature_b64,
        "decoded": {
            "issued_at": _ts_to_iso(payload.get("iat")),
            "expires_at": _ts_to_iso(exp),
            "not_before": _ts_to_iso(nbf),
            "subject": payload.get("sub"),
            "issuer": payload.get("iss"),
            "audience": payload.get("aud"),
        },
        "is_expired": exp is not None and int(exp) < now,
        "risk_level": risk_level,
        "security_insights": insights,
    }


class JWTAnalyzeView(APIView):
    """
    POST /security/jwt/analyze/
    Body: {"token": "<jwt>"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = (request.data.get("token") or "").strip()
        if not token:
            return Response({"error": "token is required."}, status=400)
        result = _analyze_jwt(token)
        return Response(result)
