data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.project}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "lambda_policy" {
  // CloudWatch Logs
  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["*"]
  }

  // SQS for the worker
  statement {
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.vote.arn]
  }

  // DynamoDB tables
  statement {
    actions = [
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:GetItem",
      "dynamodb:Scan",
      "dynamodb:Query",
      "dynamodb:BatchWriteItem",
    ]
    resources = [
      aws_dynamodb_table.vote_logs.arn,
      aws_dynamodb_table.ws_connections.arn,
    ]
  }

  // API Gateway Management API for WebSocket post_to_connection.
  // Use explicit `*/POST/@connections/*` form — some VPC-endpoint paths
  // reject the bare `/*` wildcard with ForbiddenException.
  statement {
    actions = ["execute-api:ManageConnections"]
    resources = [
      "${aws_apigatewayv2_api.ws.execution_arn}/*/POST/@connections/*",
      "${aws_apigatewayv2_api.ws.execution_arn}/*/GET/@connections/*",
      "${aws_apigatewayv2_api.ws.execution_arn}/*/DELETE/@connections/*",
    ]
  }
}

resource "aws_iam_policy" "lambda" {
  name   = "${var.project}-lambda-policy"
  policy = data.aws_iam_policy_document.lambda_policy.json
}

resource "aws_iam_role_policy_attachment" "lambda" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.lambda.arn
}

// REST API → SQS direct integration role
data "aws_iam_policy_document" "apigw_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apigw_to_sqs" {
  name               = "${var.project}-apigw-sqs-role"
  assume_role_policy = data.aws_iam_policy_document.apigw_assume.json
}

data "aws_iam_policy_document" "apigw_to_sqs" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.vote.arn]
  }
}

resource "aws_iam_role_policy" "apigw_to_sqs" {
  role   = aws_iam_role.apigw_to_sqs.id
  policy = data.aws_iam_policy_document.apigw_to_sqs.json
}
