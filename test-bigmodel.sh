#!/usr/bin/env bash
# test-bigmodel.sh — Quick smoke test for BigModel (ZhipuAI) image + video APIs.
# Usage:
#   ZAI_API_KEY=your_key_here bash test-bigmodel.sh
#
# Verifies:
#   1. Image generation (cogview-3-flash) — POST /images/generations
#   2. Video generation submit (cogvideox-flash) — POST /videos/generations
#   3. Video result polling — GET /async-result/{task_id}
set -euo pipefail

KEY="${ZAI_API_KEY:-${ZHIPU_API_KEY:-}}"
BASE="https://open.bigmodel.cn/api/paas/v4"

if [ -z "$KEY" ]; then
  echo "❌ ZAI_API_KEY env var is not set."
  echo "   Get a free key at: https://open.bigmodel.cn/usercenter/apikeys"
  echo "   Then run: ZAI_API_KEY=xxxx bash test-bigmodel.sh"
  exit 1
fi

echo "🔑 Using key: ${KEY:0:8}...${KEY: -4}"
echo ""

# ── 1. Image generation test ──
echo "── 1. Image generation (cogview-3-flash) ──"
IMG_RES=$(curl -sS -X POST "${BASE}/images/generations" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"cogview-3-flash","prompt":"a cute orange cat sitting on a windowsill","size":"1024x1024"}')

IMG_URL=$(echo "$IMG_RES" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',[{}])[0].get('url',''))" 2>/dev/null || echo "")
if [ -n "$IMG_URL" ]; then
  echo "✅ Image generated: ${IMG_URL:0:80}..."
else
  echo "❌ Image generation failed. Response:"
  echo "$IMG_RES" | head -c 500
  echo ""
fi
echo ""

# ── 2. Video generation submit ──
echo "── 2. Video generation submit (cogvideox-flash) ──"
VID_RES=$(curl -sS -X POST "${BASE}/videos/generations" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"cogvideox-flash","prompt":"ocean waves at sunset, cinematic","duration":5,"quality":"speed"}')

TASK_ID=$(echo "$VID_RES" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('id') or d.get('task_id') or '')" 2>/dev/null || echo "")
if [ -n "$TASK_ID" ]; then
  echo "✅ Task submitted: ${TASK_ID}"
  echo "   Status: $(echo "$VID_RES" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('task_status','unknown'))" 2>/dev/null)"
else
  echo "❌ Video submit failed. Response:"
  echo "$VID_RES" | head -c 500
  echo ""
  exit 1
fi
echo ""

# ── 3. Poll for video result (max 2 minutes) ──
echo "── 3. Polling for video result (up to 2 min) ──"
DEADLINE=$(( $(date +%s) + 120 ))
while [ $(date +%s) -lt $DEADLINE ]; do
  POLL_RES=$(curl -sS -X GET "${BASE}/async-result/${TASK_ID}" \
    -H "Authorization: Bearer ${KEY}")

  STATUS=$(echo "$POLL_RES" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('task_status','PROCESSING'))" 2>/dev/null || echo "ERROR")
  echo "   poll: status=${STATUS}"

  if [ "$STATUS" = "SUCCESS" ]; then
    VIDEO_URL=$(echo "$POLL_RES" | python3 -c "import sys, json; d=json.load(sys.stdin); r=d.get('video_result',[{}])[0]; print(r.get('url') or r.get('video_url') or '')" 2>/dev/null || echo "")
    if [ -n "$VIDEO_URL" ]; then
      echo "✅ Video generated: ${VIDEO_URL:0:80}..."
      exit 0
    fi
    echo "⚠️  SUCCESS but no video URL. Full response:"
    echo "$POLL_RES" | head -c 500
    exit 1
  fi

  if [ "$STATUS" = "FAIL" ]; then
    echo "❌ Task failed."
    echo "$POLL_RES" | head -c 500
    exit 1
  fi

  sleep 5
done

echo "⏰ Timed out after 2 minutes. Last response:"
echo "$POLL_RES" | head -c 500
exit 1
