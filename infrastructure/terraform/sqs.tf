// Standard queue (not FIFO) — duplicates are tolerated; UI debounces double-clicks.

resource "aws_sqs_queue" "vote_dlq" {
  name                       = "${var.project}-vote-dlq"
  message_retention_seconds  = 1209600 // 14d
}

resource "aws_sqs_queue" "vote" {
  name                       = "${var.project}-vote"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 3600
  receive_wait_time_seconds  = 0

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.vote_dlq.arn
    maxReceiveCount     = 5
  })
}
