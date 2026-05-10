// HTTP API (cheaper than REST API, supports SQS direct integration via AWS_PROXY).
// Routes:
//   POST /vote                    → SQS SendMessage (direct)
//   GET  /round/current           → round_info Lambda
//   POST /admin/round/reset       → admin_reset Lambda

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.project}-http"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type", "x-admin-token"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_stage" "http" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

// --- POST /vote → SQS direct integration ---
resource "aws_apigatewayv2_integration" "vote_sqs" {
  api_id              = aws_apigatewayv2_api.http.id
  integration_type    = "AWS_PROXY"
  integration_subtype = "SQS-SendMessage"
  credentials_arn     = aws_iam_role.apigw_to_sqs.arn

  request_parameters = {
    QueueUrl    = aws_sqs_queue.vote.url
    MessageBody = "$request.body"
  }

  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "vote" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /vote"
  target    = "integrations/${aws_apigatewayv2_integration.vote_sqs.id}"
}

// --- GET /round/current → round_info ---
resource "aws_apigatewayv2_integration" "round_info" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.round_info.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "round_info" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /round/current"
  target    = "integrations/${aws_apigatewayv2_integration.round_info.id}"
}

resource "aws_lambda_permission" "round_info" {
  statement_id  = "AllowAPIGWInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.round_info.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

// --- POST /admin/round/reset → admin_reset ---
resource "aws_apigatewayv2_integration" "admin_reset" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.admin_reset.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "admin_reset" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /admin/round/reset"
  target    = "integrations/${aws_apigatewayv2_integration.admin_reset.id}"
}

resource "aws_lambda_permission" "admin_reset" {
  statement_id  = "AllowAPIGWInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.admin_reset.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

// --- POST /admin/round/song → admin_song ---
resource "aws_apigatewayv2_integration" "admin_song" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.admin_song.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "admin_song" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /admin/round/song"
  target    = "integrations/${aws_apigatewayv2_integration.admin_song.id}"
}

resource "aws_lambda_permission" "admin_song" {
  statement_id  = "AllowAPIGWInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.admin_song.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

// --- POST /admin/round/state → round_state ---
resource "aws_apigatewayv2_integration" "round_state" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.round_state.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "round_state" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /admin/round/state"
  target    = "integrations/${aws_apigatewayv2_integration.round_state.id}"
}

resource "aws_lambda_permission" "round_state" {
  statement_id  = "AllowAPIGWInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.round_state.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

// --- GET /admin/verify → round_verify ---
resource "aws_apigatewayv2_integration" "round_verify" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.round_verify.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "round_verify" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /admin/verify"
  target    = "integrations/${aws_apigatewayv2_integration.round_verify.id}"
}

resource "aws_lambda_permission" "round_verify" {
  statement_id  = "AllowAPIGWInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.round_verify.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
