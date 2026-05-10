// WebSocket API for the admin dashboard.
// Routes: $connect, $disconnect (broadcast is server-initiated by the broadcaster Lambda).

resource "aws_apigatewayv2_api" "ws" {
  name                       = "${var.project}-ws"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

resource "aws_apigatewayv2_stage" "ws" {
  api_id      = aws_apigatewayv2_api.ws.id
  name        = "production"
  auto_deploy = true
}

// $connect
resource "aws_apigatewayv2_integration" "ws_connect" {
  api_id                    = aws_apigatewayv2_api.ws.id
  integration_type          = "AWS_PROXY"
  integration_uri           = aws_lambda_function.ws_connect.invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
}

resource "aws_apigatewayv2_route" "ws_connect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_connect.id}"
}

resource "aws_lambda_permission" "ws_connect" {
  statement_id  = "AllowWSConnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_connect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*"
}

// $disconnect
resource "aws_apigatewayv2_integration" "ws_disconnect" {
  api_id                    = aws_apigatewayv2_api.ws.id
  integration_type          = "AWS_PROXY"
  integration_uri           = aws_lambda_function.ws_disconnect.invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
}

resource "aws_apigatewayv2_route" "ws_disconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_disconnect.id}"
}

resource "aws_lambda_permission" "ws_disconnect" {
  statement_id  = "AllowWSDisconnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_disconnect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*"
}
