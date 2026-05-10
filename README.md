# 2026 MT Vote — Realtime Music Show Voting

Serverless realtime voting system for a music program. Mobile web voters → API Gateway → SQS → Lambda Worker → (Redis counters + DynamoDB raw logs) → WebSocket broadcast to PC admin dashboard.

Target scale: ~200 concurrent voters with broadcast spike tolerance.

## Layout

```
infrastructure/terraform/   # AWS infra (VPC, DynamoDB, ElastiCache, SQS, Lambda, API GW REST + WS)
backend/lambdas/            # Python 3.12 Lambdas
  worker/                   # SQS → Redis HINCRBY + DynamoDB BatchWriteItem
  admin_reset/              # POST /admin/round/reset
  round_info/               # GET  /round/current
  ws_connect/               # WebSocket $connect
  ws_disconnect/            # WebSocket $disconnect
  broadcaster/              # EventBridge 1s tick → push scores to all WS connections
backend/shared/             # Redis client + helpers (packaged into each Lambda)
frontend/                   # Vite + React + TS — /vote (mobile), /admin (PC dashboard)
```

## Local dev

Frontend:
```bash
cd frontend && npm install && npm run dev
```
Set `VITE_API_BASE` and `VITE_WS_URL` in `.env` after `terraform apply` outputs them.

## Deploy

```bash
cd backend && ./build.sh           # zips each lambda + shared/ into dist/
cd ../infrastructure/terraform
terraform init
terraform apply
```

Outputs: `rest_api_url`, `websocket_url`, `redis_endpoint`, etc.

## Cost notes (200 CCU profile)

- DynamoDB: On-Demand (PAY_PER_REQUEST). 200 TPS spikes are <$0.10 per show.
- ElastiCache: single `cache.t4g.micro`, no cluster mode. ~$9/mo if left on; destroy after show to save.
- SQS: Standard queue (no FIFO). Free tier covers normal usage.
- Lambda: 256 MB worker, 128 MB others. Free tier or pennies.
- API GW WebSocket: only admin PCs connect (typically 1–5 sockets).

## Out of scope

- User authentication
- Strict abuse prevention (`device_id` only — UI debounces double-clicks)
- The admin reset endpoint should be put behind an API key or IAM auth before going live; left open in this phase.
