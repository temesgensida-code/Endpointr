"""
Security Tools — JWT analysis & diagnostics.
Decodes, validates, and evaluates security metrics for JSON Web Tokens.
Calculates security health score (0-100), risk levels, and RFC 7519 compliance.
"""
import base64
import json
import math
import time as time_mod
from datetime import datetime, timezone as dt_tz

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


def _b64_decode(s: str) -> dict:
    """Decode a base64url-encoded JWT segment."""
    s += "=" * (-len(s) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(s))
    except Exception:
        return {}


def _calculate_entropy(text: str) -> float:
    """Calculate Shannon entropy for a given string (used for signature randomness check)."""
    if not text:
        return 0.0
    prob = [float(text.count(c)) / len(text) for c in dict.fromkeys(list(text))]
    return round(-sum(p * math.log(p, 2) for p in prob if p > 0), 2)


def _ts_to_iso(ts):
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=dt_tz.utc).isoformat()
    except Exception:
        return str(ts)


def _format_ttl(seconds: int) -> str:
    if seconds <= 0:
        return "Expired"
    days, remainder = divmod(seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, secs = divmod(remainder, 60)
    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    if secs > 0 or not parts:
        parts.append(f"{secs}s")
    return " ".join(parts)


def _analyze_jwt(token: str) -> dict:
    parts = token.strip().split(".")
    if len(parts) != 3:
        return {"error": "Invalid JWT structure — expected exactly 3 dot-separated segments (Header.Payload.Signature)."}

    header = _b64_decode(parts[0])
    payload = _b64_decode(parts[1])
    signature_b64 = parts[2]

    if not header:
        return {"error": "Failed to parse JWT Header — invalid Base64 or JSON structure."}
    if not payload:
        return {"error": "Failed to parse JWT Payload — invalid Base64 or JSON structure."}

    now = int(time_mod.time())
    insights = []
    score = 100
    risk_level = "low"

    # 1. Algorithm Assessment
    alg = (header.get("alg") or "").upper()
    if not alg or alg == "NONE":
        insights.append({
            "severity": "critical",
            "category": "cryptography",
            "title": "Unsigned Token (alg: none)",
            "message": "Algorithm is set to 'none'. Anyone can forge payload claims without a valid signature.",
            "remediation": "Enforce asymmetric RS256/ES256 signature verification on the server."
        })
        score -= 50
        risk_level = "critical"
    elif alg.startswith("HS"):
        insights.append({
            "severity": "warning",
            "category": "cryptography",
            "title": "Symmetric Signing (HS256)",
            "message": f"Token uses symmetric HMAC algorithm ({alg}). Both issuer and verifier must share the secret.",
            "remediation": "Consider asymmetric signing (RS256) so verifying servers don't require the private key."
        })
        score -= 15
        if risk_level != "critical":
            risk_level = "warning"
    elif alg.startswith("RS") or alg.startswith("ES") or alg.startswith("PS"):
        insights.append({
            "severity": "info",
            "category": "cryptography",
            "title": f"Asymmetric Signing ({alg})",
            "message": f"Token uses recommended asymmetric signature algorithm ({alg}).",
            "remediation": "Ensure public keys are served over HTTPS via standard JWKS endpoints."
        })

    # Header Key ID Check
    if not header.get("kid") and alg != "NONE":
        insights.append({
            "severity": "info",
            "category": "header",
            "title": "Missing Key ID ('kid')",
            "message": "Header lacks 'kid' claim, requiring verifiers to guess public keys during key rotation.",
            "remediation": "Include 'kid' in header to support seamless JWKS key rotation."
        })
        score -= 5

    # 2. Expiration Assessment
    exp = payload.get("exp")
    is_expired = False
    ttl_seconds = 0

    if exp is None:
        insights.append({
            "severity": "warning",
            "category": "expiration",
            "title": "Missing Expiration ('exp')",
            "message": "Token has no expiration time set. Stolen tokens remain valid indefinitely.",
            "remediation": "Always set short-lived 'exp' claims (e.g. 15m to 24h)."
        })
        score -= 25
        if risk_level == "low":
            risk_level = "warning"
    else:
        try:
            exp_int = int(exp)
            if exp_int < now:
                is_expired = True
                insights.append({
                    "severity": "high",
                    "category": "expiration",
                    "title": "Expired Token",
                    "message": f"Token expired {now - exp_int} seconds ago ({_ts_to_iso(exp_int)}).",
                    "remediation": "Re-authenticate or issue a refreshed token."
                })
                score -= 30
                if risk_level not in ("critical",):
                    risk_level = "high"
            else:
                ttl_seconds = exp_int - now
                if ttl_seconds > 86400 * 30:
                    insights.append({
                        "severity": "warning",
                        "category": "expiration",
                        "title": "Excessive Token Lifetime",
                        "message": f"Token duration exceeds 30 days ({ttl_seconds // 86400} days).",
                        "remediation": "Reduce access token lifespan to under 24 hours and use refresh tokens."
                    })
                    score -= 10
        except (ValueError, TypeError):
            insights.append({
                "severity": "high",
                "category": "expiration",
                "title": "Malformed 'exp' Claim",
                "message": "Expiration claim is not a valid Unix timestamp.",
                "remediation": "Format 'exp' as an integer Unix epoch timestamp."
            })
            score -= 20

    # 3. Not Before & Issued At Check
    nbf = payload.get("nbf")
    if nbf:
        try:
            if int(nbf) > now:
                insights.append({
                    "severity": "info",
                    "category": "validity",
                    "title": "Not Yet Valid ('nbf')",
                    "message": f"Token cannot be used until {_ts_to_iso(nbf)}.",
                    "remediation": "Wait for 'nbf' timestamp before transmitting request."
                })
        except (ValueError, TypeError):
            pass

    iat = payload.get("iat")
    if not iat:
        insights.append({
            "severity": "info",
            "category": "claims",
            "title": "Missing Issued At ('iat')",
            "message": "No 'iat' claim present to track when the token was created.",
            "remediation": "Include 'iat' timestamp for auditing and age verification."
        })
        score -= 5

    # 4. Standard RFC 7519 Claims Audit
    if not payload.get("iss"):
        insights.append({
            "severity": "warning",
            "category": "claims",
            "title": "Missing Issuer ('iss')",
            "message": "No 'iss' claim present. Verifiers cannot validate the token issuing authority.",
            "remediation": "Set 'iss' to your identity tenant URL (e.g. Clerk domain)."
        })
        score -= 10

    if not payload.get("aud"):
        insights.append({
            "severity": "info",
            "category": "claims",
            "title": "Missing Audience ('aud')",
            "message": "No 'aud' claim present. Token is not target-scoped to specific services.",
            "remediation": "Add 'aud' claim to prevent cross-service token misuse."
        })
        score -= 5

    if not payload.get("jti"):
        insights.append({
            "severity": "info",
            "category": "claims",
            "title": "Missing JWT ID ('jti')",
            "message": "No unique 'jti' identifier. Replay attack protection cannot be enforced easily.",
            "remediation": "Add unique UUID 'jti' to enable token revocation / blacklisting."
        })
        score -= 5

    # Signature Entropy Assessment
    sig_entropy = _calculate_entropy(signature_b64)
    if alg != "NONE" and len(signature_b64) < 16:
        insights.append({
            "severity": "high",
            "category": "cryptography",
            "title": "Truncated Signature",
            "message": "Signature length is unusually short for cryptographic verification.",
            "remediation": "Ensure signature algorithm is not outputting truncated hashes."
        })
        score -= 25

    final_score = max(0, min(100, score))

    return {
        "header": header,
        "payload": payload,
        "signature": signature_b64,
        "decoded": {
            "issued_at": _ts_to_iso(iat),
            "expires_at": _ts_to_iso(exp),
            "not_before": _ts_to_iso(nbf),
            "subject": payload.get("sub"),
            "issuer": payload.get("iss"),
            "audience": payload.get("aud"),
            "jwt_id": payload.get("jti"),
            "authorized_party": payload.get("azp"),
        },
        "is_expired": is_expired,
        "ttl_seconds": max(0, ttl_seconds),
        "ttl_formatted": _format_ttl(ttl_seconds) if not is_expired else "Expired",
        "security_score": final_score,
        "risk_level": risk_level,
        "signature_entropy": sig_entropy,
        "security_insights": insights,
    }


class JWTAnalyzeView(APIView):
    """
    POST /security/jwt/analyze/
    Body: {"token": "<jwt>"} or {"use_active_session": true}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        use_active_session = request.data.get("use_active_session", False)
        token = (request.data.get("token") or "").strip()

        if use_active_session or not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.lower().startswith("bearer "):
                token = auth_header[7:].strip()

        if not token:
            return Response({"error": "token is required or active Authorization Bearer header must be sent."}, status=400)

        result = _analyze_jwt(token)
        return Response(result)

