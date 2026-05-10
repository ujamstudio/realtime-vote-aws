// PAY_PER_REQUEST as required: 200 TPS spikes are sub-cent on On-Demand.

resource "aws_dynamodb_table" "vote_logs" {
  name         = "${var.project}-vote-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "round_id"
  range_key    = "ts_uuid"

  attribute {
    name = "round_id"
    type = "S"
  }
  attribute {
    name = "ts_uuid"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "ws_connections" {
  name         = "${var.project}-ws-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connection_id"

  attribute {
    name = "connection_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}
