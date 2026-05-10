locals {
  lambda_runtime = "python3.12"

  lambda_env_common = {
    REDIS_HOST           = aws_elasticache_cluster.this.cache_nodes[0].address
    REDIS_PORT           = tostring(aws_elasticache_cluster.this.cache_nodes[0].port)
    VOTE_LOGS_TABLE      = aws_dynamodb_table.vote_logs.name
    WS_CONNECTIONS_TABLE = aws_dynamodb_table.ws_connections.name
  }

  // Lambdas that gate on the admin token need it injected here.
  lambda_env_admin = merge(local.lambda_env_common, {
    ADMIN_TOKEN = var.admin_password
  })
}

// --- Worker (SQS-triggered) ---
resource "aws_lambda_function" "worker" {
  function_name    = "${var.project}-worker"
  runtime          = local.lambda_runtime
  handler          = "handler.handler"
  role             = aws_iam_role.lambda.arn
  filename         = "${var.lambda_dist_dir}/worker.zip"
  source_code_hash = filebase64sha256("${var.lambda_dist_dir}/worker.zip")
  memory_size      = 512
  timeout          = 30

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = local.lambda_env_common
  }
}

resource "aws_lambda_event_source_mapping" "worker_sqs" {
  event_source_arn = aws_sqs_queue.vote.arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 10

  // batching_window=0 → invoke as soon as messages arrive, no batching wait.
  // Necessary for hidden_singer mode where the dashboard expects sub-second
  // like→tally propagation. With batching_window=1 the SQS poller adds
  // 10–20s of lag in low-traffic scenarios (it back-offs aggressively when
  // the queue has been mostly empty).
  maximum_batching_window_in_seconds = 0

  function_response_types = ["ReportBatchItemFailures"]
}

// --- Admin reset (HTTP) ---
resource "aws_lambda_function" "admin_reset" {
  function_name    = "${var.project}-admin-reset"
  runtime          = local.lambda_runtime
  handler          = "handler.handler"
  role             = aws_iam_role.lambda.arn
  filename         = "${var.lambda_dist_dir}/admin_reset.zip"
  source_code_hash = filebase64sha256("${var.lambda_dist_dir}/admin_reset.zip")
  memory_size      = 256
  timeout          = 10

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }
  environment {
    variables = local.lambda_env_admin
  }
}

// --- Admin song (start a new song session in hidden_singer mode) ---
resource "aws_lambda_function" "admin_song" {
  function_name    = "${var.project}-admin-song"
  runtime          = local.lambda_runtime
  handler          = "handler.handler"
  role             = aws_iam_role.lambda.arn
  filename         = "${var.lambda_dist_dir}/admin_song.zip"
  source_code_hash = filebase64sha256("${var.lambda_dist_dir}/admin_song.zip")
  memory_size      = 256
  timeout          = 5

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }
  environment {
    variables = local.lambda_env_admin
  }
}

// --- Round state toggle (open/closed) ---
resource "aws_lambda_function" "round_state" {
  function_name    = "${var.project}-round-state"
  runtime          = local.lambda_runtime
  handler          = "handler.handler"
  role             = aws_iam_role.lambda.arn
  filename         = "${var.lambda_dist_dir}/round_state.zip"
  source_code_hash = filebase64sha256("${var.lambda_dist_dir}/round_state.zip")
  memory_size      = 256
  timeout          = 5

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }
  environment {
    variables = local.lambda_env_admin
  }
}

// --- Admin verify (token sanity check) ---
resource "aws_lambda_function" "round_verify" {
  function_name    = "${var.project}-round-verify"
  runtime          = local.lambda_runtime
  handler          = "handler.handler"
  role             = aws_iam_role.lambda.arn
  filename         = "${var.lambda_dist_dir}/round_verify.zip"
  source_code_hash = filebase64sha256("${var.lambda_dist_dir}/round_verify.zip")
  memory_size      = 128
  timeout          = 3

  // No VPC needed — only checks an env var.
  environment {
    variables = { ADMIN_TOKEN = var.admin_password }
  }
}

// --- Round info (HTTP) ---
resource "aws_lambda_function" "round_info" {
  function_name    = "${var.project}-round-info"
  runtime          = local.lambda_runtime
  handler          = "handler.handler"
  role             = aws_iam_role.lambda.arn
  filename         = "${var.lambda_dist_dir}/round_info.zip"
  source_code_hash = filebase64sha256("${var.lambda_dist_dir}/round_info.zip")
  memory_size      = 256
  timeout          = 5

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }
  environment {
    variables = local.lambda_env_common
  }
}

// --- WebSocket connect / disconnect ---
resource "aws_lambda_function" "ws_connect" {
  function_name    = "${var.project}-ws-connect"
  runtime          = local.lambda_runtime
  handler          = "handler.handler"
  role             = aws_iam_role.lambda.arn
  filename         = "${var.lambda_dist_dir}/ws_connect.zip"
  source_code_hash = filebase64sha256("${var.lambda_dist_dir}/ws_connect.zip")
  memory_size      = 128
  timeout          = 5

  environment {
    variables = local.lambda_env_common
  }
}

resource "aws_lambda_function" "ws_disconnect" {
  function_name    = "${var.project}-ws-disconnect"
  runtime          = local.lambda_runtime
  handler          = "handler.handler"
  role             = aws_iam_role.lambda.arn
  filename         = "${var.lambda_dist_dir}/ws_disconnect.zip"
  source_code_hash = filebase64sha256("${var.lambda_dist_dir}/ws_disconnect.zip")
  memory_size      = 128
  timeout          = 5

  environment {
    variables = local.lambda_env_common
  }
}

// --- Broadcaster (EventBridge-triggered, ticks 1Hz internally for ~55s) ---
resource "aws_lambda_function" "broadcaster" {
  function_name    = "${var.project}-broadcaster"
  runtime          = local.lambda_runtime
  handler          = "handler.handler"
  role             = aws_iam_role.lambda.arn
  filename         = "${var.lambda_dist_dir}/broadcaster.zip"
  source_code_hash = filebase64sha256("${var.lambda_dist_dir}/broadcaster.zip")
  memory_size      = 256
  timeout          = 70

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = merge(local.lambda_env_common, {
      WS_ENDPOINT            = "https://${aws_apigatewayv2_api.ws.id}.execute-api.${var.region}.amazonaws.com/${aws_apigatewayv2_stage.ws.name}"
      TICK_SECONDS           = "1.0"
      RUN_DURATION_SECONDS   = "55"
    })
  }
}

resource "aws_cloudwatch_event_rule" "broadcaster_tick" {
  name                = "${var.project}-broadcaster-tick"
  schedule_expression = "rate(1 minute)"
  // Dashboard now polls /round/current (HTTP), so the WS broadcaster is
  // dormant. Set is_enabled=true if reverting to WS push.
  state = "DISABLED"
}

resource "aws_cloudwatch_event_target" "broadcaster_tick" {
  rule      = aws_cloudwatch_event_rule.broadcaster_tick.name
  target_id = "broadcaster"
  arn       = aws_lambda_function.broadcaster.arn
}

resource "aws_lambda_permission" "broadcaster_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.broadcaster.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.broadcaster_tick.arn
}
