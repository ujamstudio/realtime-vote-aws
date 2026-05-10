output "rest_api_url" {
  description = "Base URL for HTTP API (mobile + admin reset)"
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "websocket_url" {
  description = "WebSocket endpoint for the PC admin dashboard"
  value       = "wss://${aws_apigatewayv2_api.ws.id}.execute-api.${var.region}.amazonaws.com/${aws_apigatewayv2_stage.ws.name}"
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.this.cache_nodes[0].address
}

output "vote_logs_table" {
  value = aws_dynamodb_table.vote_logs.name
}

output "vote_queue_url" {
  value = aws_sqs_queue.vote.url
}

output "site_url" {
  description = "CloudFront URL for the voting + admin site"
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "site_bucket" {
  description = "S3 bucket name for the static site"
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id (for cache invalidation)"
  value       = aws_cloudfront_distribution.site.id
}
