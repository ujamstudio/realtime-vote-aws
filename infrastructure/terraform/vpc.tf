// Minimal VPC: 2 private subnets across 2 AZs for ElastiCache + Lambda ENIs.
// No NAT gateway — Lambdas don't need internet egress (DynamoDB/SQS/APIGW use VPC endpoints).

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "this" {
  cidr_block           = "10.40.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "${var.project}-vpc" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(aws_vpc.this.cidr_block, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "${var.project}-private-${count.index}" }
}

resource "aws_security_group" "lambda" {
  name        = "${var.project}-lambda-sg"
  description = "Lambdas in VPC"
  vpc_id      = aws_vpc.this.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

// Self-referencing ingress on 443 so Lambdas in this SG can reach Interface
// VPC Endpoints (SQS, execute-api) that are also attached to this SG. Without
// this, the endpoint ENI silently drops the TCP SYN.
resource "aws_security_group_rule" "lambda_self_ingress_https" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.lambda.id
  source_security_group_id = aws_security_group.lambda.id
  description              = "Allow Lambda to Interface VPC Endpoints (same SG)"
}

resource "aws_security_group" "redis" {
  name        = "${var.project}-redis-sg"
  description = "ElastiCache Redis"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }
}

// VPC endpoints so Lambdas in private subnets can reach AWS APIs without NAT.
resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_vpc.this.default_route_table_id]
}

resource "aws_vpc_endpoint" "sqs" {
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${var.region}.sqs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.lambda.id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "execute_api" {
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${var.region}.execute-api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.lambda.id]
  private_dns_enabled = true
}
